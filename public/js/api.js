(function (global) {
    const API_BASE = "/api";

    async function request(path, options = {}) {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };

        const config = {
            ...options,
            headers,
        };

        if (options.body && typeof options.body !== "string") {
            config.body = JSON.stringify(options.body);
        }

        let response;
        try {
            response = await fetch(API_BASE + path, config);
        } catch (networkError) {
            throw new Error("Unable to connect to TIME BRAND server.");
        }

        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (parseError) {
            data = { success: false, error: "Invalid server response" };
        }

        if (!response.ok) {
            const message =
                (data && data.error) || `Request failed with status ${response.status}`;
            throw new Error(message);
        }

        return data;
    }

    const TimeAPI = {
        baseUrl: API_BASE,

        get: (path) => request(path),
        post: (path, body) => request(path, { method: "POST", body }),
        put: (path, body) => request(path, { method: "PUT", body }),
        patch: (path, body) => request(path, { method: "PATCH", body }),
        delete: (path) => request(path, { method: "DELETE" }),

        // Products
        getProducts: () => request("/products"),
        getProduct: (id) => request(`/products/${id}`),
        createProduct: (data) => request("/products", { method: "POST", body: data }),
        updateProduct: (id, data) => request(`/products/${id}`, { method: "PUT", body: data }),
        deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),

        // Orders
        getOrders: (userId) => {
            const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
            return request(`/orders${query}`);
        },
        getOrder: (id) => request(`/orders/${id}`),
        createOrder: (data) => request("/orders", { method: "POST", body: data }),
        updateOrder: (id, data) => request(`/orders/${id}`, { method: "PUT", body: data }),
        deleteOrder: (id) => request(`/orders/${id}`, { method: "DELETE" }),
        approveOrder: (id) => request(`/orders/${id}/approve`, { method: "POST" }),
        rejectOrder: (id, reason) => request(`/orders/${id}/reject`, { method: "POST", body: { reason } }),
        deliverOrder: (id) => request(`/orders/${id}/deliver`, { method: "POST" }),

        // Users
        getUsers: () => request("/users"),
        getUser: (id) => request(`/users/${id}`),
        createUser: (data) => request("/users", { method: "POST", body: data }),

        // Messages
        getMessages: (conversationId) =>
            request(`/messages/${encodeURIComponent(conversationId)}`),
        listConversations: () => request("/messages"),
        sendMessage: (data) => request("/messages", { method: "POST", body: data }),
        markMessagesRead: (conversationId) =>
            request(`/messages/${encodeURIComponent(conversationId)}/read`, { method: "PATCH" }),
        deleteConversation: (conversationId) =>
            request(`/messages/${encodeURIComponent(conversationId)}`, { method: "DELETE" }),

        // Admin auth
        adminLogin: (password) => request("/admin/login", { method: "POST", body: { password } }),
        adminLogout: () => request("/admin/logout", { method: "POST" }),
        adminCheck: () => request("/admin/check"),
    };

    global.TimeAPI = TimeAPI;
})(window);