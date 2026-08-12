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
            // ignore
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
            renderAccountForm();
            openModal("account-modal");
        });
    }

    function resolveUser(user) {
        closeModal("account-modal");
        if (window.__resolveIdentity) {
            const resolve = window.__resolveIdentity;
            window.__resolveIdentity = null;
            window.__rejectIdentity = null;
            resolve(user);
        }
    }

    function rejectUser(error) {
        closeModal("account-modal");
        if (window.__rejectIdentity) {
            const reject = window.__rejectIdentity;
            window.__resolveIdentity = null;
            window.__rejectIdentity = null;
            reject(error);
        }
    }

    async function loginOrRegister({ name, email, phone, register = false }) {
        const response = await TimeAPI.createUser({
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

    function renderAccountForm() {
        const container = document.getElementById("account-panel");
        if (!container) return;
        const user = getCachedUser();
        container.innerHTML = `
            <form id="account-form">
                <div class="form-group">
                    <label for="account-name">Full Name</label>
                    <input type="text" id="account-name" required value="${escapeHtml(user?.name || "")}" />
                </div>
                <div class="form-group">
                    <label for="account-email">Email Address</label>
                    <input type="email" id="account-email" required value="${escapeHtml(user?.email || "")}" />
                </div>
                <div class="form-group">
                    <label for="account-phone">Phone Number</label>
                    <input type="tel" id="account-phone" placeholder="094..." value="${escapeHtml(user?.phone || "")}" />
                </div>
                <div class="form-group checkbox-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="account-register" />
                        Register as returning customer
                    </label>
                </div>
                <div id="account-error" class="error-message" role="alert"></div>
                <div class="modal-actions">
                    <button type="submit" class="btn btn-primary">CONTINUE</button>
                </div>
            </form>
        `;

        container.querySelector("#account-form").addEventListener("submit", handleAccountSubmit);
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
            const user = await loginOrRegister({ name, email, phone, register });
            setCachedUser(user);
            resolveUser(user);
            if (typeof window.onUserUpdate === "function") window.onUserUpdate(user);
        } catch (error) {
            errorBox.textContent = error.message;
        }
    }

    function openAccountModal() {
        renderAccountForm();
        openModal("account-modal");
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add("open");
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove("open");
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

    global.TimeAuth = {
        getCachedUser,
        setCachedUser,
        clearCachedUser,
        ensureIdentity,
        requireUser,
        resolveUser,
        rejectUser,
        loginOrRegister,
        openAccountModal,
    };
})(window);