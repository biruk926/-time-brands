/**
 * TIME BRAND - Customer Storefront
 * Handles products, cart, checkout, order history, and payment upload.
 */
(function () {
    const CART_KEY = "timebrand_cart";

    let products = [];
    let cart = [];
    let currentUser = null;
    let activeCategory = "all";
    let searchQuery = "";

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
        // Mobile navigation
        const hamburger = document.getElementById("hamburger-btn");
        if (hamburger) hamburger.addEventListener("click", () => document.getElementById("mobile-nav-overlay").classList.add("open"));
        const closeMobileNav = document.getElementById("close-mobile-nav");
        if (closeMobileNav) closeMobileNav.addEventListener("click", () => document.getElementById("mobile-nav-overlay").classList.remove("open"));

        // Search
        document.getElementById("search-btn")?.addEventListener("click", openSearch);
        document.getElementById("mobile-search-btn")?.addEventListener("click", openSearch);
        document.getElementById("close-search")?.addEventListener("click", closeSearch);
        document.getElementById("search-input")?.addEventListener("input", handleSearch);

        // Cart
        document.getElementById("cart-btn")?.addEventListener("click", openCart);
        document.getElementById("checkout-btn")?.addEventListener("click", handleCheckout);

        // Account
        document.getElementById("account-btn")?.addEventListener("click", () => TimeAuth.openAccountModal());
        document.getElementById("mobile-account-btn")?.addEventListener("click", () => TimeAuth.openAccountModal());
        document.getElementById("footer-account-btn")?.addEventListener("click", () => TimeAuth.openAccountModal());

        // Footer buttons
        document.getElementById("footer-orders-btn")?.addEventListener("click", () => document.getElementById("orders-section").scrollIntoView({ behavior: "smooth" }));
        document.getElementById("footer-chat-btn")?.addEventListener("click", () => TimeChat.openChat());

        // Checkout form
        document.getElementById("checkout-form")?.addEventListener("submit", handleCheckoutSubmit);
        document.getElementById("checkout-back")?.addEventListener("click", checkoutBack);
        document.getElementById("checkout-next")?.addEventListener("click", checkoutNext);

        // Product grid
        document.getElementById("product-grid")?.addEventListener("click", handleProductGridClick);
        document.getElementById("cart-items")?.addEventListener("click", handleCartItemClick);

        // Filters
        document.querySelectorAll(".filter-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                activeCategory = btn.dataset.filter;
                renderProducts();
            });
        });

        // Copy payment account buttons
        document.querySelectorAll(".copy-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                navigator.clipboard?.writeText(btn.dataset.account)
                    .then(() => showToast("Copied: " + btn.dataset.account, "success"))
                    .catch(() => showToast("Failed to copy", "error"));
            });
        });

        // Payment proof upload
        document.getElementById("checkout-payment-proof")?.addEventListener("change", handlePaymentProofUpload);

        // Global click handling for drawers and modals
        document.addEventListener("click", handleGlobalClicks);
    }

    function handleGlobalClicks(e) {
        if (e.target.closest("[data-close-drawer]")) {
            const drawer = e.target.closest(".drawer");
            if (drawer) drawer.classList.remove("open");
        }
        if (e.target.closest("[data-close-modal]")) {
            const modal = e.target.closest(".modal");
            if (modal) modal.classList.remove("open");
        }
    }

    // ============================================================
    // Payment Proof Upload
    // ============================================================
    function handlePaymentProofUpload(e) {
        const file = e.target.files[0];
        const preview = document.getElementById("payment-proof-preview");
        if (!preview) return;
        if (!file) {
            preview.innerHTML = "";
            return;
        }
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) {
            showToast("Invalid file type. Please upload JPG, PNG, or WEBP.", "error");
            e.target.value = "";
            preview.innerHTML = "";
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast("File too large. Maximum 5 MB.", "error");
            e.target.value = "";
            preview.innerHTML = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            preview.innerHTML = `<img src="${reader.result}" alt="Payment proof preview" />`;
        };
        reader.readAsDataURL(file);
    }

    // ============================================================
    // Product Loading & Rendering
    // ============================================================
    async function loadProducts() {
        const grid = document.getElementById("product-grid");
        if (!grid) return;
        grid.innerHTML = '<div class="loading-skeleton">Loading products...</div>';
        try {
            const response = await TimeAPI.getProducts();
            products = response.products || [];
            renderProducts();
            renderFilteredSections();
        } catch (error) {
            grid.innerHTML = `<div class="empty-state">UNABLE TO CONNECT<br/>${escapeHtml(error.message)}</div>`;
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
                (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
            );
        }
        if (!filtered.length) {
            grid.innerHTML = `<div class="empty-state">NO PRODUCTS AVAILABLE</div>`;
            return;
        }
        grid.innerHTML = filtered.map((p) => renderProductCard(p)).join("");
    }

    function renderFilteredSections() {
        const newArrivals = products.filter((p) => p.category === "New" || p.featured === true);
        const limited = products.filter((p) => p.category === "Limited" || p.featured === true);
        const newGrid = document.getElementById("new-arrivals-grid");
        const limitedGrid = document.getElementById("limited-grid");
        if (newGrid) {
            newGrid.innerHTML = newArrivals.length
                ? newArrivals.map(renderProductCard).join("")
                : `<div class="empty-state">No new arrivals yet.</div>`;
        }
        if (limitedGrid) {
            limitedGrid.innerHTML = limited.length
                ? limited.map(renderProductCard).join("")
                : `<div class="empty-state">No limited edition items.</div>`;
        }
    }

    function renderProductCard(product) {
        return `
            <article class="product-card" data-id="${product.id}">
                <div class="product-image-wrapper">
                    <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.src='/assets/watch-placeholder.svg';this.onerror=null;" />
                </div>
                <div class="product-card-info">
                    <span class="product-category">${escapeHtml(product.category)}</span>
                    <h3 class="product-name">${escapeHtml(product.name)}</h3>
                    <p class="product-description">${escapeHtml(product.description || "")}</p>
                    <span class="product-price">${formatPrice(product.price)} ${escapeHtml(product.currency || "ETB")}</span>
                    <span class="product-stock">Stock: ${product.stock}</span>
                    <button class="add-to-cart-btn" data-id="${product.id}" ${product.stock < 1 ? "disabled" : ""}>
                        ${product.stock < 1 ? "OUT OF STOCK" : "ADD TO CART"}
                    </button>
                </div>
            </article>
        `;
    }

    function handleProductGridClick(e) {
        const addBtn = e.target.closest(".add-to-cart-btn");
        if (addBtn) {
            e.stopPropagation();
            addToCart(Number(addBtn.dataset.id));
            return;
        }
        const card = e.target.closest(".product-card");
        if (card) {
            openProductDetail(Number(card.dataset.id));
        }
    }

    function openProductDetail(id) {
        const product = products.find((p) => p.id === id);
        if (!product) return;
        const container = document.getElementById("product-detail-content");
        if (!container) return;
        container.innerHTML = `
            <div class="product-detail-image">
                <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(product.name)}" />
            </div>
            <div class="product-detail-info">
                <span class="product-detail-category">${escapeHtml(product.category)}</span>
                <h3 class="product-detail-name">${escapeHtml(product.name)}</h3>
                <p class="product-detail-description">${escapeHtml(product.description || "")}</p>
                <p class="product-detail-price">${formatPrice(product.price)} ${escapeHtml(product.currency || "ETB")}</p>
                <p class="product-detail-stock">Availability: ${product.stock > 0 ? `In Stock (${product.stock})` : "Out of Stock"}</p>
                ${product.sizes && product.sizes.length ? `<p>Sizes: ${escapeHtml(product.sizes.join(", "))}</p>` : ""}
                <button class="btn btn-primary detail-add-to-cart" data-id="${product.id}" ${product.stock < 1 ? "disabled" : ""}>ADD TO CART</button>
            </div>
        `;
        container.querySelector(".detail-add-to-cart")?.addEventListener("click", (e) => {
            addToCart(Number(e.target.dataset.id));
            document.getElementById("product-modal")?.classList.remove("open");
        });
        document.getElementById("product-modal")?.classList.add("open");
    }

    // ============================================================
    // Search
    // ============================================================
    function openSearch() {
        document.getElementById("search-overlay")?.classList.add("open");
        const input = document.getElementById("search-input");
        if (input) {
            input.value = "";
            input.focus();
        }
        searchQuery = "";
        document.getElementById("search-results").innerHTML = "";
    }

    function closeSearch() {
        document.getElementById("search-overlay")?.classList.remove("open");
        searchQuery = "";
        renderProducts();
    }

    function handleSearch(e) {
        searchQuery = e.target.value.trim();
        renderProducts();
        const results = document.getElementById("search-results");
        if (!searchQuery) {
            results.innerHTML = "";
            return;
        }
        const matches = products.filter(
            (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
        results.innerHTML = matches
            .map(
                (p) => `
                <div class="search-result-item" data-id="${p.id}">
                    <img src="${escapeHtml(p.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(p.name)}" />
                    <div>
                        <strong>${escapeHtml(p.name)}</strong>
                        <div>${formatPrice(p.price)} ${escapeHtml(p.currency || "ETB")}</div>
                    </div>
                </div>
            `
            )
            .join("");
        results.querySelectorAll(".search-result-item").forEach((item) => {
            item.addEventListener("click", () => {
                closeSearch();
                openProductDetail(Number(item.dataset.id));
            });
        });
    }

    // ============================================================
    // Cart Management
    // ============================================================
    function loadCart() {
        try {
            const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
            cart = Array.isArray(stored) ? stored : [];
        } catch (error) {
            console.error("[CART] Failed to parse cart:", error);
            cart = [];
        }
        updateCartBadge();
    }

    function saveCart() {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
        } catch (error) {
            console.error("[CART] Failed to save cart:", error);
        }
        updateCartBadge();
    }

    function updateCartBadge() {
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
        const badge = document.getElementById("cart-count");
        if (badge) badge.textContent = count;
    }

    function openCart() {
        renderCart();
        document.getElementById("cart-drawer")?.classList.add("open");
    }

    function renderCart() {
        const container = document.getElementById("cart-items");
        const subtotalEl = document.getElementById("cart-subtotal");
        if (!container || !subtotalEl) return;
        if (!cart.length) {
            container.innerHTML = `<div class="empty-state">YOUR CART IS EMPTY</div>`;
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
                    <div class="cart-item">
                        <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}" alt="${escapeHtml(product.name)}" />
                        <div class="cart-item-info">
                            <div class="cart-item-name">${escapeHtml(product.name)}</div>
                            <div class="cart-item-price">${formatPrice(product.price)} ${escapeHtml(product.currency || "ETB")}</div>
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
        subtotalEl.textContent = `${formatPrice(total)} ETB`;
    }

    function handleCartItemClick(e) {
        const id = Number(e.target.dataset.id);
        if (!id) return;
        if (e.target.classList.contains("cart-minus")) {
            changeQuantity(id, -1);
        } else if (e.target.classList.contains("cart-plus")) {
            changeQuantity(id, 1);
        } else if (e.target.classList.contains("cart-remove")) {
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
            existing.quantity = Math.min(existing.quantity + quantity, Number(product.stock));
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

    // ============================================================
    // Checkout
    // ============================================================
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
        document.getElementById("checkout-name").value = currentUser?.name || "";
        document.getElementById("checkout-email").value = currentUser?.email || "";
        document.getElementById("checkout-phone").value = currentUser?.phone || "";
        goToStep(1);
        document.getElementById("checkout-modal")?.classList.add("open");
        renderCheckoutSummary();
    }

    function goToStep(step) {
        document.querySelectorAll(".checkout-step").forEach((el) => el.classList.remove("active"));
        document.querySelectorAll(".step").forEach((el) => el.classList.remove("active"));
        document.getElementById(`checkout-step-${step}`)?.classList.add("active");
        document.querySelector(`.step[data-step="${step}"]`)?.classList.add("active");
        const backBtn = document.getElementById("checkout-back");
        if (backBtn) backBtn.style.display = step > 1 ? "inline-flex" : "none";
        const nextBtn = document.getElementById("checkout-next");
        if (nextBtn) nextBtn.textContent = step === 4 ? "SUBMIT ORDER" : "NEXT";
    }

    function checkoutBack() {
        const current = getCurrentStep();
        if (current > 1) goToStep(current - 1);
    }

    function getCurrentStep() {
        const active = document.querySelector(".checkout-step.active");
        return active ? Number(active.id.replace("checkout-step-", "")) : 1;
    }

    function checkoutNext() {
        const current = getCurrentStep();
        if (current < 4) {
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
            } else if (current === 3) {
                const reference = document.getElementById("checkout-payment-reference").value.trim();
                if (!reference) {
                    showToast("Please enter payment reference.", "error");
                    return;
                }
            }
            goToStep(current + 1);
        } else {
            handleCheckoutSubmit(new Event("submit"));
        }
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
                return `<div class="checkout-summary-item"><span>${escapeHtml(product.name)} × ${item.quantity}</span><span>${formatPrice(subtotal)} ETB</span></div>`;
            })
            .join("");
        container.innerHTML += `<div class="checkout-total"><span>TOTAL</span><span>${formatPrice(total)} ETB</span></div>`;
    }

    async function handleCheckoutSubmit(e) {
        e.preventDefault();
        const errBox = document.getElementById("checkout-error");
        if (errBox) errBox.textContent = "";
        if (!currentUser || !cart.length) {
            if (errBox) errBox.textContent = "Cart or customer information missing.";
            return;
        }
        const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || "telebirr";
        const paymentReference = document.getElementById("checkout-payment-reference").value.trim();
        const proofFile = document.getElementById("checkout-payment-proof")?.files[0];
        if (!proofFile) {
            if (errBox) errBox.textContent = "Payment screenshot is required.";
            return;
        }
        const base64 = await fileToBase64(proofFile);
        const payload = {
            customer: {
                userId: currentUser.id,
                userName: document.getElementById("checkout-name").value.trim(),
                email: document.getElementById("checkout-email").value.trim(),
                phone: document.getElementById("checkout-phone").value.trim(),
                shippingAddress: `${document.getElementById("checkout-address").value.trim()}, ${document.getElementById("checkout-city").value.trim()}`,
                paymentMethod,
                paymentReference,
            },
            paymentScreenshotBase64: base64,
            items: cart.map((item) => ({
                productId: Number(item.productId),
                quantity: Number(item.quantity),
            })),
        };
        try {
            const response = await TimeAPI.createOrder(payload);
            if (response.success) {
                cart = [];
                saveCart();
                document.getElementById("checkout-modal")?.classList.remove("open");
                showToast(`Order #${response.order.id} placed successfully!`, "success");
                loadOrders();
            }
        } catch (error) {
            if (errBox) errBox.textContent = error.message;
            showToast(error.message, "error");
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ============================================================
    // Order History
    // ============================================================
    async function loadOrders() {
        if (!currentUser) return;
        const container = document.getElementById("order-history");
        if (!container) return;
        container.innerHTML = '<div class="loading-skeleton">Loading orders...</div>';
        try {
            const response = await TimeAPI.getOrders(currentUser.id);
            const orders = response.orders || [];
            if (!orders.length) {
                container.innerHTML = `<div class="empty-state">YOUR JOURNEY HASN'T STARTED YET<br/>Your TIME BRAND orders will appear here.</div>`;
                return;
            }
            container.innerHTML = orders
                .slice()
                .reverse()
                .map(
                    (order) => `
                    <div class="admin-card">
                        <div class="admin-card-header">
                            <strong>Order #${order.id}</strong>
                            <span class="order-status-badge status-${order.status}">${escapeHtml(order.status)}</span>
                        </div>
                        <ul class="order-items">
                            ${order.items
                                .map(
                                    (item) =>
                                        `<li>${escapeHtml(item.name)} × ${item.quantity} = ${formatPrice(item.subtotal)} ${escapeHtml(order.currency || "ETB")}</li>`
                                )
                                .join("")}
                        </ul>
                        <p><strong>Total:</strong> ${formatPrice(order.total)} ${escapeHtml(order.currency || "ETB")}</p>
                        <p><strong>Payment:</strong> ${escapeHtml(order.paymentMethod)} (${escapeHtml(order.paymentReference)})</p>
                        <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                        ${order.rejectionReason ? `<p class="rejection-reason">Reason: ${escapeHtml(order.rejectionReason)}</p>` : ""}
                    </div>
                `
                )
                .join("");
        } catch (error) {
            container.innerHTML = `<div class="empty-state">UNABLE TO LOAD ORDERS<br/>${escapeHtml(error.message)}</div>`;
        }
    }

    function updateUserUI() {
        const btn = document.getElementById("account-btn");
        if (btn) btn.textContent = currentUser ? currentUser.name.split(" ")[0] : "Account";
    }

    // Expose user update handler
    window.onUserUpdate = function (user) {
        currentUser = user;
        updateUserUI();
        loadOrders();
    };

    // ============================================================
    // Utilities
    // ============================================================
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

    function escapeHtml(text) {
        if (!text) return "";
        return String(text).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[c]));
    }
})();