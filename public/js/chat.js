(function () {
    let chatPollTimer = null;
    let activeConversationId = null;

    document.addEventListener("DOMContentLoaded", () => {
        const chatButton = document.getElementById("chat-btn");
        const chatModal = document.getElementById("chat-modal");
        const chatForm = document.getElementById("chat-form");

        chatButton.addEventListener("click", () => {
            openChat();
        });

        chatForm.addEventListener("submit", handleSendMessage);

        if (chatModal) {
            chatModal.addEventListener("click", (event) => {
                if (event.target === chatModal) {
                    chatModal.classList.remove("open");
                    stopPolling();
                }
            });
        }
    });

    async function openChat() {
        try {
            const user = await TimeAuth.requireUser();
            activeConversationId = user.id;
            const modal = document.getElementById("chat-modal");
            modal.classList.add("open");
            await loadMessages();
            startPolling();
        } catch (error) {
            if (error.message !== "Cancelled") alert(error.message);
        }
    }

    async function loadMessages() {
        if (!activeConversationId) return;
        try {
            const response = await TimeAPI.get(
                `/messages/${encodeURIComponent(activeConversationId)}`
            );
            renderMessages(response.messages || []);
        } catch (error) {
            const container = document.getElementById("chat-messages");
            container.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    }

    function renderMessages(messages) {
        const container = document.getElementById("chat-messages");
        if (!container) return;
        container.innerHTML = messages
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
    }

    async function handleSendMessage(event) {
        event.preventDefault();
        const input = document.getElementById("chat-input");
        const message = input.value.trim();
        if (!message || !activeConversationId) return;

        try {
            await TimeAPI.post("/messages", {
                conversationId: activeConversationId,
                sender: "user",
                message,
            });
            input.value = "";
            await loadMessages();
        } catch (error) {
            alert(error.message);
        }
    }

    function startPolling() {
        stopPolling();
        chatPollTimer = setInterval(loadMessages, 5000);
    }

    function stopPolling() {
        if (chatPollTimer) {
            clearInterval(chatPollTimer);
            chatPollTimer = null;
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

    function formatDate(isoString) {
        if (!isoString) return "";
        try {
            return new Date(isoString).toLocaleTimeString();
        } catch (error) {
            return isoString;
        }
    }
})();