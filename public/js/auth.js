(function (global) {
    const STORAGE_KEY = "timebrand_user";

    function getCachedUser() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch (error) {
            return null;
        }
    }

    function setCachedUser(user) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        } catch (error) {
            // localStorage may be unavailable; user identity will be kept in memory only.
        }
    }

    function clearCachedUser() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            // ignore
        }
    }

    async function ensureIdentity() {
        return getCachedUser();
    }

    function requireUser() {
        const cached = getCachedUser();
        if (cached && cached.id) {
            return Promise.resolve(cached);
        }

        return new Promise((resolve, reject) => {
            const modal = document.getElementById("account-modal");
            if (!modal) {
                reject(new Error("Account modal is missing"));
                return;
            }
            window.__resolveIdentity = resolve;
            window.__rejectIdentity = reject;
            modal.classList.add("open");
        });
    }

    function resolveUser(user) {
        const modal = document.getElementById("account-modal");
        if (modal) modal.classList.remove("open");
        if (window.__resolveIdentity) {
            const resolve = window.__resolveIdentity;
            window.__resolveIdentity = null;
            window.__rejectIdentity = null;
            resolve(user);
        }
    }

    function rejectUser(error) {
        const modal = document.getElementById("account-modal");
        if (modal) modal.classList.remove("open");
        if (window.__rejectIdentity) {
            const reject = window.__rejectIdentity;
            window.__resolveIdentity = null;
            window.__rejectIdentity = null;
            reject(error);
        }
    }

    async function loginOrRegister({ name, email, phone, register = false }) {
        const response = await TimeAPI.post("/users", {
            name,
            email,
            phone,
            register: !!register,
        });

        if (response.success && response.user) {
            setCachedUser(response.user);
            return response.user;
        }

        throw new Error(response.error || "Could not save customer identity");
    }

    global.TimeAuth = {
        getCachedUser,
        setCachedUser,
        clearCachedUser,
        ensureIdentity,
        requireUser,
        resolveUser,
        rejectUser,
        loginOrRegister,
    };
})(window);