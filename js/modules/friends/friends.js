import { FriendsService } from '../../services/friends.service.js';

export class FriendsModule {
    constructor() {
        this.friendsService = new FriendsService();
        this.currentTab = 'friends';
        this.unsubscribeFriends = null;
        this.unsubscribeRequests = null;
        this.unsubscribeSent = null;
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = this.getTemplate();
        this.attachEventListeners();

        this.subscribeToFriends();
        this.subscribeToRequests();
        this.subscribeToSent();
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
        if (!list) return;

        list.innerHTML = window.app.ui.createLoader();

        this.unsubscribeFriends = window.app.realtimeService.subscribeToFriends(
            window.app.currentUser.uid,
            (friends) => {
                if (this.currentTab !== 'friends') return;

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
        this.unsubscribeRequests = window.app.realtimeService.subscribeToFriendRequests(
            window.app.currentUser.uid,
            (requests) => {
                if (this.currentTab !== 'requests') return;

                const list = document.getElementById('friendsList');
                if (!list) return;

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
        this.unsubscribeSent = window.app.realtimeService.subscribeToSentRequests(
            window.app.currentUser.uid,
            (sent) => {
                if (this.currentTab !== 'sent') return;

                const list = document.getElementById('friendsList');
                if (!list) return;

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
        const initials = (user.username || 'U')[0].toUpperCase();
        const stats = user.stats || {};

        let actions = '';

        if (type === 'friend') {
            actions = `
                <a href="#profile/${user.uid}" class="btn btn-outline-primary btn-sm" title="Профиль">
                    <i class="bi bi-person"></i>
                </a>
                <button class="btn btn-outline-danger btn-sm remove-friend-btn" data-uid="${user.uid}" title="Удалить">
                    <i class="bi bi-person-x"></i>
                </button>
            `;
        } else if (type === 'request') {
            actions = `
                <button class="btn btn-success btn-sm accept-btn" data-uid="${user.uid}" title="Принять">
                    <i class="bi bi-check"></i>
                </button>
                <button class="btn btn-outline-danger btn-sm reject-btn" data-uid="${user.uid}" title="Отклонить">
                    <i class="bi bi-x"></i>
                </button>
            `;
        } else if (type === 'sent') {
            actions = `
                <button class="btn btn-outline-danger btn-sm cancel-request-btn" data-uid="${user.uid}">
                    <i class="bi bi-x me-1"></i>Отменить
                </button>
            `;
        } else if (type === 'search') {
            actions = `
                <button class="btn btn-premium btn-sm send-request-btn" data-uid="${user.uid}">
                    <i class="bi bi-person-plus me-1"></i>Добавить
                </button>
            `;
        }

        return `
            <div class="col-12 col-md-6">
                <div class="card-premium p-3">
                    <div class="d-flex align-items-center gap-3">
                        <div class="friend-avatar-placeholder">${initials}</div>
                        <div class="flex-grow-1 min-width-0">
                            <h6 class="fw-bold mb-0">@${user.username}</h6>
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
                        <div class="d-flex gap-1">${actions}</div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.querySelectorAll('.friends-tabs [data-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.friends-tabs [data-tab]').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.switchTab(e.target.dataset.tab);
            });
        });

        document.getElementById('searchUserBtn')?.addEventListener('click', () => this.searchUser());

        document.getElementById('searchUsername')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchUser();
        });
    }

    switchTab(tab) {
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

        const user = await this.friendsService.getUserByUsername(username);

        if (!user) {
            results.innerHTML = `
                <div class="text-center py-3">
                    <i class="bi bi-emoji-frown fs-3 text-muted"></i>
                    <p class="text-muted mt-2">Пользователь @${username} не найден</p>
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
            btn.addEventListener('click', async () => {
                await this.friendsService.acceptFriendRequest(window.app.currentUser.uid, btn.dataset.uid);
                window.app.onUserAction('add_friend');
                window.app.ui.showToast('Друг добавлен! 🤝', 'success');
                this.subscribeToFriends();
                this.subscribeToRequests();
                this.subscribeToSent();
            });
        });

        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.friendsService.rejectFriendRequest(window.app.currentUser.uid, btn.dataset.uid);
                window.app.ui.showToast('Заявка отклонена', 'info');
                this.subscribeToRequests();
                this.subscribeToSent();
            });
        });

        document.querySelectorAll('.cancel-request-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.friendsService.rejectFriendRequest(btn.dataset.uid, window.app.currentUser.uid);
                window.app.ui.showToast('Заявка отменена', 'info');
                this.subscribeToSent();
            });
        });

        document.querySelectorAll('.remove-friend-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Удалить из друзей?')) {
                    await this.friendsService.removeFriend(window.app.currentUser.uid, btn.dataset.uid);
                    window.app.ui.showToast('Друг удалён', 'info');
                    this.subscribeToFriends();
                }
            });
        });

        document.querySelectorAll('.send-request-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Отправка...';

                const result = await this.friendsService.sendFriendRequest(
                    window.app.currentUser.uid,
                    btn.dataset.uid
                );

                if (result.success) {
                    window.app.ui.showToast('Заявка отправлена! 🎉', 'success');
                    btn.innerHTML = '<i class="bi bi-check me-1"></i>Отправлено';
                    btn.classList.remove('btn-premium');
                    btn.classList.add('btn-success');

                    this.currentTab = 'sent';
                    document.querySelectorAll('.friends-tabs [data-tab]').forEach(t => t.classList.remove('active'));
                    document.querySelector('[data-tab="sent"]')?.classList.add('active');
                    document.getElementById('searchSection').style.display = 'none';
                    document.getElementById('searchResults').innerHTML = '';
                    this.subscribeToSent();
                } else {
                    window.app.ui.showToast('Ошибка', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-person-plus me-1"></i>Добавить';
                }
            });
        });
    }

    destroy() {
        if (this.unsubscribeFriends) this.unsubscribeFriends();
        if (this.unsubscribeRequests) this.unsubscribeRequests();
        if (this.unsubscribeSent) this.unsubscribeSent();
    }
}