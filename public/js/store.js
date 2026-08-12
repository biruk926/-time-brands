(function () {
    const CART_KEY = "timebrand_cart";

    let products = [];
    let cart = [];
    let currentUser = null;
    let activeCategory = "all";
    let searchQuery = "";
    let orderHistory = [];

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        currentUser = TimeAuth.getCachedUser();
        loadCart();
        setupEventListeners();
        updateUserUI();
        loadProducts();
        if (currentUser) loadOrders();
    }

    function setupEventListeners() {
        // Mobile nav
        document.getElementById("hamburger-btn").addEventListener("click", () => {
            document.getElementById("mobile-nav-overlay").classList.add("open");
        });
        document.getElementById("close-mobile-nav").addEventListener("click", () => {
            document.getElementById("mobile-nav-overlay").classList.remove("open");
        });

        // Search
        document.getElementById("search-btn").addEventListener("click", () => openSearch());
        document.getElementById("mobile-search-btn").addEventListener("click", () => openSearch());
        document.getElementById("close-search").addEventListener("click", closeSearch);
        document.getElementById("search-input").addEventListener("input", handleSearch);

        // Cart
        document.getElementById("cart-btn").addEventListener("click", openCart);
        document.getElementById("checkout-btn").addEventListener("click", handleCheckout);

        // Account
        document.getElementById("account-btn").addEventListener("click", () => TimeAuth.openAccountModal());
        document.getElementById("mobile-account-btn").addEventListener("click", () => TimeAuth.openAccountModal());
        document.getElementById("footer-account-btn").addEventListener("click", () => TimeAuth.openAccountModal());

        // Orders & Chat footer buttons
        document.getElementById("footer-orders-btn").addEventListener("click", () => {
            document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
        });
        document.getElementById("footer-chat-btn").addEventListener("click", openChat);

        // Drawer & modal close
        document.addEventListener("click", handleGlobalClicks);

        // Checkout form
        document.getElementById("checkout-form").addEventListener("submit", handleCheckoutSubmit);
        document.getElementById("checkout-back").addEventListener("click", checkoutBack);
        document.getElementById("checkout-next").addEventListener("click", checkoutNext);

        // Product grid delegation
        document.getElementById("product-grid").addEventListener("click", handleProductGridClick);
        document.getElementById("cart-items").addEventListener("click", handleCartItemClick);

        // Filters
        document.querySelectorAll(".filter-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                activeCategory = btn.dataset.filter;
                renderProducts();
            });
        });
    }

    function handleGlobalClicks(event) {
        const closeDrawer = event.target.closest("[data-close-drawer]");
        if (closeDrawer) {
            const drawer = closeDrawer.closest(".drawer");
            if (drawer) drawer.classList.remove("open");
            return;
        }

        const closeModal = event.target.closest("[data-close-modal]");
        if (closeModal) {
            const modal = closeModal.closest(".modal");
            if (modal) modal.classList.remove("open");
            return;
        }
    }

    // ------------------------------------------------
    // Products
    // ------------------------------------------------
    async function loadProducts() {
        const grid = document.getElementById("product-grid");
        grid.innerHTML = '<div class="loading-skeleton">Loading products...</div>';
        try {
            const response = await TimeAPI.getProducts();
            products = response.products || [];
            renderProducts();
            renderFilteredSections();
        } catch (error) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>UNABLE TO CONNECT</p>
                    <p>We couldn't connect to TIME BRAND right now.</p>
                    <button class="btn btn-outline" onclick="location.reload()">TRY AGAIN</button>
                </div>
            `;
        }
    }

    function renderProducts() {
        const grid = document.getElementById("product-grid");
        if (!grid) return;

        let filtered = products.filter((p) => p.active !== false);

        if (activeCategory !== "all") {
            filtered = filtered.filter((p) => p.category === activeCategory);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (p) =>
                    p.name.toLowerCase().includes(q) ||
                    p.category.toLowerCase().includes(q)
            );
        }

        if (!filtered.length) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>NO SNEAKERS AVAILABLE</p>
                    <p>Check back soon for our latest collection.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered
            .map(
                (product) => `
                <article class="product-card" data-id="${product.id}">
                    <div class="product-image-wrapper">
                        <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}"
                             alt="${escapeHtml(product.name)}"
                             loading="lazy"
                             onerror="this.src='/assets/watch-placeholder.svg';this.onerror=null;" />
                    </div>
                    <div class="product-card-info">
                        <span class="product-category">${escapeHtml(product.category)}</span>
                        <h3 class="product-name">${escapeHtml(product.name)}</h3>
                        <p class="product-description">${escapeHtml(product.description || "")}</p>
                        <span class="product-price">${formatPrice(product.price)} ${escapeHtml(product.currency)}</span>
                        <span class="product-stock">Stock: ${product.stock}</span>
                        <button class="add-to-cart-btn" data-id="${product.id}" ${product.stock < 1 ? "disabled" : ""}>
                            ${product.stock < 1 ? "OUT OF STOCK" : "ADD TO CART"}
                        </button>
                    </div>
                </article>
            `
            )
            .join("");
    }

    function renderFilteredSections() {
        // New arrivals: filter by featured or category New (if exists)
        const newArrivalsGrid = document.getElementById("new-arrivals-grid");
        if (newArrivalsGrid) {
            const newArrivals = products.filter((p) => p.category === "New" || p.featured === true);
            if (!newArrivals.length) {
                newArrivalsGrid.innerHTML = '<div class="empty-state">No new arrivals yet.</div>';
            } else {
                newArrivalsGrid.innerHTML = newArrivals.map(renderProductCard).join("");
            }
        }

        const limitedGrid = document.getElementById("limited-grid");
        if (limitedGrid) {
            const limited = products.filter((p) => p.category === "Limited" || p.featured === true);
            if (!limited.length) {
                limitedGrid.innerHTML = '<div class="empty-state">No limited edition items.</div>';
            } else {
                limitedGrid.innerHTML = limited.map(renderProductCard).join("");
            }
        }
    }

    function renderProductCard(product) {
        return `
            <article class="product-card" data-id="${product.id}">
                <div class="product-image-wrapper">
                    <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(product.name)}" loading="lazy" />
                </div>
                <div class="product-card-info">
                    <span class="product-category">${escapeHtml(product.category)}</span>
                    <h3 class="product-name">${escapeHtml(product.name)}</h3>
                    <p class="product-description">${escapeHtml(product.description || "")}</p>
                    <span class="product-price">${formatPrice(product.price)} ${escapeHtml(product.currency)}</span>
                    <span class="product-stock">Stock: ${product.stock}</span>
                    <button class="add-to-cart-btn" data-id="${product.id}" ${product.stock < 1 ? "disabled" : ""}>
                        ${product.stock < 1 ? "OUT OF STOCK" : "ADD TO CART"}
                    </button>
                </div>
            </article>
        `;
    }

    function handleProductGridClick(event) {
        const addBtn = event.target.closest(".add-to-cart-btn");
        if (addBtn) {
            event.stopPropagation();
            const id = Number(addBtn.dataset.id);
            addToCart(id);
            return;
        }

        const card = event.target.closest(".product-card");
        if (card) {
            const id = Number(card.dataset.id);
            openProductDetail(id);
        }
    }

    async function openProductDetail(productId) {
        try {
            const product = products.find((p) => p.id === productId);
            if (!product) return;
            renderProductModal(product);
            openModal("product-modal");
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    function renderProductModal(product) {
        const container = document.getElementById("product-detail-content");
        container.innerHTML = `
            <div class="product-detail-image">
                <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(product.name)}" />
            </div>
            <div class="product-detail-info">
                <span class="product-detail-category">${escapeHtml(product.category)}</span>
                <h2 class="product-detail-name">${escapeHtml(product.name)}</h2>
                <p class="product-detail-description">${escapeHtml(product.description || "")}</p>
                <p class="product-detail-price">${formatPrice(product.price)} ${escapeHtml(product.currency)}</p>
                <p class="product-detail-stock">Availability: ${product.stock > 0 ? `In Stock (${product.stock})` : "Out of Stock"}</p>
                <div class="product-detail-actions">
                    <button class="btn btn-primary detail-add-to-cart" data-id="${product.id}" ${product.stock < 1 ? "disabled" : ""}>
                        ADD TO CART
                    </button>
                </div>
            </div>
        `;
        container.querySelector(".detail-add-to-cart")?.addEventListener("click", (e) => {
            const id = Number(e.target.dataset.id);
            addToCart(id);
            closeModal("product-modal");
        });
    }

    // ------------------------------------------------
    // Search
    // ------------------------------------------------
    function openSearch() {
        document.getElementById("search-overlay").classList.add("open");
        document.getElementById("search-input").focus();
        document.getElementById("search-input").value = "";
        searchQuery = "";
        document.getElementById("search-results").innerHTML = "";
    }

    function closeSearch() {
        document.getElementById("search-overlay").classList.remove("open");
        searchQuery = "";
        renderProducts();
    }

    function handleSearch(event) {
        searchQuery = event.target.value.trim();
        renderProducts();
        const results = document.getElementById("search-results");
        if (!searchQuery) {
            results.innerHTML = "";
            return;
        }
        const matches = products.filter(
            (p) =>
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
        results.innerHTML = matches
            .map(
                (p) => `
                <div class="search-result-item" data-id="${p.id}">
                    <img src="${escapeHtml(p.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(p.name)}" />
                    <div>
                        <strong>${escapeHtml(p.name)}</strong>
                        <div>${formatPrice(p.price)} ${escapeHtml(p.currency)}</div>
                    </div>
                </div>
            `
            )
            .join("");
        results.querySelectorAll(".search-result-item").forEach((item) => {
            item.addEventListener("click", () => {
                const id = Number(item.dataset.id);
                closeSearch();
                openProductDetail(id);
            });
        });
    }

    // ------------------------------------------------
    // Cart
    // ------------------------------------------------
    function loadCart() {
        try {
            const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
            cart = Array.isArray(stored) ? stored : [];
        } catch (error) {
            cart = [];
        }
        updateCartBadge();
    }

    function saveCart() {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
        } catch (error) {
            // ignore
        }
        updateCartBadge();
    }

    function updateCartBadge() {
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
        document.getElementById("cart-count").textContent = count;
    }

    function openCart() {
        renderCart();
        document.getElementById("cart-drawer").classList.add("open");
    }

    function renderCart() {
        const container = document.getElementById("cart-items");
        const subtotalEl = document.getElementById("cart-subtotal");
        if (!container) return;

        if (!cart.length) {
            container.innerHTML = '<div class="empty-state">YOUR CART IS EMPTY</div>';
            subtotalEl.textContent = "0 ETB";
            return;
        }

        let total = 0;
        container.innerHTML = cart
            .map((item) => {
                const product = products.find((p) => String(p.id) === String(item.productId));
                if (!product) return "";
                const subtotal = Number(product.price) * item.quantity;
                total += subtotal;
                return `
                <div class="cart-item" data-id="${product.id}">
                    <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(product.name)}" />
                    <div class="cart-item-info">
                        <div class="cart-item-name">${escapeHtml(product.name)}</div>
                        <div class="cart-item-price">${formatPrice(product.price)} ${escapeHtml(product.currency)}</div>
                    </div>
                    <div class="cart-qty">
                        <button class="cart-minus" data-id="${product.id}" aria-label="Decrease quantity">−</button>
                        <span>${item.quantity}</span>
                        <button class="cart-plus" data-id="${product.id}" aria-label="Increase quantity">+</button>
                    </div>
                    <button class="cart-remove" data-id="${product.id}" aria-label="Remove item">×</button>
                </div>
            `;
            })
            .join("");

        subtotalEl.textContent = `${formatPrice(total)} ${products[0]?.currency || "ETB"}`;
    }

    function handleCartItemClick(event) {
        const id = Number(event.target.dataset.id);
        if (!id) return;

        if (event.target.classList.contains("cart-minus")) {
            changeQuantity(id, -1);
        } else if (event.target.classList.contains("cart-plus")) {
            changeQuantity(id, 1);
        } else if (event.target.classList.contains("cart-remove")) {
            removeFromCart(id);
        }
    }

    function addToCart(productId, quantity = 1) {
        const product = products.find((p) => Number(p.id) === productId);
        if (!product) return;
        if (Number(product.stock) < 1) {
            showToast("This product is out of stock.", "error");
            return;
        }

        const existing = cart.find((item) => Number(item.productId) === productId);
        if (existing) {
            existing.quantity = Math.min(Number(existing.quantity) + quantity, Number(product.stock));
        } else {
            cart.push({ productId, quantity });
        }
        saveCart();
        showToast("Product added to cart.", "success");
    }

    function changeQuantity(productId, delta) {
        const product = products.find((p) => Number(p.id) === productId);
        if (!product) return;

        const item = cart.find((i) => Number(i.productId) === productId);
        if (!item) return;

        item.quantity += delta;
        if (item.quantity < 1) {
            removeFromCart(productId);
            return;
        }
        if (item.quantity > Number(product.stock)) {
            item.quantity = Number(product.stock);
            showToast("Maximum available stock reached.", "error");
        }
        saveCart();
        renderCart();
    }

    function removeFromCart(productId) {
        cart = cart.filter((i) => Number(i.productId) !== productId);
        saveCart();
        renderCart();
    }

    // ------------------------------------------------
    // Checkout
    // ------------------------------------------------
    function handleCheckout() {
        if (!cart.length) {
            showToast("Your cart is empty.", "error");
            return;
        }

        TimeAuth.requireUser()
            .then((user) => {
                currentUser = user;
                updateUserUI();
                openCheckout();
            })
            .catch((error) => {
                if (error.message !== "Cancelled") showToast(error.message, "error");
            });
    }

    function openCheckout() {
        document.getElementById("checkout-name").value = currentUser.name || "";
        document.getElementById("checkout-email").value = currentUser.email || "";
        document.getElementById("checkout-phone").value = currentUser.phone || "";
        goToStep(1);
        openModal("checkout-modal");
        renderCheckoutSummary();
    }

    function goToStep(step) {
        document.querySelectorAll(".checkout-step").forEach((el) => {
            el.classList.remove("active");
            const stepNum = Number(el.id.replace("checkout-step-", ""));
            if (stepNum === step) el.classList.add("active");
        });
        document.querySelectorAll(".step").forEach((el) => {
            el.classList.remove("active");
            if (Number(el.dataset.step) === step) el.classList.add("active");
        });
        document.getElementById("checkout-back").style.display = step > 1 ? "inline-flex" : "none";
        document.getElementById("checkout-next").textContent = step === 3 ? "PLACE ORDER" : "NEXT";
    }

    function checkoutBack() {
        const current = getCurrentStep();
        if (current > 1) goToStep(current - 1);
    }

    function checkoutNext() {
        const current = getCurrentStep();
        if (current < 3) {
            if (current === 1) {
                const name = document.getElementById("checkout-name").value.trim();
                const email = document.getElementById("checkout-email").value.trim();
                if (!name || !email) {
                    showToast("Please fill in your name and email.", "error");
                    return;
                }
            } else if (current === 2) {
                const address = document.getElementById("checkout-address").value.trim();
                const city = document.getElementById("checkout-city").value.trim();
                if (!address || !city) {
                    showToast("Please fill in address and city.", "error");
                    return;
                }
            }
            goToStep(current + 1);
        } else {
            handleCheckoutSubmit(new Event("submit"));
        }
    }

    function getCurrentStep() {
        const active = document.querySelector(".checkout-step.active");
        return Number(active.id.replace("checkout-step-", ""));
    }

    function renderCheckoutSummary() {
        const container = document.getElementById("checkout-summary");
        if (!container) return;
        let total = 0;
        container.innerHTML = cart
            .map((item) => {
                const product = products.find((p) => String(p.id) === String(item.productId));
                if (!product) return "";
                const subtotal = Number(product.price) * item.quantity;
                total += subtotal;
                return `
                <div class="checkout-summary-item">
                    <span>${escapeHtml(product.name)} × ${item.quantity}</span>
                    <span>${formatPrice(subtotal)} ${escapeHtml(product.currency)}</span>
                </div>
            `;
            })
            .join("");
        container.innerHTML += `
            <div class="checkout-total">
                <span>TOTAL</span>
                <span>${formatPrice(total)} ${products[0]?.currency || "ETB"}</span>
            </div>
        `;
    }

    async function handleCheckoutSubmit(event) {
        event.preventDefault();
        const errorBox = document.getElementById("checkout-error");
        errorBox.textContent = "";

        if (!currentUser || !cart.length) {
            errorBox.textContent = "Cart or customer information is missing.";
            return;
        }

        const name = document.getElementById("checkout-name").value.trim();
        const email = document.getElementById("checkout-email").value.trim();
        const phone = document.getElementById("checkout-phone").value.trim();
        const address = document.getElementById("checkout-address").value.trim();
        const city = document.getElementById("checkout-city").value.trim();
        const notes = document.getElementById("checkout-notes").value.trim();
        const paymentMethod = document.getElementById("checkout-payment-method").value;
        const paymentReference = document.getElementById("checkout-payment-reference").value.trim();

        const orderPayload = {
            customer: {
                userId: currentUser.id,
                userName: name,
                email: email,
                phone: phone || "",
                shippingAddress: `${address}, ${city}${notes ? " - " + notes : ""}`,
                paymentMethod: paymentMethod,
                paymentReference: paymentReference,
            },
            items: cart.map((item) => ({
                productId: Number(item.productId),
                quantity: Number(item.quantity),
            })),
        };

        try {
            const response = await TimeAPI.createOrder(orderPayload);
            if (response.success) {
                cart = [];
                saveCart();
                closeModal("checkout-modal");
                showToast(`Order #${response.order.id} placed successfully!`, "success");
                loadOrders();
                renderCheckoutConfirmation(response.order);
            }
        } catch (error) {
            errorBox.textContent = error.message;
            showToast(error.message, "error");
        }
    }

    function renderCheckoutConfirmation(order) {
        const modal = document.createElement("div");
        modal.className = "modal open";
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>ORDER CONFIRMED</h3>
                    <button class="close-modal">×</button>
                </div>
                <p>Thank you for choosing TIME BRAND.</p>
                <p>Order #${order.id}</p>
                <p>Status: <span class="order-status-badge status-${order.status}">${order.status}</span></p>
                <button class="btn btn-primary" id="view-order-btn">VIEW MY ORDER</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector(".close-modal").addEventListener("click", () => modal.remove());
        modal.querySelector("#view-order-btn").addEventListener("click", () => {
            modal.remove();
            document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
        });
    }

    // ------------------------------------------------
    // Orders
    // ------------------------------------------------
    async function loadOrders() {
        if (!currentUser) return;
        const container = document.getElementById("order-history");
        if (!container) return;
        container.innerHTML = '<div class="loading-skeleton">Loading orders...</div>';
        try {
            const response = await TimeAPI.getOrders(currentUser.id);
            orderHistory = response.orders || [];
            renderOrders();
        } catch (error) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>UNABLE TO LOAD ORDERS</p>
                    <p>${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    function renderOrders() {
        const container = document.getElementById("order-history");
        if (!container) return;
        if (!orderHistory.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>YOUR JOURNEY HASN'T STARTED YET</p>
                    <p>Your TIME BRAND orders will appear here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = orderHistory
            .slice()
            .reverse()
            .map((order) => {
                return `
                <div class="order-card">
                    <div class="order-card-header">
                        <span class="order-id">Order #${order.id}</span>
                        <span class="order-status-badge status-${order.status}">${escapeHtml(order.status)}</span>
                    </div>
                    <div class="order-details">
                        <p>Date: ${formatDate(order.createdAt)}</p>
                        <ul>
                            ${order.items
                                .map(
                                    (item) =>
                                        `<li>${escapeHtml(item.name)} × ${item.quantity} = ${formatPrice(item.subtotal)} ${escapeHtml(order.currency)}</li>`
                                )
                                .join("")}
                        </ul>
                        <p><strong>Total:</strong> ${formatPrice(order.total)} ${escapeHtml(order.currency)}</p>
                        ${order.rejectionReason ? `<p style="color:var(--danger);">Reason: ${escapeHtml(order.rejectionReason)}</p>` : ""}
                    </div>
                    ${renderOrderTimeline(order.status)}
                </div>
            `;
            })
            .join("");
    }

    function renderOrderTimeline(status) {
        const steps = ["pending", "approved", "delivered"];
        if (status === "rejected") {
            return `<div class="order-timeline">
                <div class="timeline-step"><div class="timeline-dot active"></div><span class="timeline-label">PLACED</span></div>
                <div class="timeline-line active"></div>
                <div class="timeline-step"><div class="timeline-dot active"></div><span class="timeline-label">REJECTED</span></div>
            </div>`;
        }
        let html = `<div class="order-timeline">`;
        const statusIndex = steps.indexOf(status);
        steps.forEach((step, idx) => {
            if (idx > 0) {
                html += `<div class="timeline-line ${idx <= statusIndex ? "active" : ""}"></div>`;
            }
            html += `<div class="timeline-step">
                <div class="timeline-dot ${idx <= statusIndex ? "active" : ""}"></div>
                <span class="timeline-label">${step.toUpperCase()}</span>
            </div>`;
        });
        html += `</div>`;
        return html;
    }

    // ------------------------------------------------
    // Account
    // ------------------------------------------------
    function updateUserUI() {
        const accountBtn = document.getElementById("account-btn");
        if (accountBtn) {
            accountBtn.textContent = currentUser ? currentUser.name.split(" ")[0] : "Account";
        }
    }

    window.onUserUpdate = function (user) {
        currentUser = user;
        updateUserUI();
        loadOrders();
    };

    // ------------------------------------------------
    // Chat
    // ------------------------------------------------
    function openChat() {
        if (window.TimeChat && typeof TimeChat.openChat === "function") {
            TimeChat.openChat();
        }
    }

    // ------------------------------------------------
    // Helpers
    // ------------------------------------------------
    function openModal(id) {
        document.getElementById(id)?.classList.add("open");
    }

    function closeModal(id) {
        document.getElementById(id)?.classList.remove("open");
    }

    function showToast(message, type = "info") {
        const container = document.getElementById("toast-container");
        if (!container) return;
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function formatPrice(value) {
        return Number(value).toLocaleString();
    }

    function formatDate(isoString) {
        if (!isoString) return "";
        try {
            return new Date(isoString).toLocaleDateString();
        } catch (error) {
            return isoString;
        }
    }

    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
})();