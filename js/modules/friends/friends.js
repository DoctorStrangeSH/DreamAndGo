import { FriendsService } from '../../services/friends.service.js';
import { escapeHTML } from '../../core/escape-html.js';
import { getHomeSnapshot } from '../../core/home-snapshot.js';

export class FriendsModule {
    constructor() {
        this.friendsService = new FriendsService();
        this.currentTab = 'friends';
        this.unsubscribeFriends = null;
        this.unsubscribeRequests = null;
        this.unsubscribeSent = null;
        this.searchVersion = 0;
        this.ownerUid = null;
        this.subscriptionVersions = { friends: 0, requests: 0, sent: 0 };
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;
        this.stopSubscriptions();
        this.searchVersion++;
        this.ownerUid = userId;
        this.currentTab = 'friends';

        mainContent.innerHTML = this.getTemplate();
        this.attachEventListeners();

        this.subscribeToFriends();
    }

    getTemplate() {
        return `
            <div class="fade-in-up">
                <div class="page-header mb-4">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="fw-bold mb-0">
                                <i class="bi bi-people text-success me-2"></i>Друзья
                            </h2>
                            <p class="text-muted mb-0">Находи друзей и делись мечтами</p>
                        </div>
                    </div>
                </div>

                <ul class="nav nav-tabs friends-tabs mb-4">
                    <li class="nav-item">
                        <button class="nav-link active" data-tab="friends">
                            <i class="bi bi-people me-1"></i>Друзья
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="requests">
                            <i class="bi bi-person-plus me-1"></i>Заявки
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="sent">
                            <i class="bi bi-send me-1"></i>Отправленные
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="search">
                            <i class="bi bi-search me-1"></i>Поиск
                        </button>
                    </li>
                </ul>

                <div id="searchSection" class="mb-4" style="display: none;">
                    <div class="input-group">
                        <span class="input-group-text">@</span>
                        <input type="text" class="form-control" id="searchUsername" placeholder="Никнейм друга...">
                        <button class="btn btn-premium" id="searchUserBtn">
                            <i class="bi bi-search me-1"></i>Найти
                        </button>
                    </div>
                    <div id="searchResults" class="mt-3"></div>
                </div>

                <div id="friendsList" class="row g-3"></div>
            </div>
        `;
    }

    subscribeToFriends() {
        const list = document.getElementById('friendsList');
        const uid = this.ownerUid;
        if (!list || !uid || window.app.currentUser?.uid !== uid) return;
        this.unsubscribeFriends?.();
        const version = ++this.subscriptionVersions.friends;

        list.innerHTML = window.app.ui.createLoader();

        this.unsubscribeFriends = window.app.realtimeService.subscribeToFriends(
            uid,
            (friends) => {
                if (version !== this.subscriptionVersions.friends || this.currentTab !== 'friends' ||
                    window.app.currentUser?.uid !== uid || !list.isConnected) return;

                if (friends.length === 0) {
                    list.innerHTML = `
                        <div class="col-12 text-center py-5">
                            <i class="bi bi-people display-1 text-muted opacity-25"></i>
                            <h5 class="mt-3 text-muted">Нет друзей</h5>
                            <p class="text-muted small">Найди друга по никнейму</p>
                        </div>
                    `;
                } else {
                    list.innerHTML = friends.map(f => this.createCard(f, 'friend')).join('');
                    this.attachCardListeners();
                }
            }
        );
    }

    subscribeToRequests() {
        const uid = this.ownerUid;
        if (!uid || window.app.currentUser?.uid !== uid) return;
        this.unsubscribeRequests?.();
        const version = ++this.subscriptionVersions.requests;
        this.unsubscribeRequests = window.app.realtimeService.subscribeToFriendRequests(
            uid,
            (requests) => {
                if (version !== this.subscriptionVersions.requests || this.currentTab !== 'requests' ||
                    window.app.currentUser?.uid !== uid) return;

                const list = document.getElementById('friendsList');
                if (!list?.isConnected) return;

                if (requests.length === 0) {
                    list.innerHTML = `
                        <div class="col-12 text-center py-5">
                            <i class="bi bi-person-plus display-1 text-muted opacity-25"></i>
                            <h5 class="mt-3 text-muted">Нет заявок</h5>
                            <p class="text-muted small">Когда кто-то добавит тебя, заявка появится здесь</p>
                        </div>
                    `;
                } else {
                    list.innerHTML = requests.map(f => this.createCard(f, 'request')).join('');
                    this.attachCardListeners();
                }
            }
        );
    }

