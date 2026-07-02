import { ChatService } from '../../services/chat.service.js';
import { FriendsService } from '../../services/friends.service.js';

export class ChatModule {
    constructor() {
        this.chatService = new ChatService();
        this.friendsService = new FriendsService();
        this.currentChat = null;
        this.unsubscribeMessages = null;
        this.unsubscribeChats = null;
        this.editMessageId = null;
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = this.getTemplate();
        this.subscribeToChats();
        this.attachEventListeners();
    }

    getTemplate() {
        return `
            <div class="chat-page fade-in-up" style="height: calc(100vh - 120px);">
                <div class="row g-0" style="height: 100%;">
                    <div class="col-12 col-md-4 col-lg-3 border-end d-flex flex-column" style="height: 100%;">
                        <div class="d-flex justify-content-between align-items-center p-3 border-bottom flex-shrink-0">
                            <h5 class="fw-bold mb-0">
                                <i class="bi bi-chat-dots text-primary me-2"></i>Чаты
                            </h5>
                            <button class="btn btn-primary btn-sm rounded-circle" id="newChatBtn" title="Новый чат">
                                <i class="bi bi-plus-lg"></i>
                            </button>
                        </div>
                        <div id="chatList" class="flex-grow-1 overflow-auto"></div>
                    </div>

                    <div class="col-12 col-md-8 col-lg-9" style="height: 100%; position: relative;">
                        <div class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center text-muted" id="noChatSelected">
                            <div class="text-center">
                                <div class="mb-3">
                                    <i class="bi bi-chat-square-text display-1 opacity-15"></i>
                                </div>
                                <h5 class="fw-semibold">Выбери диалог</h5>
                                <p class="small">или начни новый, нажав <i class="bi bi-plus-lg"></i></p>
                            </div>
                        </div>

                        <div id="activeChat" class="position-absolute top-0 start-0 w-100 h-100" style="display: none;">
                            <div class="d-flex flex-column" style="height: 100%;">
                                <div class="p-3 border-bottom d-flex align-items-center justify-content-between flex-shrink-0" style="background: var(--bg-card);">
                                    <div class="d-flex align-items-center gap-2">
                                        <button class="btn btn-sm btn-link text-muted p-0 d-md-none" id="backToChatList">
                                            <i class="bi bi-arrow-left fs-5"></i>
                                        </button>
                                        <div id="chatPartnerAvatar"></div>
                                        <h6 class="fw-bold mb-0" id="chatPartnerName"></h6>
                                    </div>
                                    <div class="d-flex gap-1">
                                        <button class="btn btn-sm btn-outline-secondary" id="closeChatBtn" title="Закрыть">
                                            <i class="bi bi-x-lg"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger" id="deleteChatBtn" title="Удалить">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </div>
                                </div>

                                <div class="flex-grow-1 p-3 overflow-auto" id="chatMessages" style="background: var(--bg-secondary);">
                                    <div class="text-center text-muted py-5">
                                        <i class="bi bi-lock display-4 opacity-25"></i>
                                        <p class="mt-2">Сообщения защищены</p>
                                    </div>
                                </div>

                                <div class="p-3 border-top flex-shrink-0" style="background: var(--bg-card);">
                                    <div id="editMode" class="text-muted small mb-1" style="display: none;">
                                        <i class="bi bi-pencil me-1"></i>Редактирование
                                        <button class="btn btn-link btn-sm p-0" id="cancelEdit">Отмена</button>
                                    </div>
                                    <div class="input-group">
                                        <input type="text" class="form-control" id="messageInput"
                                               placeholder="Сообщение..." autocomplete="off">
                                        <button class="btn btn-primary" id="sendMessageBtn">
                                            <i class="bi bi-send"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="newChatModalContainer"></div>
            </div>
        `;
    }

