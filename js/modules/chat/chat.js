import { ChatService } from '../../services/chat.service.js';
import { escapeHTML } from '../../core/escape-html.js';
import { safeCount } from '../../core/home-snapshot.js';
import { FriendsService } from '../../services/friends.service.js';

export class ChatModule {
    constructor() {
        this.chatService = new ChatService();
        this.friendsService = new FriendsService();
        this.currentChat = null;
        this.unsubscribeMessages = null;
        this.unsubscribeChats = null;
        this.editMessageId = null;
        this.chatGeneration = 0;
    }

    async render(params = {}) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        // A fresh render must not keep the previous conversation's listener.
        if (this.unsubscribeMessages) this.unsubscribeMessages();
        if (this.unsubscribeChats) this.unsubscribeChats();
        this.unsubscribeMessages = null;
        this.unsubscribeChats = null;
        this.currentChat = null;
        this.chatGeneration++;
        this.editMessageId = null;

        mainContent.innerHTML = this.getTemplate();
        this.setMobileChatView(false);
        document.getElementById('chatList').innerHTML = '<p class="text-muted text-center py-5">Загружаем диалоги…</p>';
        this.subscribeToChats();
        this.attachEventListeners();

        const partnerId = params.id;
        if (!partnerId || partnerId === userId) return;
        try {
            const chatId = await this.chatService.getOrCreateChat(userId, partnerId);
            if (!chatId) throw new Error('Не удалось создать диалог');
            if (window.app.currentUser?.uid !== userId ||
                window.app.router.getCurrentRoute() !== 'chat' ||
                window.location.hash.split('/')[1] !== partnerId) return;
            await this.openChat(partnerId);
        } catch (error) {
            console.error('Не удалось открыть диалог из профиля:', error);
            if (window.app.currentUser?.uid === userId &&
                window.app.router.getCurrentRoute() === 'chat') {
                window.app.ui.showToast('Не удалось открыть чат. Попробуй ещё раз.', 'error');
            }
        }
    }

    getTemplate() {
        return `
            <div class="chat-page fade-in-up" style="height: calc(100vh - 120px);">
                <div class="row g-0" style="height: 100%;">
                    <div id="chatSidebar" class="col-12 col-md-4 col-lg-3 border-end d-flex flex-column" style="height: 100%;">
                        <div class="d-flex justify-content-between align-items-center p-3 border-bottom flex-shrink-0">
                            <h5 class="fw-bold mb-0">
                                <i class="bi bi-chat-dots text-primary me-2"></i>Чаты
                            </h5>
                            <button class="btn btn-primary btn-sm rounded-circle" id="newChatBtn" title="Новый чат">
                                <i class="bi bi-plus-lg"></i>
                            </button>
                        </div>
                        <div class="px-3 py-2 border-bottom">
                            <label class="visually-hidden" for="chatSearchInput">Поиск по диалогам</label>
                            <input id="chatSearchInput" type="search" class="form-control form-control-sm"
                                   placeholder="Найти переписку…" autocomplete="off" maxlength="100">
                        </div>
                        <div id="chatList" class="flex-grow-1 overflow-auto"></div>
                    </div>

                    <div id="chatDetail" class="col-12 col-md-8 col-lg-9" style="height: 100%; position: relative;">
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
                                        <p class="mt-2">Сообщения диалога</p>
                                    </div>
                                </div>

                                <div class="p-3 border-top flex-shrink-0" style="background: var(--bg-card);">
                                    <div id="editMode" class="text-muted small mb-1" style="display: none;">
                                        <i class="bi bi-pencil me-1"></i>Редактирование
                                        <button class="btn btn-link btn-sm p-0" id="cancelEdit">Отмена</button>
                                    </div>
                                    <div class="input-group">
                                        <input type="text" class="form-control" id="messageInput" maxlength="2000" aria-label="Сообщение"
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
            (chats, error) => {
                const chatList = document.getElementById('chatList');
                if (!chatList || !document.querySelector('.chat-page')) return;

                if (error) {
                    chatList.innerHTML = `
                        <div class="text-center py-5 px-3">
                            <p class="text-danger small">Не удалось загрузить диалоги</p>
                            <button type="button" class="btn btn-outline-primary btn-sm" id="retryChatListBtn">Повторить</button>
                        </div>`;
                    chatList.querySelector('#retryChatListBtn')?.addEventListener('click', () => {
                        chatList.innerHTML = '<p class="text-muted text-center py-5">Загружаем диалоги…</p>';
                        this.subscribeToChats();
                    });
                    return;
                }

                if (chats.length === 0) {
                    chatList.innerHTML = `
                        <div class="text-center py-5 text-muted">
                            <i class="bi bi-chat-dots fs-3 opacity-25"></i>
                            <p class="mt-2">Нет диалогов</p>
                        </div>
                    `;
                    // Empty initial snapshots can arrive while a new conversation is opening.
                    if (!this.currentChat) this.closeChat();
                    return;
                }

                chatList.innerHTML = chats.map(chat => {
                    const time = this.formatTime(chat.lastMessageTime);
                    const unreadBadge = chat.unread > 0
                        ? `<span class="badge bg-primary rounded-pill">${safeCount(chat.unread)}</span>`
                        : '';
                    const isActive = this.currentChat === chat.partnerId;
                    const hasUnread = safeCount(chat.unread) > 0;

                    return `
                        <div class="chat-list-item p-3 border-bottom ${isActive ? 'active' : ''} ${hasUnread ? 'bg-primary bg-opacity-10' : ''}"
                             data-partner-id="${escapeHTML(chat.partnerId)}">
                            <div class="d-flex align-items-center gap-2">
                                <div class="chat-avatar-placeholder">
                                    ${escapeHTML(String(chat.partnerName || 'U').charAt(0).toUpperCase())}
                                </div>
                                <div class="flex-grow-1 min-width-0">
                                    <div class="d-flex justify-content-between align-items-center">
                                        <h6 class="fw-bold mb-0 text-truncate">${escapeHTML(chat.partnerName || 'Пользователь')}${hasUnread ? ' <span class="visually-hidden">Есть непрочитанные сообщения</span>' : ''}</h6>
                                        <small class="text-muted">${time}</small>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <small class="${hasUnread ? 'fw-semibold text-body' : 'text-muted'} text-truncate">
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
                    const activeItem = Array.from(chatList.querySelectorAll('.chat-list-item'))
                        .find(item => item.dataset.partnerId === this.currentChat);
                    if (activeItem) activeItem.classList.add('active');
                }
                this.filterChatList();
            }
        );
    }

    filterChatList() {
        const chatList = document.getElementById('chatList');
        const search = document.getElementById('chatSearchInput');
        if (!chatList || !search) return;
        const query = search.value.trim().toLocaleLowerCase('ru-RU');
        let visible = 0;
        chatList.querySelectorAll('.chat-list-item').forEach(item => {
            const searchable = (item.querySelector('h6')?.textContent || '') + ' ' +
                (item.querySelector('.text-truncate.small, small.text-truncate')?.textContent || '');
            const matched = searchable.toLocaleLowerCase('ru-RU').includes(query);
            item.hidden = !matched;
            item.style.display = matched ? '' : 'none';
            if (matched) visible++;
        });
        chatList.querySelector('#chatSearchEmpty')?.remove();
        if (query && !visible && chatList.querySelector('.chat-list-item')) {
            const empty = document.createElement('p');
            empty.id = 'chatSearchEmpty';
            empty.className = 'text-center text-muted small py-4 px-2';
            empty.textContent = 'Ничего не найдено';
            chatList.appendChild(empty);
        }
    }

    setMobileChatView(isOpen) {
        document.querySelector('.chat-page')?.classList.toggle('has-active-chat', isOpen);
    }

    async openChat(partnerId) {
        if (!partnerId || !window.app.currentUser?.uid) return;
        const generation = ++this.chatGeneration;
        this.currentChat = partnerId;
        this.editMessageId = null;

        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }

        const userId = window.app.currentUser.uid;
        const noSelection = document.getElementById('noChatSelected');
        const activeChat = document.getElementById('activeChat');
        const messagesContainer = document.getElementById('chatMessages');
        if (!noSelection || !activeChat || !messagesContainer) return;

        const stillActive = () =>
            this.chatGeneration === generation &&
            this.currentChat === partnerId &&
            window.app.currentUser?.uid === userId &&
            activeChat.isConnected &&
            document.getElementById('activeChat') === activeChat;

        noSelection.style.display = 'none';
        activeChat.style.display = 'block';
        this.setMobileChatView(true);
        messagesContainer.innerHTML = '<div class="text-center text-muted py-5">Загружаем сообщения…</div>';
        document.getElementById('chatPartnerName').textContent = 'Загрузка…';
        document.getElementById('chatPartnerAvatar').textContent = '';

        try {
            const partnerData = await window.app.realtimeService.getUserProfile(partnerId);
            if (!stillActive()) return;
            const name = String(partnerData?.username || 'Пользователь');
            document.getElementById('chatPartnerName').textContent = '@' + name;
            const avatar = document.createElement('div');
            avatar.className = 'chat-avatar-placeholder';
            avatar.textContent = (name[0] || 'U').toUpperCase();
            document.getElementById('chatPartnerAvatar').replaceChildren(avatar);

            await this.chatService.markAsRead(userId, partnerId);
            if (!stillActive()) return;

            const chatId = this.chatService.getChatId(userId, partnerId);
            let lastReadIncomingId = null;
            const unsubscribe = window.app.realtimeService.subscribeToMessages(chatId, (messages, error) => {
                if (!stillActive()) return;
                if (error) {
                    messagesContainer.innerHTML = '<p class="text-center text-danger py-5">Не удалось загрузить сообщения. Открой диалог ещё раз.</p>';
                    return;
                }
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
                    const newest = messages[messages.length - 1];
                    if (newest?.senderId === partnerId && newest.id !== lastReadIncomingId) {
                        lastReadIncomingId = newest.id;
                        // A message received while this dialog is open is already visible.
                        void this.chatService.markAsRead(userId, partnerId);
                    }
                }
            });
            if (stillActive()) this.unsubscribeMessages = unsubscribe;
            else if (typeof unsubscribe === 'function') unsubscribe();
        } catch (error) {
            console.error('Ошибка открытия переписки:', error);
            if (!stillActive()) return;
            messagesContainer.innerHTML = '<p class="text-center text-danger py-5">Не удалось загрузить переписку. Выбери её ещё раз.</p>';
        }
    }

    createMessageBubble(message, userId) {
        const isMine = message.senderId === userId;
        const time = this.formatTime(message.createdAt);

        return `
            <div class="message-wrapper ${isMine ? 'message-mine' : 'message-theirs'}">
                <div class="message-bubble">
                    <div class="message-text">${escapeHTML(message.text)}</div>
                    <div class="message-meta">
                        <small class="message-time">${time}</small>
                        ${message.edited ? '<small class="text-muted ms-1">изм.</small>' : ''}
                    </div>
                    ${isMine ? `
                        <div class="message-actions">
                            <button class="btn btn-sm btn-link p-0 edit-msg-btn" data-msg-id="${escapeHTML(message.id)}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-link p-0 text-danger delete-msg-btn" data-msg-id="${escapeHTML(message.id)}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text || !this.currentChat) return;
        if (text.length > 2000) {
            window.app.ui.showToast('Сообщение слишком длинное (максимум 2000 символов)', 'warning');
            return;
        }

        const sendButton = document.getElementById('sendMessageBtn');
        if (sendButton?.disabled) return;
        if (sendButton) sendButton.disabled = true;
        const userId = window.app.currentUser.uid;
        const partnerId = this.currentChat;
        const generation = this.chatGeneration;
        const editId = this.editMessageId;
        const chatId = this.chatService.getChatId(userId, partnerId);
        const sameConversation = () => this.chatGeneration === generation &&
            this.currentChat === partnerId && window.app.currentUser?.uid === userId &&
            input.isConnected && document.getElementById('messageInput') === input;

        try {
            const result = editId
                ? await this.chatService.editMessage(chatId, editId, text)
                : await this.chatService.sendMessage(chatId, userId, partnerId, text);

            if (!result?.success) {
                if (sameConversation()) window.app.ui.showToast('Не удалось отправить сообщение. Попробуй ещё раз.', 'error');
                return; // Текст остаётся в поле при ошибке сети.
            }

            if (!editId) window.app.onUserAction('send_message');
            if (!sameConversation()) return;
            if (editId) {
                this.editMessageId = null;
                document.getElementById('editMode').style.display = 'none';
            }

            // Do not erase a newer draft typed while the request was in flight.
            if (input.value.trim() === text) input.value = '';
            input.focus();
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            if (sameConversation()) window.app.ui.showToast('Сообщение не отправлено. Текст сохранён.', 'error');
        } finally {
            if (sendButton) sendButton.disabled = false;
        }
    }

    closeChat() {
        this.setMobileChatView(false);
        this.chatGeneration++;
        this.currentChat = null;
        this.editMessageId = null;

        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }

        document.getElementById('noChatSelected').style.display = '';
        document.getElementById('activeChat').style.display = 'none';

        document.querySelectorAll('.chat-list-item').forEach(i => i.classList.remove('active'));
    }

    async deleteChatLocal() {
        if (!this.currentChat) return;
        const result = await this.chatService.deleteChatLocal(window.app.currentUser.uid, this.currentChat);
        if (!result.success) {
            window.app.ui.showToast('Не удалось удалить диалог', 'error');
            return;
        }
        this.closeChat();
        window.app.ui.showToast('Диалог удалён у тебя', 'info');
    }

    async deleteChatFull() {
        if (!this.currentChat || !confirm('Удалить весь диалог у обоих участников? Это действие может быть необратимым.')) return;
        const result = await this.chatService.deleteChat(window.app.currentUser.uid, this.currentChat);
        if (!result.success) {
            window.app.ui.showToast('Не удалось удалить диалог у всех', 'error');
            return;
        }
        this.closeChat();
        window.app.ui.showToast('Диалог удалён полностью', 'info');
    }

    showDeleteChatDialog() {
        if (!this.currentChat) return;
        const selectedChat = this.currentChat;
        document.getElementById('deleteChatConfirmModal')?.remove();

        const wrapper = document.createElement('div');
        wrapper.id = 'deleteChatConfirmModal';
        wrapper.className = 'modal fade';
        wrapper.tabIndex = -1;
        wrapper.setAttribute('aria-labelledby', 'deleteChatConfirmTitle');
        wrapper.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="deleteChatConfirmTitle">Удалить диалог?</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                    </div>
                    <div class="modal-body">
                        <p>Выбери, что именно удалить. Это разные действия.</p>
                        <p class="small text-muted mb-0">Удаление у всех затрагивает переписку другого участника и может быть необратимым.</p>
                    </div>
                    <div class="modal-footer justify-content-between">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Отмена</button>
                        <button type="button" class="btn btn-outline-primary" data-action="local">Только у меня</button>
                        <button type="button" class="btn btn-outline-danger" data-action="everyone">У всех</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrapper);
        const modal = new bootstrap.Modal(wrapper);
        wrapper.addEventListener('hidden.bs.modal', () => wrapper.remove());
        wrapper.querySelector('[data-action="local"]').addEventListener('click', async () => {
            if (this.currentChat !== selectedChat) return;
            modal.hide();
            await this.deleteChatLocal();
        });
        wrapper.querySelector('[data-action="everyone"]').addEventListener('click', async () => {
            if (this.currentChat !== selectedChat) return;
            modal.hide();
            await this.deleteChatFull();
        });
        modal.show();
    }

    attachEventListeners() {
        document.getElementById('chatSearchInput')?.addEventListener('input', () => this.filterChatList());
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

        document.getElementById('deleteChatBtn')?.addEventListener('click', () => this.showDeleteChatDialog());

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

        const userId = window.app.currentUser?.uid;
        if (!userId) return;
        let friends;
        try {
            friends = await this.friendsService.getFriends(userId);
        } catch (error) {
            console.error('Не удалось загрузить друзей для чата:', error);
            window.app.ui.showToast('Не удалось загрузить список друзей', 'error');
            return;
        }
        if (window.app.currentUser?.uid !== userId || !document.querySelector('.chat-page')) return;

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
                                         data-uid="${escapeHTML(f.uid)}"
                                         style="cursor: pointer; border-radius: 8px;">
                                        <div class="chat-avatar-placeholder" style="width: 36px; height: 36px; font-size: 14px;">
                                            ${escapeHTML(String(f.username || 'U').charAt(0).toUpperCase())}
                                        </div>
                                        <span class="fw-semibold">@${escapeHTML(f.username || 'Пользователь')}</span>
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
                if (item.dataset.busy === 'true') return;
                item.dataset.busy = 'true';
                item.classList.add('opacity-50');
                const partnerId = item.dataset.uid;
                try {
                    const chatId = await this.chatService.getOrCreateChat(userId, partnerId);
                    if (!chatId) throw new Error('Не удалось создать диалог');
                    if (window.app.currentUser?.uid !== userId || !container.isConnected ||
                        !document.querySelector('.chat-page')) return;
                    modal.hide();
                    await this.openChat(partnerId);
                } catch (error) {
                    console.error('Не удалось начать переписку:', error);
                    if (container.isConnected) window.app.ui.showToast('Не удалось открыть чат. Попробуй ещё раз.', 'error');
                } finally {
                    item.dataset.busy = 'false';
                    item.classList.remove('opacity-50');
                }
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