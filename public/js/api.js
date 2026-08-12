(function (global) {
    const API_BASE = window.location.origin + "/api";

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

    global.TimeAPI = {
        get: (path) => request(path),
        post: (path, body) => request(path, { method: "POST", body }),
        put: (path, body) => request(path, { method: "PUT", body }),
        patch: (path, body) => request(path, { method: "PATCH", body }),
        delete: (path) => request(path, { method: "DELETE" }),
        apiBase: API_BASE,
    };
})(window);