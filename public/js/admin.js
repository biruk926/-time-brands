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
            const response = await TimeAPI.get("/admin/check");
            if (response.success && response.admin) {
                showDashboard();
                loadAllData();
            }
        } catch (error) {
            // not logged in
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
                const response = await TimeAPI.post("/admin/login", { password });
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
                await TimeAPI.post("/admin/logout");
            } catch (error) {
                // ignore
            }
            location.reload();
        });
    }

    function showDashboard() {
        document.getElementById("admin-login").hidden = true;
        document.getElementById("admin-dashboard").hidden = false;
    }

    // ------------------------------------------------
    // Tabs
    // ------------------------------------------------
    function setupTabs() {
        document.querySelectorAll(".admin-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                const tabName = tab.dataset.tab;
                document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
                tab.classList.add("active");
                document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
                document.getElementById(`tab-${tabName}`).classList.add("active");
                currentTab = tabName;
                if (tabName === "chat") {
                    loadConversations();
                }
            });
        });
    }

    function setupActionButtons() {
        document.getElementById("add-product-btn").addEventListener("click", openProductForm);
        document.getElementById("admin-chat-form").addEventListener("submit", handleAdminChatSend);
    }

    function setupRejectForm() {
        document.getElementById("reject-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const orderId = document.getElementById("reject-order-id").value;
            const reason = document.getElementById("reject-reason").value.trim();
            if (!orderId || !reason) return;

            try {
                await updateOrderStatus(orderId, "rejected", reason);
                document.getElementById("reject-modal").classList.remove("open");
            } catch (error) {
                alert(error.message);
            }
        });
    }

    function setupProductForm() {
        // Product form is created dynamically; listener is attached in renderProducts
    }

    function setupAdminChat() {
        const chatTab = document.querySelector('[data-tab="chat"]');
        if (chatTab) {
            chatTab.addEventListener("click", loadConversations);
        }
    }

    // ------------------------------------------------
    // Load data
    // ------------------------------------------------
    async function loadAllData() {
        await Promise.all([loadOverview(), loadOrders(), loadProducts(), loadCustomers(), loadConversations()]);
    }

    async function loadOverview() {
        try {
            const [productsRes, ordersRes, usersRes] = await Promise.all([
                TimeAPI.get("/products"),
                TimeAPI.get("/orders"),
                TimeAPI.get("/users"),
            ]);
            const products = productsRes.products || [];
            const orders = ordersRes.orders || [];
            const users = usersRes.users || [];

            const stats = [
                { label: "Products", value: products.length },
                { label: "Orders", value: orders.length },
                { label: "Customers", value: users.length },
                { label: "Pending Orders", value: orders.filter((o) => o.status === "pending").length },
            ];

            const container = document.getElementById("overview-stats");
            container.innerHTML = stats
                .map(
                    (stat) => `
                <div class="stat-card">
                    <h3>${escapeHtml(stat.label)}</h3>
                    <strong>${stat.value}</strong>
                </div>
            `
                )
                .join("");
        } catch (error) {
            document.getElementById("overview-stats").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function loadOrders() {
        try {
            const response = await TimeAPI.get("/orders");
            renderOrders(response.orders || []);
        } catch (error) {
            document.getElementById("admin-orders-list").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    function renderOrders(orders) {
        const container = document.getElementById("admin-orders-list");
        if (!container) return;

        if (!orders.length) {
            container.innerHTML = `<p class="empty-state">No orders found.</p>`;
            return;
        }

        container.innerHTML = orders
            .slice()
            .reverse()
            .map((order) => {
                const actions = renderOrderActions(order.status);
                return `
                <div class="admin-card">
                    <div class="admin-card-header">
                        <strong>Order #${order.id}</strong>
                        <span class="order-status status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
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
                    ${order.rejectionReason ? `<p class="rejection-reason">Rejection reason: ${escapeHtml(order.rejectionReason)}</p>` : ""}
                    <div class="admin-actions">
                        ${actions}
                    </div>
                </div>
            `;
            })
            .join("");
    }

    function renderOrderActions(status) {
        const buttons = [];

        if (status === "pending") {
            buttons.push(
                `<button class="btn btn-gold approve-order" data-id="${status === "pending" ? "" : ""}" onclick="window.__approveOrder(this)" data-order-id="${status === "pending" ? "" : ""}">Approve</button>`,
                `<button class="btn btn-danger reject-order" onclick="window.__rejectOrder(this)" data-order-id="${status === "pending" ? "" : ""}">Reject</button>`
            );
        } else if (status === "approved") {
            buttons.push(`<span class="success-message">Approved</span>`);
            buttons.push(`<button class="btn btn-outline-gold processing-order" onclick="window.__updateStatus(this)" data-order-id="${status === "approved" ? "" : ""}" data-status="processing">Start Processing</button>`);
        } else if (status === "processing") {
            buttons.push(`<span class="success-message">Processing</span>`);
            buttons.push(`<button class="btn btn-outline-gold shipped-order" onclick="window.__updateStatus(this)" data-order-id="${status === "processing" ? "" : ""}" data-status="shipped">Mark Shipped</button>`);
        } else if (status === "shipped") {
            buttons.push(`<span class="success-message">Shipped</span>`);
            buttons.push(`<button class="btn btn-outline-gold delivered-order" onclick="window.__updateStatus(this)" data-order-id="${status === "shipped" ? "" : ""}" data-status="delivered">Mark Delivered</button>`);
        } else if (status === "delivered") {
            buttons.push(`<span class="success-message">Delivered</span>`);
        } else if (status === "rejected") {
            buttons.push(`<span class="error-message">Rejected</span>`);
            buttons.push(`<button class="btn btn-outline-gold approve-order" onclick="window.__approveOrder(this)" data-order-id="${status === "rejected" ? "" : ""}">Reopen / Approve</button>`);
        } else if (status === "cancelled") {
            buttons.push(`<span class="error-message">Cancelled</span>`);
        }

        return buttons.join("");
    }

    // Fix dynamic data-order-id bug from above.
    document.addEventListener("click", (event) => {
        const approveBtn = event.target.closest(".approve-order");
        const rejectBtn = event.target.closest(".reject-order");
        const updateBtn = event.target.closest("[data-status]");

        if (approveBtn) {
            const orderId = Number(approveBtn.dataset.orderId);
            if (orderId) window.__approveOrder(orderId);
        }

        if (rejectBtn) {
            const orderId = Number(rejectBtn.dataset.orderId);
            if (orderId) window.__rejectOrder(orderId);
        }

        if (updateBtn) {
            const orderId = Number(updateBtn.dataset.orderId);
            const status = updateBtn.dataset.status;
            if (orderId && status) window.__updateStatus(orderId, status);
        }
    });

    window.__approveOrder = async function (orderId) {
        try {
            await updateOrderStatus(orderId, "approved");
        } catch (error) {
            alert(error.message);
        }
    };

    window.__rejectOrder = function (orderId) {
        const modal = document.getElementById("reject-modal");
        document.getElementById("reject-order-id").value = orderId;
        modal.classList.add("open");
    };

    window.__updateStatus = async function (orderId, status) {
        try {
            await updateOrderStatus(orderId, status);
        } catch (error) {
            alert(error.message);
        }
    };

    async function updateOrderStatus(orderId, status, reason = "") {
        try {
            const payload = { status };
            if (reason) payload.reason = reason;
            await TimeAPI.patch(`/orders/${orderId}/status`, payload);
            await loadOrders();
            await loadOverview();
            if (currentTab === "orders") {
                // Already loaded
            }
        } catch (error) {
            throw error;
        }
    }

    // ------------------------------------------------
    // Products
    // ------------------------------------------------
    async function loadProducts() {
        try {
            const response = await TimeAPI.get("/products");
            renderAdminProducts(response.products || []);
        } catch (error) {
            document.getElementById("admin-products-list").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    function renderAdminProducts(products) {
        const container = document.getElementById("admin-products-list");
        if (!container) return;

        if (!products.length) {
            container.innerHTML = `<p class="empty-state">No products found.</p>`;
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
                    <button class="btn btn-outline-gold edit-product" data-id="${product.id}">Edit</button>
                    <button class="btn btn-danger delete-product" data-id="${product.id}">Delete</button>
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
            category: "Watches",
            stock: 0,
            active: true,
        };

        const formHtml = `
        <div class="modal open" id="product-form-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${product ? "Edit Product" : "Add Product"}</h3>
                    <button class="close-modal" data-close="product-form-modal">×</button>
                </div>
                <form id="product-form">
                    <label>Name</label>
                    <input id="product-name" type="text" value="${escapeHtml(productData.name)}" required />
                    <label>Description</label>
                    <textarea id="product-description" rows="3">${escapeHtml(productData.description)}</textarea>
                    <label>Price</label>
                    <input id="product-price" type="number" step="0.01" value="${productData.price}" required />
                    <label>Currency</label>
                    <input id="product-currency" type="text" value="${escapeHtml(productData.currency)}" required />
                    <label>Image URL</label>
                    <input id="product-image" type="text" value="${escapeHtml(productData.image)}" />
                    <label>Category</label>
                    <input id="product-category" type="text" value="${escapeHtml(productData.category)}" />
                    <label>Stock</label>
                    <input id="product-stock" type="number" value="${productData.stock}" required />
                    <label class="checkbox-label">
                        <input id="product-active" type="checkbox" ${productData.active ? "checked" : ""} /> Active
                    </label>
                    <div class="modal-actions">
                        <button type="submit" class="btn btn-gold">${product ? "Update" : "Create"}</button>
                    </div>
                </form>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML("beforeend", formHtml);
        document.getElementById("product-form-modal").classList.add("open");

        document.getElementById("product-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = {
                name: document.getElementById("product-name").value.trim(),
                description: document.getElementById("product-description").value.trim(),
                price: Number(document.getElementById("product-price").value),
                currency: document.getElementById("product-currency").value.trim(),
                image: document.getElementById("product-image").value.trim(),
                category: document.getElementById("product-category").value.trim(),
                stock: Number(document.getElementById("product-stock").value),
                active: document.getElementById("product-active").checked,
            };

            try {
                if (product) {
                    await TimeAPI.put(`/products/${product.id}`, payload);
                } else {
                    await TimeAPI.post("/products", payload);
                }
                document.getElementById("product-form-modal").remove();
                await loadProducts();
            } catch (error) {
                alert(error.message);
            }
        });

        document.querySelector('[data-close="product-form-modal"]').addEventListener("click", () => {
            document.getElementById("product-form-modal").remove();
        });
    }

    document.addEventListener("click", (event) => {
        if (event.target.classList.contains("delete-product")) {
            const productId = Number(event.target.dataset.id);
            if (confirm("Delete this product?")) {
                TimeAPI.delete(`/products/${productId}`)
                    .then(() => loadProducts())
                    .catch((error) => alert(error.message));
            }
        }

        if (event.target.classList.contains("edit-product")) {
            const productId = Number(event.target.dataset.id);
            TimeAPI.get(`/products/${productId}`)
                .then((response) => openProductForm(response.product))
                .catch((error) => alert(error.message));
        }
    });

    // ------------------------------------------------
    // Customers
    // ------------------------------------------------
    async function loadCustomers() {
        try {
            const response = await TimeAPI.get("/users");
            const users = response.users || [];
            const container = document.getElementById("admin-customers-list");
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
            document.getElementById("admin-customers-list").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    // ------------------------------------------------
    // Chat
    // ------------------------------------------------
    async function loadConversations() {
        try {
            const response = await TimeAPI.get("/messages");
            const conversations = response.conversations || [];
            const container = document.getElementById("conversation-list");
            container.innerHTML = conversations
                .map(
                    (conv) => `
                <div class="conversation-item" data-conversation-id="${escapeHtml(conv.conversationId)}">
                    <strong>${escapeHtml(conv.customerName)} ${conv.unreadCount ? `<span class="unread-badge">${conv.unreadCount}</span>` : ""}</strong>
                    <small>${escapeHtml(conv.customerEmail)}</small>
                    <p><small>${escapeHtml(conv.latestMessage?.message?.slice(0, 60) || "")}</small></p>
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
            document.getElementById("conversation-list").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function openConversation(conversationId) {
        activeConversationId = conversationId;
        document.querySelectorAll(".conversation-item").forEach((item) => {
            item.classList.toggle("active", item.dataset.conversationId === conversationId);
        });
        await loadAdminMessages();
        await TimeAPI.patch(`/messages/${encodeURIComponent(conversationId)}/read`);
        startAdminPolling();
    }

    async function loadAdminMessages() {
        if (!activeConversationId) return;
        try {
            const response = await TimeAPI.get(
                `/messages/${encodeURIComponent(activeConversationId)}`
            );
            const container = document.getElementById("admin-chat-messages");
            container.innerHTML = response.messages
                .map(
                    (msg) => `
                <div class="chat-msg ${escapeHtml(msg.sender)}">
                    <small>${escapeHtml(msg.sender)} · ${formatDate(msg.timestamp)}</small>
                    <div>${escapeHtml(msg.message)}</div>
                </div>
            `
                )
                .join("");
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            document.getElementById("admin-chat-messages").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function handleAdminChatSend(event) {
        event.preventDefault();
        const input = document.getElementById("admin-chat-input");
        const message = input.value.trim();
        if (!message || !activeConversationId) return;

        try {
            await TimeAPI.post("/messages", {
                conversationId: activeConversationId,
                sender: "admin",
                message,
            });
            input.value = "";
            await loadAdminMessages();
        } catch (error) {
            alert(error.message);
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
        try {
            const health = await TimeAPI.get("/health");
            const container = document.getElementById("admin-status");
            container.innerHTML = `<pre>${escapeHtml(JSON.stringify(health, null, 2))}</pre>`;
        } catch (error) {
            document.getElementById("admin-status").innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    // Fix tab settings loading
    document.querySelector('[data-tab="settings"]').addEventListener("click", loadSettings);

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
})();