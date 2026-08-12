(function () {
    let currentTab = "overview";
    let activeConversationId = null;
    let adminMessagesPollTimer = null;

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        setupLoginForm();
        setupTabs();
        setupActionButtons();
        setupRejectForm();
        setupProductForm();
        setupAdminChat();
        checkAdminSession();
    }

    // ------------------------------------------------
    // Auth
    // ------------------------------------------------
    async function checkAdminSession() {
        try {
            const response = await TimeAPI.adminCheck();
            if (response.success && response.admin) {
                showDashboard();
                loadAllData();
            }
        } catch (error) {
            // Not logged in
        }
    }

    function setupLoginForm() {
        const form = document.getElementById("admin-login-form");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const password = document.getElementById("admin-password").value;
            const errorBox = document.getElementById("admin-login-error");
            errorBox.textContent = "";
            try {
                const response = await TimeAPI.adminLogin(password);
                if (response.success) {
                    showDashboard();
                    loadAllData();
                }
            } catch (error) {
                errorBox.textContent = error.message;
            }
        });

        document.getElementById("admin-logout").addEventListener("click", async () => {
            try {
                await TimeAPI.adminLogout();
            } catch (error) {
                // ignore
            }
            location.reload();
        });
    }

    function showDashboard() {
        document.getElementById("admin-login").hidden = true;
        document.getElementById("admin-dashboard").hidden = false;
        document.querySelector(".admin-sidebar").classList.remove("open");
    }

    // ------------------------------------------------
    // Tabs
    // ------------------------------------------------
    function setupTabs() {
        document.querySelectorAll(".admin-nav-btn[data-tab]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const tabName = btn.dataset.tab;
                document.querySelectorAll(".admin-nav-btn").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
                document.getElementById(`tab-${tabName}`).classList.add("active");
                currentTab = tabName;
                document.getElementById("admin-page-title").textContent =
                    tabName.charAt(0).toUpperCase() + tabName.slice(1);
                if (tabName === "chat") {
                    loadConversations();
                } else if (tabName === "settings") {
                    loadSettings();
                } else if (tabName === "orders") {
                    loadOrders();
                } else if (tabName === "products") {
                    loadProducts();
                } else if (tabName === "customers") {
                    loadCustomers();
                } else if (tabName === "overview") {
                    loadOverview();
                }
                if (window.innerWidth <= 992) {
                    document.querySelector(".admin-sidebar").classList.remove("open");
                }
            });
        });

        document.getElementById("admin-sidebar-toggle").addEventListener("click", () => {
            document.querySelector(".admin-sidebar").classList.toggle("open");
        });
    }

    function setupActionButtons() {
        document.getElementById("add-product-btn").addEventListener("click", () => openProductForm());
        document.getElementById("admin-chat-form").addEventListener("submit", handleAdminChatSend);
    }

    function setupRejectForm() {
        document.getElementById("reject-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const orderId = document.getElementById("reject-order-id").value;
            const reason = document.getElementById("reject-reason").value.trim();
            if (!orderId || !reason) return;

            try {
                const result = await TimeAPI.rejectOrder(orderId, reason);
                if (result.success) {
                    showToast(`Order #${orderId} rejected.`, "success");
                    closeModal("reject-modal");
                    await loadOrders();
                    await loadOverview();
                }
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    function setupProductForm() {
        document.getElementById("product-form").addEventListener("submit", handleProductSubmit);
    }

    function setupAdminChat() {
        // handled by tab load
    }

    // ------------------------------------------------
    // Load data
    // ------------------------------------------------
    async function loadAllData() {
        await Promise.all([
            loadOverview(),
            loadOrders(),
            loadProducts(),
            loadCustomers(),
            loadConversations(),
        ]);
    }

    async function loadOverview() {
        try {
            const [productsRes, ordersRes, usersRes] = await Promise.all([
                TimeAPI.getProducts(),
                TimeAPI.getOrders(),
                TimeAPI.getUsers(),
            ]);
            const products = productsRes.products || [];
            const orders = ordersRes.orders || [];
            const users = usersRes.users || [];

            const totalRevenue = orders
                .filter((o) => o.status !== "rejected" && o.status !== "cancelled")
                .reduce((sum, o) => sum + Number(o.total), 0);

            const stats = [
                { label: "Total Orders", value: orders.length },
                { label: "Pending Orders", value: orders.filter((o) => o.status === "pending").length },
                { label: "Products", value: products.length },
                { label: "Customers", value: users.length },
                { label: "Revenue (ETB)", value: formatPrice(totalRevenue) },
            ];

            const container = document.getElementById("overview-stats");
            container.innerHTML = stats
                .map(
                    (stat) => `
                    <div class="stat-card">
                        <h3>${escapeHtml(stat.label)}</h3>
                        <div class="stat-value">${stat.value}</div>
                    </div>
                `
                )
                .join("");
        } catch (error) {
            document.getElementById("overview-stats").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function loadOrders() {
        const container = document.getElementById("admin-orders-list");
        if (!container) return;
        container.innerHTML = '<div class="loading-skeleton">Loading orders...</div>';
        try {
            const response = await TimeAPI.getOrders();
            renderOrders(response.orders || []);
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    function renderOrders(orders) {
        const container = document.getElementById("admin-orders-list");
        if (!container) return;

        if (!orders.length) {
            container.innerHTML = `<div class="empty-state">No orders found.</div>`;
            return;
        }

        container.innerHTML = orders
            .slice()
            .reverse()
            .map((order) => {
                const actions = renderOrderActions(order);
                return `
                <div class="admin-card">
                    <div class="admin-card-header">
                        <strong>Order #${order.id}</strong>
                        <span class="order-status-badge status-${order.status}">${escapeHtml(order.status)}</span>
                    </div>
                    <p><strong>Customer:</strong> ${escapeHtml(order.userName)} (${escapeHtml(order.email)})</p>
                    <ul class="order-items">
                        ${order.items
                            .map(
                                (item) =>
                                    `<li>${escapeHtml(item.name)} × ${item.quantity} = ${formatPrice(item.subtotal)} ${escapeHtml(order.currency)}</li>`
                            )
                            .join("")}
                    </ul>
                    <p><strong>Total:</strong> <span class="order-total">${formatPrice(order.total)} ${escapeHtml(order.currency)}</span></p>
                    <p><strong>Date:</strong> ${formatDate(order.createdAt)}</p>
                    ${order.rejectionReason ? `<p class="rejection-reason">Reason: ${escapeHtml(order.rejectionReason)}</p>` : ""}
                    <div class="admin-actions">
                        ${actions}
                    </div>
                </div>
            `;
            })
            .join("");
    }

    function renderOrderActions(order) {
        const status = order.status;
        const orderId = order.id;
        const buttons = [];

        if (status === "pending") {
            buttons.push(
                `<button class="btn btn-primary approve-order" data-order-id="${orderId}">✓ APPROVE</button>`,
                `<button class="btn btn-danger reject-order" data-order-id="${orderId}">× REJECT</button>`
            );
        } else if (status === "approved") {
            buttons.push(`<span class="success-message">✓ APPROVED</span>`);
            buttons.push(
                `<button class="btn btn-outline deliver-order" data-order-id="${orderId}">MARK DELIVERED</button>`
            );
        } else if (status === "delivered") {
            buttons.push(`<span class="success-message">DELIVERED</span>`);
        } else if (status === "rejected") {
            buttons.push(`<span class="error-message">✕ REJECTED</span>`);
            buttons.push(
                `<button class="btn btn-outline approve-order" data-order-id="${orderId}">REOPEN / APPROVE</button>`
            );
        } else if (status === "cancelled") {
            buttons.push(`<span class="error-message">CANCELLED</span>`);
        }

        return buttons.join("");
    }

    // Event delegation for order actions
    document.addEventListener("click", (event) => {
        const approveBtn = event.target.closest(".approve-order");
        const rejectBtn = event.target.closest(".reject-order");
        const deliverBtn = event.target.closest(".deliver-order");

        if (approveBtn) {
            const orderId = Number(approveBtn.dataset.orderId);
            if (orderId) approveOrder(orderId);
        }

        if (rejectBtn) {
            const orderId = Number(rejectBtn.dataset.orderId);
            if (orderId) openRejectModal(orderId);
        }

        if (deliverBtn) {
            const orderId = Number(deliverBtn.dataset.orderId);
            if (orderId) deliverOrder(orderId);
        }
    });

    function openRejectModal(orderId) {
        document.getElementById("reject-order-id").value = orderId;
        openModal("reject-modal");
    }

    async function approveOrder(orderId) {
        try {
            const result = await TimeAPI.approveOrder(orderId);
            if (result.success) {
                showToast(`Order #${orderId} approved.`, "success");
                await loadOrders();
                await loadOverview();
            }
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    async function deliverOrder(orderId) {
        try {
            const result = await TimeAPI.deliverOrder(orderId);
            if (result.success) {
                showToast(`Order #${orderId} delivered.`, "success");
                await loadOrders();
                await loadOverview();
            }
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    // ------------------------------------------------
    // Products
    // ------------------------------------------------
    async function loadProducts() {
        const container = document.getElementById("admin-products-list");
        if (!container) return;
        container.innerHTML = '<div class="loading-skeleton">Loading products...</div>';
        try {
            const response = await TimeAPI.getProducts();
            renderAdminProducts(response.products || []);
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    function renderAdminProducts(products) {
        const container = document.getElementById("admin-products-list");
        if (!container) return;

        if (!products.length) {
            container.innerHTML = `<div class="empty-state">No products found.</div>`;
            return;
        }

        container.innerHTML = products
            .map(
                (product) => `
                <div class="admin-card">
                    <div class="admin-card-header">
                        <strong>#${product.id} - ${escapeHtml(product.name)}</strong>
                        <span>${product.active ? "Active" : "Inactive"}</span>
                    </div>
                    <p>Price: ${formatPrice(product.price)} ${escapeHtml(product.currency)}</p>
                    <p>Stock: ${product.stock} | Category: ${escapeHtml(product.category)}</p>
                    <div class="admin-actions">
                        <button class="btn btn-outline edit-product" data-id="${product.id}">EDIT</button>
                        <button class="btn btn-danger delete-product" data-id="${product.id}">DELETE</button>
                    </div>
                </div>
            `
            )
            .join("");
    }

    function openProductForm(product = null) {
        const productData = product || {
            name: "",
            description: "",
            price: 0,
            currency: "ETB",
            image: "/assets/watch-placeholder.svg",
            category: "Sneakers",
            stock: 0,
            active: true,
            featured: false,
        };

        document.getElementById("product-form-title").textContent = product ? "EDIT PRODUCT" : "ADD PRODUCT";
        document.getElementById("product-name").value = productData.name;
        document.getElementById("product-description").value = productData.description || "";
        document.getElementById("product-price").value = productData.price;
        document.getElementById("product-currency").value = productData.currency || "ETB";
        document.getElementById("product-image").value = productData.image || "";
        document.getElementById("product-category").value = productData.category || "Sneakers";
        document.getElementById("product-stock").value = productData.stock;
        document.getElementById("product-active").checked = productData.active !== false;
        document.getElementById("product-featured").checked = productData.featured === true;
        document.getElementById("product-id").value = product ? product.id : "";

        openModal("product-form-modal");
    }

    async function handleProductSubmit(event) {
        event.preventDefault();
        const id = document.getElementById("product-id").value;
        const payload = {
            name: document.getElementById("product-name").value.trim(),
            description: document.getElementById("product-description").value.trim(),
            price: Number(document.getElementById("product-price").value),
            currency: document.getElementById("product-currency").value.trim(),
            image: document.getElementById("product-image").value.trim(),
            category: document.getElementById("product-category").value.trim(),
            stock: Number(document.getElementById("product-stock").value),
            active: document.getElementById("product-active").checked,
            featured: document.getElementById("product-featured").checked,
        };

        try {
            if (id) {
                await TimeAPI.updateProduct(id, payload);
                showToast("Product updated.", "success");
            } else {
                await TimeAPI.createProduct(payload);
                showToast("Product created.", "success");
            }
            closeModal("product-form-modal");
            await loadProducts();
            await loadOverview();
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    document.addEventListener("click", (event) => {
        if (event.target.classList.contains("edit-product")) {
            const id = Number(event.target.dataset.id);
            TimeAPI.getProduct(id)
                .then((response) => openProductForm(response.product))
                .catch((error) => showToast(error.message, "error"));
        }

        if (event.target.classList.contains("delete-product")) {
            const id = Number(event.target.dataset.id);
            if (confirm("Delete this product?")) {
                TimeAPI.deleteProduct(id)
                    .then(() => {
                        showToast("Product deleted.", "success");
                        loadProducts();
                        loadOverview();
                    })
                    .catch((error) => showToast(error.message, "error"));
            }
        }
    });

    // ------------------------------------------------
    // Customers
    // ------------------------------------------------
    async function loadCustomers() {
        const container = document.getElementById("admin-customers-list");
        if (!container) return;
        container.innerHTML = '<div class="loading-skeleton">Loading customers...</div>';
        try {
            const response = await TimeAPI.getUsers();
            const users = response.users || [];
            if (!users.length) {
                container.innerHTML = `<div class="empty-state">No customers found.</div>`;
                return;
            }
            container.innerHTML = users
                .map(
                    (user) => `
                    <div class="admin-card">
                        <p><strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.id)})</p>
                        <p>Email: ${escapeHtml(user.email)}</p>
                        <p>Phone: ${escapeHtml(user.phone || "N/A")}</p>
                    </div>
                `
                )
                .join("");
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    // ------------------------------------------------
    // Chat
    // ------------------------------------------------
    async function loadConversations() {
        const container = document.getElementById("conversation-list");
        if (!container) return;
        container.innerHTML = '<div class="loading-skeleton">Loading conversations...</div>';
        try {
            const response = await TimeAPI.listConversations();
            const conversations = response.conversations || [];
            if (!conversations.length) {
                container.innerHTML = `<div class="empty-state">No conversations.</div>`;
                return;
            }
            container.innerHTML = conversations
                .map(
                    (conv) => `
                    <div class="conversation-item" data-conversation-id="${escapeHtml(conv.conversationId)}">
                        <strong>${escapeHtml(conv.customerName)} ${conv.unreadCount ? `<span class="unread-badge">${conv.unreadCount}</span>` : ""}</strong>
                        <small>${escapeHtml(conv.customerEmail)}</small>
                        <small>${escapeHtml(conv.latestMessage?.message?.slice(0, 60) || "")}</small>
                    </div>
                `
                )
                .join("");

            container.querySelectorAll(".conversation-item").forEach((item) => {
                item.addEventListener("click", () => {
                    const conversationId = item.dataset.conversationId;
                    openConversation(conversationId);
                });
            });
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function openConversation(conversationId) {
        activeConversationId = conversationId;
        document.querySelectorAll(".conversation-item").forEach((item) => {
            item.classList.toggle("active", item.dataset.conversationId === conversationId);
        });
        await loadAdminMessages();
        await TimeAPI.markMessagesRead(conversationId);
        startAdminPolling();
    }

    async function loadAdminMessages() {
        if (!activeConversationId) return;
        const container = document.getElementById("admin-chat-messages");
        if (!container) return;
        try {
            const response = await TimeAPI.getMessages(activeConversationId);
            const messages = response.messages || [];
            if (!messages.length) {
                container.innerHTML = `<div class="empty-state">No messages.</div>`;
                return;
            }
            container.innerHTML = messages
                .map(
                    (msg) => `
                    <div class="chat-msg ${escapeHtml(msg.sender)}">
                        <small>${escapeHtml(msg.sender)} · ${formatTime(msg.timestamp)}</small>
                        <div>${escapeHtml(msg.message)}</div>
                    </div>
                `
                )
                .join("");
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function handleAdminChatSend(event) {
        event.preventDefault();
        const input = document.getElementById("admin-chat-input");
        const message = input.value.trim();
        if (!message || !activeConversationId) return;

        try {
            await TimeAPI.sendMessage({
                conversationId: activeConversationId,
                sender: "admin",
                message,
            });
            input.value = "";
            await loadAdminMessages();
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    function startAdminPolling() {
        stopAdminPolling();
        adminMessagesPollTimer = setInterval(loadAdminMessages, 5000);
    }

    function stopAdminPolling() {
        if (adminMessagesPollTimer) {
            clearInterval(adminMessagesPollTimer);
            adminMessagesPollTimer = null;
        }
    }

    // ------------------------------------------------
    // Settings
    // ------------------------------------------------
    async function loadSettings() {
        const container = document.getElementById("admin-status");
        if (!container) return;
        try {
            const health = await TimeAPI.get("/health");
            container.innerHTML = `<pre>${escapeHtml(JSON.stringify(health, null, 2))}</pre>`;
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
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

    function formatTime(isoString) {
        if (!isoString) return "";
        try {
            return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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