import { escapeHTML, safeDocumentId, safeCount } from '../../core/security.js';

import { ChatService } from '../../services/chat.service.js';
import { FriendsService } from '../../services/friends.service.js';

export class ChatModule {
    constructor() {
        this.chatService = new ChatService();
        this.friendsService = new FriendsService();
        this.currentChat = null;
        this.currentChatId = null;
        this.unsubscribeMessages = null;
        this.unsubscribeChats = null;
        this.editMessageId = null;
        this.partnerProfiles = new Map();
        this.latestMessages = [];
        this.loadedOlderMessages = [];
        this.historyCursor = null;
        this.loadingOlderMessages = false;
        this.blockStatus = null;
        this.blockActionPending = false;
        this.pendingOutboxMessages = [];
        this.chatService.chatV2.onOutboxChange = () => {
            void this.refreshPendingOutbox();
        };
        this.handleChatOnline = () => {
            void this.refreshBlockStatus();
            void this.refreshPendingOutbox();
        };
        this.handleChatOffline = () => this.applyBlockStatus(this.blockStatus || {});
        if (typeof window !== 'undefined') {
            window.addEventListener('online', this.handleChatOnline);
            window.addEventListener('offline', this.handleChatOffline);
        }
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = this.getTemplate();
        if (this.chatService.isV2Enabled) this.chatService.chatV2.startOutbox(userId);
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
                                        <button class="btn btn-sm btn-outline-danger d-none" id="blockChatUserBtn" title="Заблокировать пользователя">
                                            <i class="bi bi-shield-lock"></i>
                                        </button>
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
                                    <div id="chatBlockNotice" class="alert alert-warning py-2 px-3 small mb-2 d-none" role="status"></div>
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
                    const unreadCount = safeCount(chat.unread);
                    const unreadBadge = unreadCount > 0
                        ? `<span class="badge bg-primary rounded-pill">${unreadCount}</span>`
                        : '';
                    this.chatService.rememberChatId(window.app.currentUser.uid, chat.partnerId, chat.chatId || chat.id);
                    this.partnerProfiles.set(chat.partnerId, {
                        uid: chat.partnerId,
                        username: chat.partnerName,
                        displayName: chat.partnerName,
                        avatar: chat.partnerAvatar || null
                    });
                    const isActive = this.currentChat === chat.partnerId;

                    return `
                        <div class="chat-list-item p-3 border-bottom ${isActive ? 'active' : ''}"
                             data-partner-id="${escapeHTML(safeDocumentId(chat.partnerId))}"
                             data-chat-id="${escapeHTML(safeDocumentId(chat.chatId || chat.id))}">
                            <div class="d-flex align-items-center gap-2">
                                <div class="chat-avatar-placeholder">
                                    ${escapeHTML(String(chat.partnerName || 'U').charAt(0).toUpperCase())}
                                </div>
                                <div class="flex-grow-1 min-width-0">
                                    <div class="d-flex justify-content-between align-items-center">
                                        <h6 class="fw-bold mb-0 text-truncate">${escapeHTML(chat.partnerName)}</h6>
                                        <small class="text-muted">${time}</small>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <small class="text-muted text-truncate">
                                            ${escapeHTML(chat.lastMessage || 'Нет сообщений')}
                                        </small>
                                        ${unreadBadge}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                if (this.currentChat) {
                    const activeItem = [...document.querySelectorAll('.chat-list-item')].find(item => item.dataset.partnerId === this.currentChat);
                    if (activeItem) activeItem.classList.add('active');
                }
            }
        );
    }

    async openChat(partnerId, suppliedChatId = null) {
        const safePartnerId = safeDocumentId(partnerId);
        if (!safePartnerId) return;
        const openRequestId = (this.openChatRequestId || 0) + 1;
        this.openChatRequestId = openRequestId;
        const isCurrentOpen = () => this.openChatRequestId === openRequestId &&
            this.currentChat === safePartnerId && window.app.currentUser?.uid === userId;
        const userId = window.app.currentUser.uid;
        this.currentChat = safePartnerId;

        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }

        if (this.chatService.isV2Enabled) this.chatService.chatV2.startOutbox(userId);

        document.getElementById('noChatSelected').style.display = 'none';
        document.getElementById('activeChat').style.display = 'block';

        let partnerData = this.partnerProfiles.get(partnerId) || null;
        if (!partnerData && this.chatService.isV2Enabled) {
            try {
                const contacts = await this.chatService.chatV2.getContacts();
                if (!isCurrentOpen()) return;
                partnerData = contacts.find(contact => contact.uid === partnerId) || null;
                if (partnerData) this.partnerProfiles.set(partnerId, partnerData);
            } catch (error) {
                if (!isCurrentOpen()) return;
                console.error('Не удалось загрузить профиль собеседника:', error);
            }
        } else if (!partnerData) {
            partnerData = await window.app.realtimeService.getUserProfile(partnerId);
            if (!isCurrentOpen()) return;
        }
        if (!isCurrentOpen()) return;
        document.getElementById('chatPartnerName').textContent = '@' + (partnerData?.username || 'Пользователь');
        document.getElementById('chatPartnerAvatar').innerHTML = `
            <div class="chat-avatar-placeholder">${escapeHTML(String(partnerData?.username || 'U').charAt(0).toUpperCase())}</div>
        `;

        let chatId = suppliedChatId || this.chatService.getChatId(userId, partnerId);
        if (this.chatService.isV2Enabled && (!suppliedChatId && chatId.includes('_'))) {
            chatId = await this.chatService.getOrCreateChat(userId, partnerId);
            if (!isCurrentOpen()) return;
        }
        if (!isCurrentOpen()) return;
        if (!chatId) {
            window.app.ui.showToast('Не удалось открыть диалог. Попробуй ещё раз.', 'danger');
            this.closeChat();
            return;
        }
        this.chatService.rememberChatId(userId, partnerId, chatId);
        this.currentChatId = chatId;
        this.blockStatus = null;
        this.applyBlockStatus({
            blockedByMe: false,
            blockedByPartner: false,
            canSend: false,
            checking: true
        });
        if (this.chatService.isV2Enabled) {
            try {
                this.blockStatus = await this.chatService.getBlockStatus(chatId);
                if (!isCurrentOpen()) return;
                this.applyBlockStatus(this.blockStatus);
            } catch (error) {
                if (!isCurrentOpen()) return;
                console.error('Не удалось проверить блокировку чата:', error);
                this.blockStatus = globalThis.navigator?.onLine === false
                    ? { blockedByMe: false, blockedByPartner: false, canSend: false, offline: true }
                    : { blockedByMe: false, blockedByPartner: false, canSend: false, error: true };
                this.applyBlockStatus(this.blockStatus);
            }
        } else {
            this.blockStatus = { blockedByMe: false, blockedByPartner: false, canSend: true };
            this.applyBlockStatus(this.blockStatus);
        }
        await this.chatService.markAsRead(userId, partnerId);
        if (!isCurrentOpen()) return;
        this.latestMessages = [];
        this.loadedOlderMessages = [];
        this.historyCursor = null;
        this.loadingOlderMessages = false;
        const deleteChatButton = document.getElementById('deleteChatBtn');
        if (deleteChatButton) deleteChatButton.classList.toggle('d-none', this.chatService.isV2Enabled);
        document.getElementById('editMode')?.classList.toggle('d-none', this.chatService.isV2Enabled);
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        this.unsubscribeMessages = window.app.realtimeService.subscribeToMessages(chatId, (messages) => {
            if (!isCurrentOpen() || this.currentChatId !== chatId) return;
            const oldHeight = messagesContainer.scrollHeight;
            const oldTop = messagesContainer.scrollTop;
            const nearBottom = oldHeight - oldTop - messagesContainer.clientHeight < 96;
            if (this.loadedOlderMessages.length > 0 && this.latestMessages.length > 0 && messages.length > 0) {
                const boundary = new Date(messages[0].createdAt).getTime();
                const dropped = this.latestMessages.filter(message =>
                    new Date(message.createdAt).getTime() < boundary
                );
                const olderById = new Map();
                [...this.loadedOlderMessages, ...dropped].forEach(message => olderById.set(message.id, message));
                this.loadedOlderMessages = [...olderById.values()].sort((left, right) =>
                    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
                );
            }
            this.latestMessages = messages;
            if (this.loadedOlderMessages.length === 0) {
                this.historyCursor = messages[0]?.id || null;
            }
            const combined = this.getCombinedMessages();
            this.renderMessageList(messagesContainer, combined, userId);
            if (nearBottom) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } else {
                messagesContainer.scrollTop = oldTop + (messagesContainer.scrollHeight - oldHeight);
            }
        });
        void this.refreshPendingOutbox();
    }

    async refreshBlockStatus() {
        if (!this.chatService.isV2Enabled || !this.currentChatId) return;
        try {
            this.blockStatus = await this.chatService.getBlockStatus(this.currentChatId);
        } catch (error) {
            console.error('Не удалось обновить статус блокировки:', error);
            this.blockStatus = {
                blockedByMe: false,
                blockedByPartner: false,
                canSend: false,
                error: true
            };
        }
        this.applyBlockStatus(this.blockStatus);
    }

    async refreshPendingOutbox() {
        if (!this.chatService.isV2Enabled || !this.currentChatId || !window.app.currentUser?.uid) return;
        const chatId = this.currentChatId;
        const userId = window.app.currentUser.uid;
        try {
            const pending = await this.chatService.chatV2.getPendingMessages(userId, chatId);
            if (this.currentChatId !== chatId || window.app.currentUser?.uid !== userId) return;
            this.pendingOutboxMessages = pending.map(message => ({
                ...message,
                deliveryState: message.deliveryState || 'queued'
            }));
            const container = document.getElementById('chatMessages');
            if (container) this.renderMessageList(container, this.getCombinedMessages(), userId);
        } catch (error) {
            console.error('Не удалось восстановить локальные сообщения:', error);
            window.app.ui.showToast('Не удалось прочитать зашифрованную очередь сообщений.', 'warning');
        }
    }

    applyBlockStatus(status) {
        const blockButton = document.getElementById('blockChatUserBtn');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendMessageBtn');
        const notice = document.getElementById('chatBlockNotice');
        if (!blockButton || !messageInput || !sendButton || !notice) return;

        const v2Enabled = this.chatService.isV2Enabled;
        blockButton.classList.toggle('d-none', !v2Enabled);
        blockButton.disabled = this.blockActionPending || Boolean(status.error) ||
            globalThis.navigator?.onLine === false;
        blockButton.innerHTML = status.blockedByMe
            ? '<i class="bi bi-shield-check"></i>'
            : '<i class="bi bi-shield-lock"></i>';
        blockButton.title = status.blockedByMe ? 'Разблокировать пользователя' : 'Заблокировать пользователя';
        blockButton.setAttribute('aria-label', blockButton.title);

        const offlineQueueAvailable = v2Enabled &&
            globalThis.navigator?.onLine === false &&
            this.chatService.chatV2.isOutboxAvailable &&
            !status.blockedByMe && !status.blockedByPartner;
        const canSend = (status.canSend === true && !status.checking) || offlineQueueAvailable;
        messageInput.disabled = !canSend;
        sendButton.disabled = !canSend;
        notice.classList.toggle('d-none', (canSend && !offlineQueueAvailable) || !v2Enabled);
        if (offlineQueueAvailable) {
            notice.textContent = 'Нет интернета. Сообщение будет сохранено на устройстве в зашифрованном виде.';
        } else if (status.error) {
            notice.textContent = 'Не удалось проверить блокировку. Отправка временно отключена.';
        } else if (status.checking) {
            notice.textContent = 'Проверяем настройки безопасности диалога…';
        } else if (status.blockedByMe) {
            notice.textContent = 'Ты заблокировал(а) этого пользователя. Разблокируй его, чтобы продолжить общение.';
        } else if (status.blockedByPartner) {
            notice.textContent = 'Этот пользователь ограничил возможность получать от тебя сообщения.';
        } else {
            notice.textContent = '';
        }
    }

    async toggleChatBlock() {
        if (!this.chatService.isV2Enabled || !this.currentChat || !this.currentChatId ||
            this.blockActionPending || !this.blockStatus || this.blockStatus.error) return;

        this.blockActionPending = true;
        this.applyBlockStatus(this.blockStatus);
        const targetUid = this.currentChat;
        try {
            if (this.blockStatus.blockedByMe) {
                await this.chatService.unblockUser(targetUid);
            } else {
                const confirmed = window.confirm('Заблокировать пользователя? Он не сможет отправлять тебе сообщения, а ты — ему.');
                if (!confirmed) return;
                await this.chatService.blockUser(targetUid);
            }
            this.blockStatus = await this.chatService.getBlockStatus(this.currentChatId);
            this.applyBlockStatus(this.blockStatus);
            window.app.ui.showToast(
                this.blockStatus.blockedByMe ? 'Пользователь заблокирован.' : 'Блокировка снята.',
                'success'
            );
        } catch (error) {
            console.error('Не удалось изменить блокировку:', error);
            window.app.ui.showToast(error?.message || 'Не удалось изменить блокировку.', 'danger');
        } finally {
            this.blockActionPending = false;
            if (this.blockStatus) this.applyBlockStatus(this.blockStatus);
        }
    }

    getCombinedMessages() {
        const byId = new Map();
        this.pendingOutboxMessages.forEach(message => byId.set(message.id, message));
        [...this.loadedOlderMessages, ...this.latestMessages].forEach(message => {
            byId.set(message.id, message);
        });
        return [...byId.values()].sort((left, right) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        );
    }

    renderMessageList(container, messages, userId) {
        if (!container) return;
        if (messages.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-chat-dots display-4 opacity-25"></i>
                    <p class="mt-2">Начните общение!</p>
                </div>
            `;
            return;
        }
        container.innerHTML = messages
            .map(message => this.createMessageBubble(message, userId))
            .join('');
    }

    async loadOlderMessages() {
        if (!this.chatService.isV2Enabled || !this.currentChatId ||
            !this.historyCursor || this.loadingOlderMessages) return;
        const container = document.getElementById('chatMessages');
        if (!container) return;

        this.loadingOlderMessages = true;
        const oldHeight = container.scrollHeight;
        const oldTop = container.scrollTop;
        try {
            const page = await this.chatService.chatV2.getHistoryPage(
                this.currentChatId,
                this.historyCursor
            );
            const knownIds = new Set([
                ...this.loadedOlderMessages,
                ...this.latestMessages
            ].map(message => message.id));
            const older = page.messages.filter(message => !knownIds.has(message.id));
            await this.chatService.markMessagesRead(
                window.app.currentUser.uid,
                this.currentChatId,
                older
            );
            this.loadedOlderMessages = [...older, ...this.loadedOlderMessages];
            this.historyCursor = page.nextCursor;
            this.renderMessageList(container, this.getCombinedMessages(), window.app.currentUser.uid);
            container.scrollTop = oldTop + (container.scrollHeight - oldHeight);
        } catch (error) {
            console.error('Не удалось загрузить старые сообщения:', error);
            window.app.ui.showToast('Не удалось загрузить предыдущие сообщения.', 'warning');
        } finally {
            this.loadingOlderMessages = false;
        }
    }

    createMessageBubble(message, userId) {
        const isMine = message.senderId === userId;
        const time = this.formatTime(message.createdAt);
        const deliveryIndicator = message.deliveryState === 'blocked'
            ? '<i class="bi bi-exclamation-circle text-danger ms-1" title="Не отправлено: доступ ограничен"></i>'
            : message.deliveryState === 'queued'
                ? '<i class="bi bi-clock-history text-muted ms-1" title="Сохранено на устройстве, ожидает отправки"></i>'
                : (isMine && this.chatService.isV2Enabled
                    ? (message.read
                        ? '<i class="bi bi-check2-all text-primary ms-1" title="Прочитано"></i>'
                        : '<i class="bi bi-check2 text-muted ms-1" title="Отправлено"></i>')
                    : '');

        return `
            <div class="message-wrapper ${isMine ? 'message-mine' : 'message-theirs'}">
                <div class="message-bubble">
                    <div class="message-text">${this.escapeHtml(message.text)}</div>
                    <div class="message-meta">
                        <small class="message-time">${time}</small>
                        ${message.edited ? '<small class="text-muted ms-1">изм.</small>' : ''}
                        ${deliveryIndicator}
                    </div>
                    ${isMine && !this.chatService.isV2Enabled ? `
                        <div class="message-actions">
                            <button class="btn btn-sm btn-link p-0 edit-msg-btn" data-msg-id="${escapeHTML(safeDocumentId(message.id))}">
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
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text || !this.currentChat) return;

        const userId = window.app.currentUser.uid;
        const chatId = this.currentChatId || this.chatService.getChatId(userId, this.currentChat);

        if (this.editMessageId && !this.chatService.isV2Enabled) {
            await this.chatService.editMessage(chatId, this.editMessageId, text);
            this.editMessageId = null;
            document.getElementById('editMode').style.display = 'none';
        } else {
            const result = await this.chatService.sendMessage(chatId, userId, this.currentChat, text);
            if (result?.queued) {
                await this.refreshPendingOutbox();
                window.app.ui.showToast('Сообщение сохранено на устройстве и отправится после восстановления интернета.', 'info');
            } else if (!result?.success) {
                if (this.chatService.isV2Enabled && result?.code === 'permission-denied') {
                    try {
                        this.blockStatus = await this.chatService.getBlockStatus(chatId);
                    } catch {
                        this.blockStatus = {
                            blockedByMe: false,
                            blockedByPartner: false,
                            canSend: false,
                            error: true
                        };
                    }
                    this.applyBlockStatus(this.blockStatus);
                }
                window.app.ui.showToast(result?.error || 'Не удалось отправить сообщение.', 'danger');
                return;
            } else {
                window.app.onUserAction('send_message');
            }
        }

        input.value = '';
        input.focus();
    }

    resetSession() {
        this.closeChat();
        this.partnerProfiles.clear();
        this.chatService.resetSession();
    }

    closeChat() {
        this.openChatRequestId = (this.openChatRequestId || 0) + 1;
        this.currentChat = null;
        this.currentChatId = null;

        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }
        this.latestMessages = [];
        this.loadedOlderMessages = [];
        this.historyCursor = null;
        this.loadingOlderMessages = false;
        this.blockStatus = null;
        this.blockActionPending = false;
        this.pendingOutboxMessages = [];

        const emptyState = document.getElementById('noChatSelected');
        const activeChat = document.getElementById('activeChat');
        if (emptyState) emptyState.style.display = '';
        if (activeChat) activeChat.style.display = 'none';

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

            await this.openChat(item.dataset.partnerId, item.dataset.chatId);
        });

        document.getElementById('chatMessages')?.addEventListener('scroll', () => {
            if (this.chatService.isV2Enabled && document.getElementById('chatMessages').scrollTop <= 32) {
                void this.loadOlderMessages();
            }
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
        document.getElementById('blockChatUserBtn')?.addEventListener('click', () => this.toggleChatBlock());

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

        let friends;
        try {
            friends = this.chatService.isV2Enabled
                ? await this.chatService.chatV2.getContacts()
                : await this.friendsService.getFriends(window.app.currentUser.uid);
        } catch (error) {
            console.error('Не удалось загрузить контакты для чата:', error);
            window.app.ui.showToast('Не удалось загрузить список друзей.', 'danger');
            return;
        }
        friends.forEach(friend => this.partnerProfiles.set(friend.uid, friend));

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
                                         data-uid="${escapeHTML(safeDocumentId(f.uid))}"
                                         style="cursor: pointer; border-radius: 8px;">
                                        <div class="chat-avatar-placeholder" style="width: 36px; height: 36px; font-size: 14px;">
                                            ${escapeHTML(String(f.username || 'U').charAt(0).toUpperCase())}
                                        </div>
                                        <span class="fw-semibold">@${escapeHTML(f.username)}</span>
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
                const chatId = await this.chatService.getOrCreateChat(window.app.currentUser.uid, item.dataset.uid);
                if (!chatId) {
                    window.app.ui.showToast('Не удалось создать диалог.', 'danger');
                    return;
                }
                modal.hide();
                await this.openChat(item.dataset.uid, this.chatService.isV2Enabled ? chatId : null);
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