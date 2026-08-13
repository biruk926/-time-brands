/**
 * TIME BRAND - Customer Chat
 * Handles the floating chat widget and message polling.
 */
(function () {
    let chatPollTimer = null;
    let activeConversationId = null;
    let currentUser = null;

    document.addEventListener("DOMContentLoaded", () => {
        currentUser = TimeAuth.getCachedUser();

        const chatWidgetBtn = document.getElementById("chat-widget-btn");
        const footerChatBtn = document.getElementById("footer-chat-btn");
        const chatForm = document.getElementById("chat-form");

        if (chatWidgetBtn) chatWidgetBtn.addEventListener("click", openChat);
        if (footerChatBtn) footerChatBtn.addEventListener("click", openChat);
        if (chatForm) chatForm.addEventListener("submit", handleSendMessage);
    });

    function openChat() {
        TimeAuth.requireUser()
            .then((user) => {
                currentUser = user;
                activeConversationId = user.id;
                const drawer = document.getElementById("chat-drawer");
                if (drawer) drawer.classList.add("open");
                loadMessages();
                startPolling();
            })
            .catch((error) => {
                if (error.message !== "Cancelled") {
                    showToast(error.message, "error");
                }
            });
    }

    async function loadMessages() {
        if (!activeConversationId) return;
        const container = document.getElementById("chat-messages");
        if (!container) return;

        try {
            const response = await TimeAPI.getMessages(activeConversationId);
            renderMessages(response.messages || []);
        } catch (error) {
            container.innerHTML = `<div class="empty-state">UNABLE TO LOAD MESSAGES<br/>${escapeHtml(error.message)}</div>`;
        }
    }

    function renderMessages(messages) {
        const container = document.getElementById("chat-messages");
        if (!container) return;

        if (!messages.length) {
            container.innerHTML = `<div class="empty-state">START A CONVERSATION<br/>Our support team is here to help.</div>`;
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
    }

    async function handleSendMessage(event) {
        event.preventDefault();
        const input = document.getElementById("chat-input");
        if (!input) return;
        const message = input.value.trim();
        if (!message || !activeConversationId) return;

        try {
            await TimeAPI.sendMessage({
                conversationId: activeConversationId,
                sender: "user",
                message,
            });
            input.value = "";
            await loadMessages();
        } catch (error) {
            showToast(error.message, "error");
        }
    }

    function startPolling() {
        stopPolling();
        chatPollTimer = setInterval(loadMessages, 5000); // Poll every 5 seconds
    }

    function stopPolling() {
        if (chatPollTimer) {
            clearInterval(chatPollTimer);
            chatPollTimer = null;
        }
    }

    // Close drawer when overlay or close button clicked
    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-close-drawer]")) {
            const drawer = event.target.closest(".drawer");
            if (drawer) {
                drawer.classList.remove("open");
                if (drawer.id === "chat-drawer") {
                    stopPolling();
                }
            }
        }
    });

    function showToast(message, type = "info") {
        const container = document.getElementById("toast-container");
        if (!container) return;
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
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

    function formatTime(isoString) {
        if (!isoString) return "";
        try {
            return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (error) {
            return isoString;
        }
    }

    window.TimeChat = { openChat };
})();