/**
 * TIME BRAND - Admin Dashboard
 * Handles login, dashboard statistics, order management, product management, and chat.
 */
(function () {
    let currentTab = "overview";
    let activeConversationId = null;
    let adminMessagesPollTimer = null;

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        setupLogin();
        setupTabs();
        setupActions();
        setupRejectForm();
        setupProductForm();
        checkSession();
    }

    // ============================================================
    // Login & Session Management
    // ============================================================
    function setupLogin() {
        document.getElementById("admin-login-form")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const password = document.getElementById("admin-password").value;
            const errBox = document.getElementById("admin-login-error");
            errBox.textContent = "";
            try {
                const response = await TimeAPI.adminLogin(password);
                if (response.success) {
                    showDashboard();
                    loadAllData();
                }
            } catch (error) {
                errBox.textContent = error.message;
            }
        });
        document.getElementById("admin-logout")?.addEventListener("click", async () => {
            await TimeAPI.adminLogout().catch(() => {});
            location.reload();
        });
    }

    async function checkSession() {
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

    function showDashboard() {
        document.getElementById("admin-login").hidden = true;
        document.getElementById("admin-dashboard").hidden = false;
    }

    // ============================================================
    // Tab Navigation
    // ============================================================
    function setupTabs() {
        document.querySelectorAll(".admin-nav-btn[data-tab]").forEach((btn) => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".admin-nav-btn").forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
                document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
                currentTab = btn.dataset.tab;
                document.getElementById("admin-page-title").textContent =
                    btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
                loadTabContent(currentTab);
                document.querySelector(".admin-sidebar")?.classList.remove("open");
            });
        });
        document.getElementById("admin-sidebar-toggle")?.addEventListener("click", () => {
            document.querySelector(".admin-sidebar")?.classList.toggle("open");
        });
    }

    function loadTabContent(tab) {
        switch (tab) {
            case "overview": loadOverview(); break;
            case "orders": loadOrders(); break;
            case "products": loadProducts(); break;
            case "customers": loadCustomers(); break;
            case "chat": loadConversations(); break;
            case "settings": loadSettings(); break;
        }
    }

    function setupActions() {
        document.getElementById("add-product-btn")?.addEventListener("click", () => openProductForm());
        document.getElementById("admin-chat-form")?.addEventListener("submit", handleAdminChatSend);
    }

    function setupRejectForm() {
        document.getElementById("reject-form")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("reject-order-id").value;
            const reason = document.getElementById("reject-reason").value.trim();
            if (!id || !reason) return;
            try {
                await TimeAPI.updateOrderStatus(id, "rejected", reason);
                showToast("Order rejected successfully.", "success");
                document.getElementById("reject-modal")?.classList.remove("open");
                await loadOrders();
                await loadOverview();
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    function setupProductForm() {
        document.getElementById("product-form")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("product-id").value;
            const payload = {
                name: document.getElementById("product-name").value.trim(),
                description: document.getElementById("product-description").value.trim(),
                price: Number(document.getElementById("product-price").value),
                image: document.getElementById("product-image").value.trim() || "/assets/watch-placeholder.svg",
                category: document.getElementById("product-category").value.trim() || "Sneakers",
                stock: Number(document.getElementById("product-stock").value),
                active: document.getElementById("product-active").checked,
            };
            try {
                if (id) {
                    await TimeAPI.updateProduct(id, payload);
                    showToast("Product updated.", "success");
                } else {
                    await TimeAPI.createProduct(payload);
                    showToast("Product created.", "success");
                }
                document.getElementById("product-form-modal")?.classList.remove("open");
                await loadProducts();
                await loadOverview();
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    // ============================================================
    // Load All Data
    // ============================================================
    async function loadAllData() {
        await Promise.all([loadOverview(), loadOrders(), loadProducts(), loadCustomers(), loadConversations()]);
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
            const revenue = orders
                .filter((o) => o.status !== "rejected")
                .reduce((sum, o) => sum + Number(o.total), 0);
            const stats = [
                { label: "Total Revenue", value: `${revenue.toLocaleString()} ETB` },
                { label: "Total Orders", value: orders.length },
                { label: "Products", value: products.length },
                { label: "Customers", value: users.length },
                { label: "Pending", value: orders.filter((o) => o.status === "pending").length },
                { label: "Approved", value: orders.filter((o) => o.status === "approved").length },
                { label: "Delivered", value: orders.filter((o) => o.status === "delivered").length },
            ];
            const container = document.getElementById("overview-stats");
            if (container) {
                container.innerHTML = stats
                    .map(
                        (s) => `
                        <div class="stat-card">
                            <h3>${escapeHtml(s.label)}</h3>
                            <div class="stat-value">${s.value}</div>
                        </div>
                    `
                    )
                    .join("");
            }
        } catch (error) {
            const container = document.getElementById("overview-stats");
            if (container) container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
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
            .map((order) => renderOrderCard(order))
            .join("");
    }

    function renderOrderCard(order) {
        const actions = renderOrderActions(order);
        return `
            <div class="admin-card">
                <div class="admin-card-header">
                    <strong>Order #${order.id}</strong>
                    <span class="order-status-badge status-${order.status}">${escapeHtml(order.status)}</span>
                </div>
                <p><strong>Customer:</strong> ${escapeHtml(order.userName)} (${escapeHtml(order.email)})</p>
                <p><strong>Phone:</strong> ${escapeHtml(order.phone || "N/A")} | <strong>Address:</strong> ${escapeHtml(order.address || "N/A")}</p>
                <ul class="order-items">
                    ${order.items
                        .map(
                            (i) =>
                                `<li>${escapeHtml(i.name)} × ${i.quantity} = ${formatPrice(i.subtotal)} ${escapeHtml(order.currency || "ETB")}</li>`
                        )
                        .join("")}
                </ul>
                <p><strong>Total:</strong> ${formatPrice(order.total)} ${escapeHtml(order.currency || "ETB")}</p>
                <p><strong>Payment:</strong> ${escapeHtml(order.paymentMethod)} | <strong>Reference:</strong> ${escapeHtml(order.paymentReference)}</p>
                ${order.paymentScreenshot ? `<button class="btn btn-outline btn-sm view-proof-btn" data-id="${order.id}">VIEW SCREENSHOT</button>` : ""}
                ${order.rejectionReason ? `<p class="error-message">Rejection: ${escapeHtml(order.rejectionReason)}</p>` : ""}
                <div class="admin-actions">${actions}</div>
            </div>
        `;
    }

    function renderOrderActions(order) {
        const buttons = [];
        if (order.status === "pending") {
            buttons.push(`<button class="btn btn-primary btn-sm approve-btn" data-id="${order.id}">APPROVE</button>`);
            buttons.push(`<button class="btn btn-danger btn-sm reject-btn" data-id="${order.id}">REJECT</button>`);
        } else if (order.status === "approved") {
            buttons.push(`<span class="success-message">✓ APPROVED</span>`);
            buttons.push(`<button class="btn btn-outline btn-sm deliver-btn" data-id="${order.id}">MARK DELIVERED</button>`);
        } else if (order.status === "rejected") {
            buttons.push(`<span class="error-message">✕ REJECTED</span>`);
        } else if (order.status === "delivered") {
            buttons.push(`<span class="success-message">DELIVERED</span>`);
        }
        return buttons.join("");
    }

    // ============================================================
    // Order Actions (Event Delegation)
    // ============================================================
    document.addEventListener("click", async (e) => {
        const approveBtn = e.target.closest(".approve-btn");
        const rejectBtn = e.target.closest(".reject-btn");
        const deliverBtn = e.target.closest(".deliver-btn");
        const viewBtn = e.target.closest(".view-proof-btn");

        if (approveBtn) {
            const id = Number(approveBtn.dataset.id);
            try {
                await TimeAPI.updateOrderStatus(id, "approved");
                showToast(`Order #${id} approved.`, "success");
                await loadOrders();
                await loadOverview();
            } catch (error) {
                showToast(error.message, "error");
            }
        }
        if (rejectBtn) {
            document.getElementById("reject-order-id").value = rejectBtn.dataset.id;
            document.getElementById("reject-reason").value = "";
            document.getElementById("reject-modal")?.classList.add("open");
        }
        if (deliverBtn) {
            const id = Number(deliverBtn.dataset.id);
            try {
                await TimeAPI.updateOrderStatus(id, "delivered");
                showToast(`Order #${id} delivered.`, "success");
                await loadOrders();
                await loadOverview();
            } catch (error) {
                showToast(error.message, "error");
            }
        }
        if (viewBtn) {
            const id = Number(viewBtn.dataset.id);
            window.open(`/api/orders/${id}/payment-proof`, "_blank");
        }
    });

    // ============================================================
    // Product Management
    // ============================================================
    async function loadProducts() {
        const container = document.getElementById("admin-products-list");
        if (!container) return;
        container.innerHTML = '<div class="loading-skeleton">Loading products...</div>';
        try {
            const response = await TimeAPI.getProducts();
            const products = response.products || [];
            if (!products.length) {
                container.innerHTML = `<div class="empty-state">No products found.</div>`;
                return;
            }
            container.innerHTML = products
                .map(
                    (p) => `
                    <div class="admin-card">
                        <div class="admin-card-header">
                            <strong>#${p.id} - ${escapeHtml(p.name)}</strong>
                            <span>${p.active ? "Active" : "Inactive"}</span>
                        </div>
                        <p>Price: ${formatPrice(p.price)} ${escapeHtml(p.currency || "ETB")} | Stock: ${p.stock}</p>
                        <div class="admin-actions">
                            <button class="btn btn-outline btn-sm edit-product-btn" data-id="${p.id}">EDIT</button>
                            <button class="btn btn-danger btn-sm delete-product-btn" data-id="${p.id}">DELETE</button>
                        </div>
                    </div>
                `
                )
                .join("");
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    document.addEventListener("click", async (e) => {
        if (e.target.classList.contains("edit-product-btn")) {
            const id = Number(e.target.dataset.id);
            try {
                const response = await TimeAPI.getProduct(id);
                if (response.product) openProductForm(response.product);
            } catch (error) {
                showToast(error.message, "error");
            }
        }
        if (e.target.classList.contains("delete-product-btn")) {
            if (confirm("Delete this product?")) {
                const id = Number(e.target.dataset.id);
                try {
                    await TimeAPI.deleteProduct(id);
                    showToast("Product deleted.", "success");
                    await loadProducts();
                    await loadOverview();
                } catch (error) {
                    showToast(error.message, "error");
                }
            }
        }
    });

    function openProductForm(product = null) {
        document.getElementById("product-form-title").textContent = product ? "EDIT PRODUCT" : "ADD PRODUCT";
        document.getElementById("product-name").value = product?.name || "";
        document.getElementById("product-description").value = product?.description || "";
        document.getElementById("product-price").value = product?.price || "";
        document.getElementById("product-image").value = product?.image || "";
        document.getElementById("product-category").value = product?.category || "Sneakers";
        document.getElementById("product-stock").value = product?.stock || 0;
        document.getElementById("product-active").checked = product?.active !== false;
        document.getElementById("product-id").value = product?.id || "";
        document.getElementById("product-form-modal")?.classList.add("open");
    }

    // ============================================================
    // Customer Management
    // ============================================================
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
                    (u) => `
                    <div class="admin-card">
                        <strong>${escapeHtml(u.name)}</strong> (${escapeHtml(u.email)})
                    </div>
                `
                )
                .join("");
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    // ============================================================
    // Admin Chat
    // ============================================================
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
                    (c) => `
                    <div class="conversation-item" data-id="${escapeHtml(c.conversationId)}">
                        <strong>${escapeHtml(c.customerName)} ${c.unreadCount ? `<span class="unread-badge">${c.unreadCount}</span>` : ""}</strong>
                        <small>${escapeHtml(c.latestMessage?.message?.slice(0, 60) || "")}</small>
                    </div>
                `
                )
                .join("");
            container.querySelectorAll(".conversation-item").forEach((item) => {
                item.addEventListener("click", () => openConversation(item.dataset.id));
            });
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function openConversation(id) {
        activeConversationId = id;
        document.querySelectorAll(".conversation-item").forEach((item) => {
            item.classList.toggle("active", item.dataset.id === id);
        });
        await loadAdminMessages();
        await TimeAPI.markMessagesRead(id);
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
                    (m) => `
                    <div class="chat-msg ${escapeHtml(m.sender)}">
                        <small>${escapeHtml(m.sender)} · ${formatTime(m.timestamp)}</small>
                        <div>${escapeHtml(m.message)}</div>
                    </div>
                `
                )
                .join("");
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    async function handleAdminChatSend(e) {
        e.preventDefault();
        const input = document.getElementById("admin-chat-input");
        if (!input) return;
        const message = input.value.trim();
        if (!message || !activeConversationId) return;
        try {
            await TimeAPI.sendMessage({ conversationId: activeConversationId, sender: "admin", message });
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

    // ============================================================
    // Settings
    // ============================================================
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

    function formatTime(isoString) {
        try {
            return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return isoString;
        }
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

// Global login function for inline onclick
window.adminLoginClicked = async function () {
    const password = document.getElementById("admin-password")?.value;
    const errBox = document.getElementById("admin-login-error");
    if (!password) {
        if (errBox) errBox.textContent = "Please enter a password.";
        return;
    }
    try {
        const response = await TimeAPI.adminLogin(password);
        if (response.success) {
            document.getElementById("admin-login").hidden = true;
            document.getElementById("admin-dashboard").hidden = false;
            location.reload(); // Reload to initialize dashboard fully
        } else {
            if (errBox) errBox.textContent = response.error || "Login failed.";
        }
    } catch (error) {
        if (errBox) errBox.textContent = error.message;
    }
};