    subscribeToChats() {
        this.unsubscribeChats = window.app.realtimeService.subscribeToChats(
            window.app.currentUser.uid,
            (chats) => {
                const chatList = document.getElementById('chatList');
                if (!chatList) return;

                if (chats.length === 0) {
                    chatList.innerHTML = `
                        <div class="text-center py-5 text-muted">
                            <i class="bi bi-chat-dots fs-3 opacity-25"></i>
                            <p class="mt-2">Нет диалогов</p>
                        </div>
                    `;
                    this.closeChat();
                    return;
                }

                chatList.innerHTML = chats.map(chat => {
                    const time = this.formatTime(chat.lastMessageTime);
                    const unreadBadge = chat.unread > 0
                        ? `<span class="badge bg-primary rounded-pill">${chat.unread}</span>`
                        : '';
                    const isActive = this.currentChat === chat.partnerId;

                    return `
                        <div class="chat-list-item p-3 border-bottom ${isActive ? 'active' : ''}"
                             data-partner-id="${chat.partnerId}">
                            <div class="d-flex align-items-center gap-2">
                                <div class="chat-avatar-placeholder">
                                    ${(chat.partnerName || 'U')[0].toUpperCase()}
                                </div>
                                <div class="flex-grow-1 min-width-0">
                                    <div class="d-flex justify-content-between align-items-center">
                                        <h6 class="fw-bold mb-0 text-truncate">${chat.partnerName}</h6>
                                        <small class="text-muted">${time}</small>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <small class="text-muted text-truncate">
                                            ${chat.lastMessage || 'Нет сообщений'}
                                        </small>
                                        ${unreadBadge}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                if (this.currentChat) {
                    const activeItem = document.querySelector(`[data-partner-id="${this.currentChat}"]`);
                    if (activeItem) activeItem.classList.add('active');
                }
            }
        );
    }

    async openChat(partnerId) {
        this.currentChat = partnerId;

        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }

        const userId = window.app.currentUser.uid;

        document.getElementById('noChatSelected').style.display = 'none';
        document.getElementById('activeChat').style.display = 'block';

        const partnerData = await window.app.realtimeService.getUserProfile(partnerId);
        document.getElementById('chatPartnerName').textContent = '@' + (partnerData?.username || 'Пользователь');
        document.getElementById('chatPartnerAvatar').innerHTML = `
            <div class="chat-avatar-placeholder">${(partnerData?.username || 'U')[0].toUpperCase()}</div>
        `;

        await this.chatService.markAsRead(userId, partnerId);

        const chatId = this.chatService.getChatId(userId, partnerId);
        const messagesContainer = document.getElementById('chatMessages');

        this.unsubscribeMessages = window.app.realtimeService.subscribeToMessages(chatId, (messages) => {
            if (messages.length === 0) {
                messagesContainer.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-chat-dots display-4 opacity-25"></i>
                        <p class="mt-2">Начните общение!</p>
                    </div>
                `;
            } else {
                messagesContainer.innerHTML = messages
                    .map(msg => this.createMessageBubble(msg, userId))
                    .join('');
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        });
    }

    createMessageBubble(message, userId) {
        const isMine = message.senderId === userId;
        const time = this.formatTime(message.createdAt);

        return `
            <div class="message-wrapper ${isMine ? 'message-mine' : 'message-theirs'}">
                <div class="message-bubble">
                    <div class="message-text">${this.escapeHtml(message.text)}</div>
                    <div class="message-meta">
                        <small class="message-time">${time}</small>
                        ${message.edited ? '<small class="text-muted ms-1">изм.</small>' : ''}
                    </div>
                    ${isMine ? `
                        <div class="message-actions">
                            <button class="btn btn-sm btn-link p-0 edit-msg-btn" data-msg-id="${message.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 text-danger delete-msg-btn" data-msg-id="${message.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text || !this.currentChat) return;

        const userId = window.app.currentUser.uid;
        const chatId = this.chatService.getChatId(userId, this.currentChat);

        if (this.editMessageId) {
            await this.chatService.editMessage(chatId, this.editMessageId, text);
            this.editMessageId = null;
            document.getElementById('editMode').style.display = 'none';
        } else {
            await this.chatService.sendMessage(chatId, userId, this.currentChat, text);
            window.app.onUserAction('send_message');
        }

        input.value = '';
        input.focus();
    }

    closeChat() {
        this.currentChat = null;

        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }

        document.getElementById('noChatSelected').style.display = '';
        document.getElementById('activeChat').style.display = 'none';

        document.querySelectorAll('.chat-list-item').forEach(i => i.classList.remove('active'));
    }

    async deleteChatLocal() {
        await this.chatService.deleteChatLocal(window.app.currentUser.uid, this.currentChat);
        this.closeChat();
        this.subscribeToChats();
        window.app.ui.showToast('Диалог удалён у тебя', 'info');
    }

    async deleteChatFull() {
        if (confirm('Удалить диалог и все сообщения навсегда?')) {
            await this.chatService.deleteChat(window.app.currentUser.uid, this.currentChat);
            this.closeChat();
            this.subscribeToChats();
            window.app.ui.showToast('Диалог удалён полностью', 'info');
        }
    }

    attachEventListeners() {
        document.getElementById('chatList')?.addEventListener('click', async (e) => {
            const item = e.target.closest('.chat-list-item');
            if (!item) return;

            document.querySelectorAll('.chat-list-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            await this.openChat(item.dataset.partnerId);
        });

        document.getElementById('sendMessageBtn')?.addEventListener('click', () => this.sendMessage());

        document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.getElementById('cancelEdit')?.addEventListener('click', () => {
            this.editMessageId = null;
            document.getElementById('editMode').style.display = 'none';
            document.getElementById('messageInput').value = '';
        });

        document.getElementById('newChatBtn')?.addEventListener('click', () => this.showNewChatModal());

        document.getElementById('closeChatBtn')?.addEventListener('click', () => this.closeChat());

        document.getElementById('backToChatList')?.addEventListener('click', () => this.closeChat());

        document.getElementById('deleteChatBtn')?.addEventListener('click', () => {
            if (confirm('OK — удалить у себя\nОтмена — удалить полностью')) {
                this.deleteChatLocal();
            } else {
                this.deleteChatFull();
            }
        });

        document.getElementById('chatMessages')?.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-msg-btn');
            const deleteBtn = e.target.closest('.delete-msg-btn');

            if (editBtn) {
                const msgId = editBtn.dataset.msgId;
                const bubble = editBtn.closest('.message-bubble');
                const text = bubble.querySelector('.message-text').textContent;
                document.getElementById('messageInput').value = text;
                this.editMessageId = msgId;
                document.getElementById('editMode').style.display = 'block';
                document.getElementById('messageInput').focus();
            }

            if (deleteBtn) {
                if (confirm('Удалить сообщение?')) {
                    const chatId = this.chatService.getChatId(
                        window.app.currentUser.uid,
                        this.currentChat
                    );
                    await this.chatService.deleteMessage(chatId, deleteBtn.dataset.msgId);
                }
            }
        });
    }

