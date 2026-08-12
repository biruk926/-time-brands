(function () {
    const CART_KEY = "timebrand_cart";

    let products = [];
    let cart = [];
    let currentUser = null;

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        currentUser = TimeAuth.getCachedUser();
        loadCart();
        setupEventListeners();
        updateUserUI();
        loadProducts();
        if (currentUser) {
            loadOrderHistory();
        }
    }

    function setupEventListeners() {
        document.body.addEventListener("click", (event) => {
            const closeButton = event.target.closest(".close-modal");
            if (closeButton) {
                const modalId = closeButton.dataset.close;
                const modal = document.getElementById(modalId);
                if (modal) modal.classList.remove("open");
                if (modalId === "account-modal") TimeAuth.rejectUser(new Error("Cancelled"));
                return;
            }

            if (event.target.matches(".modal.open")) {
                event.target.classList.remove("open");
                return;
            }
        });

        document.querySelectorAll("[data-scroll]").forEach((button) => {
            button.addEventListener("click", () => {
                const target = document.getElementById(button.dataset.scroll);
                if (target) target.scrollIntoView({ behavior: "smooth" });
            });
        });

        document.getElementById("cart-btn").addEventListener("click", openCart);
        document.getElementById("checkout-btn").addEventListener("click", handleCheckout);
        document.getElementById("account-btn").addEventListener("click", openAccountModal);

        document.getElementById("account-form").addEventListener("submit", handleAccountSubmit);
        document.getElementById("checkout-form").addEventListener("submit", handleCheckoutSubmit);
    }

    // ------------------------------------------------
    // Products
    // ------------------------------------------------
    async function loadProducts() {
        try {
            const response = await TimeAPI.get("/products");
            products = response.products || [];
            renderProducts(products);
        } catch (error) {
            showGlobalError(error.message);
            renderProducts([]);
        }
    }

    function renderProducts(products) {
        const grid = document.getElementById("product-grid");
        if (!grid) return;

        if (!products.length) {
            grid.innerHTML = `<p class="empty-state">No products available. Please check back later.</p>`;
            return;
        }

        grid.innerHTML = products
            .map(
                (product) => `
            <article class="product-card">
                <img src="${escapeHtml(product.image || "/assets/watch-placeholder.svg")}"
                     alt="${escapeHtml(product.name)}"
                     onerror="this.src='/assets/watch-placeholder.svg';this.onerror=null;" />
                <div class="product-info">
                    <h3 class="product-name">${escapeHtml(product.name)}</h3>
                    <p class="product-desc">${escapeHtml(product.description || "")}</p>
                    <span class="product-price">${formatPrice(product.price)} ${escapeHtml(product.currency || "ETB")}</span>
                    <span class="product-stock">Stock: ${Number(product.stock) || 0}</span>
                    <button class="btn btn-gold add-to-cart"
                            data-id="${product.id}"
                            aria-label="Add ${escapeHtml(product.name)} to cart"
                            ${Number(product.stock) > 0 ? "" : "disabled"}>
                        ${Number(product.stock) > 0 ? "Add to Cart" : "Out of Stock"}
                    </button>
                </div>
            </article>
        `
            )
            .join("");
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
    }

    function saveCart() {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
        } catch (error) {
            // ignore
        }
    }

    function getCartCount() {
        return cart.reduce((sum, item) => sum + item.quantity, 0);
    }

    function openCart() {
        renderCart();
        const modal = document.getElementById("cart-modal");
        modal.classList.add("open");
    }

    function renderCart() {
        const cartItems = document.getElementById("cart-items");
        const cartTotal = document.getElementById("cart-total");
        const cartCount = document.getElementById("cart-count");

        cartCount.textContent = getCartCount();

        if (!cartItems) return;

        if (!cart.length) {
            cartItems.innerHTML = `<p class="empty-state">Your cart is empty.</p>`;
            cartTotal.textContent = "0 ETB";
            return;
        }

        let total = 0;
        cartItems.innerHTML = cart
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
                        <div class="cart-item-price">${formatPrice(product.price)} ${escapeHtml(product.currency || "ETB")} each</div>
                    </div>
                    <div class="cart-qty">
                        <button class="cart-minus" data-id="${product.id}" aria-label="Decrease quantity">−</button>
                        <span>${item.quantity}</span>
                        <button class="cart-plus" data-id="${product.id}" aria-label="Increase quantity">+</button>
                    </div>
                    <button class="cart-item-remove" data-id="${product.id}" aria-label="Remove from cart">×</button>
                </div>
            `;
            })
            .join("");

        cartTotal.textContent = `${formatPrice(total)} ${products[0]?.currency || "ETB"}`;
    }

    document.addEventListener("click", (event) => {
        if (event.target.classList.contains("add-to-cart")) {
            const id = Number(event.target.dataset.id);
            addToCart(id);
        }

        if (event.target.classList.contains("cart-minus")) {
            const id = Number(event.target.dataset.id);
            changeQuantity(id, -1);
        }

        if (event.target.classList.contains("cart-plus")) {
            const id = Number(event.target.dataset.id);
            changeQuantity(id, 1);
        }

        if (event.target.classList.contains("cart-item-remove")) {
            const id = Number(event.target.dataset.id);
            removeFromCart(id);
        }
    });

    function addToCart(productId, quantity = 1) {
        const product = products.find((p) => Number(p.id) === productId);
        if (!product) return;
        if (Number(product.stock) < 1) {
            alert("This product is out of stock.");
            return;
        }

        const existing = cart.find((item) => Number(item.productId) === productId);
        if (existing) {
            existing.quantity = Math.min(Number(existing.quantity) + quantity, Number(product.stock));
        } else {
            cart.push({ productId, quantity });
        }
        saveCart();
        openCart();
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
            alert("You have reached the available stock.");
        }
        saveCart();
        renderCart();
        document.getElementById("cart-count").textContent = getCartCount();
    }

    function removeFromCart(productId) {
        cart = cart.filter((i) => Number(i.productId) !== productId);
        saveCart();
        renderCart();
        document.getElementById("cart-count").textContent = getCartCount();
    }

    // ------------------------------------------------
    // Checkout
    // ------------------------------------------------
    function handleCheckout() {
        if (!cart.length) {
            alert("Your cart is empty.");
            return;
        }

        TimeAuth.requireUser()
            .then((user) => {
                currentUser = user;
                updateUserUI();
                openCheckoutModal();
            })
            .catch((error) => {
                if (error.message !== "Cancelled") showGlobalError(error.message);
            });
    }

    function openCheckoutModal() {
        const summary = document.getElementById("checkout-summary");
        let total = 0;
        summary.innerHTML = cart
            .map((item) => {
                const product = products.find((p) => String(p.id) === String(item.productId));
                if (!product) return "";
                const subtotal = Number(product.price) * item.quantity;
                total += subtotal;
                return `<p>${escapeHtml(product.name)} × ${item.quantity} = ${formatPrice(subtotal)} ${escapeHtml(product.currency || "ETB")}</p>`;
            })
            .join("");
        summary.innerHTML += `<strong>Total: ${formatPrice(total)} ${products[0]?.currency || "ETB"}</strong>`;
        document.getElementById("checkout-modal").classList.add("open");
    }

    async function handleCheckoutSubmit(event) {
        event.preventDefault();
        const errorBox = document.getElementById("checkout-error");
        errorBox.textContent = "";

        if (!currentUser || !cart.length) {
            errorBox.textContent = "Cart or customer information is missing.";
            return;
        }

        const shippingAddress = document.getElementById("shipping-address").value.trim();
        if (!shippingAddress) {
            errorBox.textContent = "Shipping address is required.";
            return;
        }

        const orderPayload = {
            customer: {
                userId: currentUser.id,
                userName: currentUser.name,
                email: currentUser.email,
                phone: currentUser.phone || "",
                shippingAddress,
            },
            items: cart.map((item) => ({
                productId: Number(item.productId),
                quantity: Number(item.quantity),
            })),
        };

        try {
            const response = await TimeAPI.post("/orders", orderPayload);
            if (response.success) {
                cart = [];
                saveCart();
                document.getElementById("cart-count").textContent = "0";
                document.getElementById("checkout-modal").classList.remove("open");
                alert(`Order #${response.order.id} placed successfully!`);
                loadOrderHistory();
            }
        } catch (error) {
            errorBox.textContent = error.message;
        }
    }

    // ------------------------------------------------
    // Account
    // ------------------------------------------------
    function openAccountModal() {
        const user = TimeAuth.getCachedUser();
        if (user) {
            document.getElementById("account-name").value = user.name || "";
            document.getElementById("account-email").value = user.email || "";
            document.getElementById("account-phone").value = user.phone || "";
        }
        document.getElementById("account-modal").classList.add("open");
    }

    async function handleAccountSubmit(event) {
        event.preventDefault();
        const errorBox = document.getElementById("account-error");
        errorBox.textContent = "";

        const name = document.getElementById("account-name").value.trim();
        const email = document.getElementById("account-email").value.trim();
        const phone = document.getElementById("account-phone").value.trim();
        const register = document.getElementById("account-register").checked;

        try {
            const user = await TimeAuth.loginOrRegister({ name, email, phone, register });
            currentUser = user;
            TimeAuth.resolveUser(user);
            updateUserUI();
            loadOrderHistory();
        } catch (error) {
            errorBox.textContent = error.message;
        }
    }

    function updateUserUI() {
        const accountButton = document.getElementById("account-btn");
        if (accountButton) {
            accountButton.textContent = currentUser ? currentUser.name.split(" ")[0] : "Account";
        }
    }

    // ------------------------------------------------
    // Order history
    // ------------------------------------------------
    async function loadOrderHistory() {
        if (!currentUser) return;
        const container = document.getElementById("order-history");
        if (!container) return;

        try {
            const response = await TimeAPI.get(
                `/orders?userId=${encodeURIComponent(currentUser.id)}`
            );
            const orders = response.orders || [];
            renderOrderHistory(orders);
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    function renderOrderHistory(orders) {
        const container = document.getElementById("order-history");
        if (!container) return;

        if (!orders.length) {
            container.innerHTML = `<p class="empty-state">You have no orders yet.</p>`;
            return;
        }

        container.innerHTML = orders
            .slice()
            .reverse()
            .map(
                (order) => `
            <div class="order-card">
                <div class="order-card-header">
                    <strong>Order #${order.id}</strong>
                    <span class="order-status status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
                </div>
                <ul class="order-items">
                    ${order.items
                        .map(
                            (item) =>
                                `<li>${escapeHtml(item.name)} × ${item.quantity} = ${formatPrice(item.subtotal)} ${escapeHtml(order.currency)}</li>`
                        )
                        .join("")}
                </ul>
                <div>Total: <span class="order-total">${formatPrice(order.total)} ${escapeHtml(order.currency)}</span></div>
                <div>Date: ${formatDate(order.createdAt)}</div>
                ${order.status === "rejected" && order.rejectionReason ? `<div class="rejection-reason">Reason: ${escapeHtml(order.rejectionReason)}</div>` : ""}
            </div>
        `
            )
            .join("");
    }

    // ------------------------------------------------
    // Helpers
    // ------------------------------------------------
    function formatPrice(value) {
        return Number(value).toLocaleString();
    }

    function formatDate(isoString) {
        if (!isoString) return "";
        try {
            return new Date(isoString).toLocaleString();
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

    function showGlobalError(message) {
        const grid = document.getElementById("product-grid");
        if (grid) {
            grid.innerHTML = `<p class="error-message">${escapeHtml(message)}</p>`;
        }
    }
})();