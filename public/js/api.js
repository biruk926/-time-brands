/**
 * TIME BRAND - API Client
 * Centralized API communication layer.
 */
(function (global) {
    const API_BASE = "/api";

    /**
     * Core request function
     * Handles JSON parsing, error detection, and network failures.
     */
    async function request(path, options = {}) {
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };

        const config = {
            ...options,
            headers,
            credentials: "include", // For admin session cookies
        };

        if (options.body && typeof options.body !== "string") {
            config.body = JSON.stringify(options.body);
        }

        let response;
        try {
            response = await fetch(API_BASE + path, config);
        } catch (networkError) {
            console.error("[API] Network error:", networkError);
            throw new Error("Unable to connect to TIME BRAND server. Please check your internet connection.");
        }

        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (parseError) {
            console.error("[API] JSON parse error:", parseError);
            data = { success: false, error: "Invalid server response" };
        }

        if (!response.ok) {
            const message = (data && data.error) || `Request failed with status ${response.status}`;
            console.error(`[API] ${path} failed:`, message);
            throw new Error(message);
        }

        console.log(`[API] ${path} succeeded:`, data);
        return data;
    }

    /**
     * Public API interface
     */
    const TimeAPI = {
        // Generic methods
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
        updateOrderStatus: (id, status, reason = "") => {
            const body = { status };
            if (reason) body.reason = reason;
            return request(`/orders/${id}/status`, { method: "PUT", body });
        },
        deleteOrder: (id) => request(`/orders/${id}`, { method: "DELETE" }),

        // Users
        getUsers: () => request("/users"),
        getUser: (id) => request(`/users/${id}`),
        createUser: (data) => request("/users", { method: "POST", body: data }),

        // Messages
        getMessages: (conversationId) => request(`/messages/${encodeURIComponent(conversationId)}`),
        listConversations: () => request("/messages"),
        sendMessage: (data) => request("/messages", { method: "POST", body: data }),
        markMessagesRead: (conversationId) => request(`/messages/${encodeURIComponent(conversationId)}/read`, { method: "PATCH" }),
        deleteConversation: (conversationId) => request(`/messages/${encodeURIComponent(conversationId)}`, { method: "DELETE" }),

        // Admin auth
        adminLogin: (password) => request("/auth/login", { method: "POST", body: { password } }),
        adminLogout: () => request("/auth/logout", { method: "POST" }),
        adminCheck: () => request("/auth/check"),
    };

    global.TimeAPI = TimeAPI;
})(window);