    async showNewChatModal() {
        document.getElementById('newChatModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');

        const friends = await this.friendsService.getFriends(window.app.currentUser.uid);

        const container = document.createElement('div');
        container.id = 'newChatModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="newChatModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold">
                                <i class="bi bi-plus-circle me-2"></i>Новый чат
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            ${friends.length === 0
                                ? `<div class="text-center py-4 text-muted">
                                    <i class="bi bi-people fs-3"></i>
                                    <p class="mt-2">У тебя нет друзей для чата</p>
                                </div>`
                                : friends.map(f => `
                                    <div class="d-flex align-items-center gap-2 p-2 friend-item"
                                         data-uid="${f.uid}"
                                         style="cursor: pointer; border-radius: 8px;">
                                        <div class="chat-avatar-placeholder" style="width: 36px; height: 36px; font-size: 14px;">
                                            ${(f.username || 'U')[0].toUpperCase()}
                                        </div>
                                        <span class="fw-semibold">@${f.username}</span>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('newChatModal'));
        modal.show();

        document.getElementById('newChatModal').addEventListener('hidden.bs.modal', () => {
            container.remove();
            document.body.style.overflow = '';
        });

        container.querySelectorAll('.friend-item').forEach(item => {
            item.addEventListener('click', async () => {
                await this.chatService.getOrCreateChat(window.app.currentUser.uid, item.dataset.uid);
                modal.hide();
                await this.openChat(item.dataset.uid);
            });
        });
    }

    formatTime(date) {
        if (!date) return '';
        const now = new Date();
        const msgDate = new Date(date);

        if (msgDate.toDateString() === now.toDateString()) {
            return msgDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }

        return msgDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    destroy() {
        if (this.unsubscribeMessages) this.unsubscribeMessages();
        if (this.unsubscribeChats) this.unsubscribeChats();
    }
}