    subscribeToSent() {
        const uid = this.ownerUid;
        if (!uid || window.app.currentUser?.uid !== uid) return;
        this.unsubscribeSent?.();
        const version = ++this.subscriptionVersions.sent;
        this.unsubscribeSent = window.app.realtimeService.subscribeToSentRequests(
            uid,
            (sent) => {
                if (version !== this.subscriptionVersions.sent || this.currentTab !== 'sent' ||
                    window.app.currentUser?.uid !== uid) return;

                const list = document.getElementById('friendsList');
                if (!list?.isConnected) return;

                if (sent.length === 0) {
                    list.innerHTML = `
                        <div class="col-12 text-center py-5">
                            <i class="bi bi-send display-1 text-muted opacity-25"></i>
                            <h5 class="mt-3 text-muted">Нет отправленных заявок</h5>
                            <p class="text-muted small">Отправленные заявки появятся здесь</p>
                        </div>
                    `;
                } else {
                    list.innerHTML = sent.map(f => this.createCard(f, 'sent')).join('');
                    this.attachCardListeners();
                }
            }
        );
    }

    createCard(user, type) {
        const initials = String(user.username || 'U').charAt(0).toUpperCase();
        const stats = getHomeSnapshot(user);

        let actions = '';

        if (type === 'friend') {
            actions = `
                <a href="#profile/${escapeHTML(user.uid)}" class="btn btn-outline-primary btn-sm" title="Профиль" aria-label="Открыть профиль друга">
                    <i class="bi bi-person"></i>
                </a>
                <button class="btn btn-outline-danger btn-sm remove-friend-btn" data-uid="${escapeHTML(user.uid)}" title="Удалить" aria-label="Удалить из друзей">
                    <i class="bi bi-person-x"></i>
                </button>
            `;
        } else if (type === 'request') {
            actions = `
                <button class="btn btn-success btn-sm accept-btn" data-uid="${escapeHTML(user.uid)}" title="Принять" aria-label="Принять заявку в друзья">
                    <i class="bi bi-check"></i>
                </button>
                <button class="btn btn-outline-danger btn-sm reject-btn" data-uid="${escapeHTML(user.uid)}" title="Отклонить" aria-label="Отклонить заявку в друзья">
                    <i class="bi bi-x"></i>
                </button>
            `;
        } else if (type === 'sent') {
            actions = `
                <button class="btn btn-outline-danger btn-sm cancel-request-btn" data-uid="${escapeHTML(user.uid)}">
                    <i class="bi bi-x me-1"></i>Отменить
                </button>
            `;
        } else if (type === 'search') {
            actions = `
                <button class="btn btn-premium btn-sm send-request-btn" data-uid="${escapeHTML(user.uid)}">
                    <i class="bi bi-person-plus me-1"></i>Добавить
                </button>
            `;
        }

        return `
            <div class="col-12 col-md-6">
                <div class="card-premium p-3 atlas-friend-card">
                    <div class="d-flex align-items-center gap-3 atlas-friend-content">
                        <div class="friend-avatar-placeholder">${escapeHTML(initials)}</div>
                        <div class="flex-grow-1 atlas-friend-details">
                            <h6 class="fw-bold mb-0">@${escapeHTML(user.username || 'user')}</h6>
                            <div class="d-flex gap-2 mt-1">
                                <small class="text-muted">
                                    <i class="bi bi-airplane me-1"></i>${stats.travels || 0}
                                </small>
                                <small class="text-muted">
                                    <i class="bi bi-film me-1"></i>${stats.movies || 0}
                                </small>
                                <small class="text-muted">
                                    <i class="bi bi-book me-1"></i>${stats.books || 0}
                                </small>
                            </div>
                        </div>
                        <div class="d-flex gap-1 atlas-friend-actions">${actions}</div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.querySelectorAll('.friends-tabs [data-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.friends-tabs [data-tab]').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.switchTab(tab.dataset.tab);
            });
        });

        document.getElementById('searchUserBtn')?.addEventListener('click', () => this.searchUser());

        document.getElementById('searchUsername')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchUser();
        });
    }

    switchTab(tab) {
        if (window.app.currentUser?.uid !== this.ownerUid) return;
        this.stopSubscriptions();
        this.searchVersion++;
        this.currentTab = tab;

        const searchSection = document.getElementById('searchSection');
        const searchResults = document.getElementById('searchResults');
        const list = document.getElementById('friendsList');

        if (tab === 'search') {
            if (searchSection) searchSection.style.display = 'block';
            if (list) list.innerHTML = '';
        } else {
            if (searchSection) searchSection.style.display = 'none';
            if (searchResults) searchResults.innerHTML = '';

            if (list) list.innerHTML = window.app.ui.createLoader();

            if (tab === 'friends') this.subscribeToFriends();
            else if (tab === 'requests') this.subscribeToRequests();
            else if (tab === 'sent') this.subscribeToSent();
        }
    }

    async searchUser() {
        const input = document.getElementById('searchUsername');
        const results = document.getElementById('searchResults');
        const friendsList = document.getElementById('friendsList');

        if (!input || !results) return;

        const username = input.value.trim().replace('@', '');
        if (!username) return;

        if (friendsList) friendsList.innerHTML = '';
        results.innerHTML = window.app.ui.createLoader();

        const searchVersion = ++this.searchVersion;
        const userId = window.app.currentUser?.uid;
        let user;
        try {
            user = await this.friendsService.getUserByUsername(username);
        } catch (error) {
            if (searchVersion !== this.searchVersion || this.currentTab !== 'search' || window.app.currentUser?.uid !== userId || userId !== this.ownerUid || !results.isConnected) return;
            results.innerHTML = `<div class="alert alert-warning" role="alert">${escapeHTML(error.message || 'Поиск временно недоступен. Попробуй ещё раз.')}</div>`;
            return;
        }
        if (searchVersion !== this.searchVersion || this.currentTab !== 'search' || window.app.currentUser?.uid !== userId || userId !== this.ownerUid || !results.isConnected) return;

        if (!user) {
            results.innerHTML = `
                <div class="text-center py-3">
                    <i class="bi bi-emoji-frown fs-3 text-muted"></i>
                    <p class="text-muted mt-2">Пользователь @${escapeHTML(username)} не найден</p>
                    <p class="text-muted small">Для старых профилей попробуй точное написание никнейма, включая заглавные буквы.</p>
                </div>
            `;
            return;
        }

        if (user.uid === window.app.currentUser.uid) {
            results.innerHTML = `<div class="text-center py-3 text-muted">Это ты! 😄</div>`;
            return;
        }

        results.innerHTML = this.createCard(user, 'search');
        this.attachCardListeners();
    }

    attachCardListeners() {
        document.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', () => this.runFriendAction(btn,
                uid => this.friendsService.acceptFriendRequest(uid, btn.dataset.uid),
                'Друг добавлен! 🤝', 'Не удалось принять заявку', () => {
                    window.app.onUserAction('add_friend');
                    this.subscribeToFriends(); this.subscribeToRequests(); this.subscribeToSent();
                }));
        });

        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', () => this.runFriendAction(btn,
                uid => this.friendsService.rejectFriendRequest(uid, btn.dataset.uid),
                'Заявка отклонена', 'Не удалось отклонить заявку', () => {
                    this.subscribeToRequests(); this.subscribeToSent();
                }));
        });

        document.querySelectorAll('.cancel-request-btn').forEach(btn => {
            btn.addEventListener('click', () => this.runFriendAction(btn,
                uid => this.friendsService.rejectFriendRequest(btn.dataset.uid, uid),
                'Заявка отменена', 'Не удалось отменить заявку', () => this.subscribeToSent()));
        });

        document.querySelectorAll('.remove-friend-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.disabled && confirm('Удалить из друзей?')) this.runFriendAction(btn,
                    uid => this.friendsService.removeFriend(uid, btn.dataset.uid),
                    'Друг удалён', 'Не удалось удалить друга', () => this.subscribeToFriends());
            });
        });

        document.querySelectorAll('.send-request-btn').forEach(btn => {
            btn.addEventListener('click', () => this.runFriendAction(btn,
                uid => this.friendsService.sendFriendRequest(uid, btn.dataset.uid),
                'Заявка отправлена! 🎉', 'Не удалось отправить заявку', () => {
                    btn.innerHTML = '<i class="bi bi-check me-1"></i>Отправлено';
                    btn.classList.remove('btn-premium');
                    btn.classList.add('btn-success');
                    this.switchTab('sent');
                    document.querySelectorAll('.friends-tabs [data-tab]').forEach(t => t.classList.remove('active'));
                    document.querySelector('[data-tab="sent"]')?.classList.add('active');
                }, { keepDisabledOnSuccess: true }));
        });
    }

    async runFriendAction(btn, perform, successMessage, errorMessage, onSuccess, { keepDisabledOnSuccess = false } = {}) {
        const uid = window.app.currentUser?.uid;
        if (!uid || uid !== this.ownerUid || !btn.isConnected || btn.disabled) return;
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        let succeeded = false;
        const stillCurrent = () => window.app.currentUser?.uid === uid && this.ownerUid === uid && btn.isConnected;
        try {
            const result = await perform(uid);
            if (!stillCurrent()) return;
            if (!result?.success) {
                window.app.ui.showToast(result?.error || errorMessage, 'error');
                return;
            }
            succeeded = true;
            window.app.ui.showToast(successMessage, 'success');
            onSuccess?.();
        } catch (error) {
            console.error('Ошибка действия с друзьями:', error);
            if (stillCurrent()) window.app.ui.showToast(errorMessage, 'error');
        } finally {
            if (btn.isConnected) {
                btn.removeAttribute('aria-busy');
                if (!succeeded || !keepDisabledOnSuccess) btn.disabled = false;
                if (!succeeded && stillCurrent()) btn.innerHTML = originalHTML;
            }
        }
    }

    destroy() {
        this.searchVersion++;
        this.stopSubscriptions();
        this.ownerUid = null;
    }

    stopSubscriptions() {
        for (const tab of Object.keys(this.subscriptionVersions)) this.subscriptionVersions[tab]++;
        this.unsubscribeFriends?.();
        this.unsubscribeRequests?.();
        this.unsubscribeSent?.();
        this.unsubscribeFriends = null;
        this.unsubscribeRequests = null;
        this.unsubscribeSent = null;
    }
}
