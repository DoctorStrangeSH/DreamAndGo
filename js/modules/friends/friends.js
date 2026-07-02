import { FriendsService } from '../../services/friends.service.js';

export class FriendsModule {
    constructor() {
        this.friendsService = new FriendsService();
        this.currentTab = 'friends'; // friends | requests | sent | search
    }

    async render(params = {}) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = window.app.ui.createLoader();
        mainContent.innerHTML = this.getTemplate();
        this.attachEventListeners();
        await this.loadTabContent();
    }

    getTemplate() {
        return `
            <div class="friends-page fade-in-up">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h2 class="fw-bold mb-1">
                            <i class="bi bi-people text-success me-2"></i>Друзья
                        </h2>
                        <p class="text-muted mb-0">Находи друзей и делись мечтами</p>
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

                <div id="friendsContent">
                    <div id="friendsList" class="row g-3"></div>
                </div>
            </div>
        `;
    }

    async loadTabContent() {
        const list = document.getElementById('friendsList');
        if (!list) return;

        list.innerHTML = window.app.ui.createLoader();
        const userId = window.app.currentUser.uid;

        if (this.currentTab === 'friends') {
            const friends = await this.friendsService.getFriends(userId);
            if (friends.length === 0) {
                list.innerHTML = `
                    <div class="col-12">
                        ${window.app.ui.createEmptyState({
                    icon: 'bi-people',
                    title: 'Нет друзей',
                    description: 'Найди друзей по никнейму и делитесь достижениями!',
                    action: '<button class="btn btn-premium" id="goToSearch"><i class="bi bi-search me-2"></i>Найти друзей</button>'
                })}
                    </div>
                `;
                document.getElementById('goToSearch')?.addEventListener('click', () => this.switchTab('search'));
            } else {
                list.innerHTML = friends.map(f => this.createFriendCard(f, 'friend')).join('');
            }
        } else if (this.currentTab === 'requests') {
            const requests = await this.friendsService.getFriendRequests(userId);
            if (requests.length === 0) {
                list.innerHTML = `
                    <div class="col-12">
                        ${window.app.ui.createEmptyState({
                    icon: 'bi-person-plus',
                    title: 'Нет заявок',
                    description: 'Когда кто-то добавит тебя в друзья, заявка появится здесь'
                })}
                    </div>
                `;
            } else {
                list.innerHTML = requests.map(f => this.createFriendCard(f, 'request')).join('');
            }
        } else if (this.currentTab === 'sent') {
            const sent = await this.friendsService.getSentRequests(userId);
            if (sent.length === 0) {
                list.innerHTML = `
                    <div class="col-12">
                        ${window.app.ui.createEmptyState({
                    icon: 'bi-send',
                    title: 'Нет отправленных заявок',
                    description: 'Отправленные заявки в друзья появятся здесь'
                })}
                    </div>
                `;
            } else {
                list.innerHTML = sent.map(f => this.createFriendCard(f, 'sent')).join('');
            }
        }

        this.attachCardListeners();
    }

    createFriendCard(user, type) {
        const initials = (user.username || 'U')[0].toUpperCase();
        const stats = user.stats || {};

        let actionButtons = '';
        if (type === 'friend') {
            actionButtons = `
                <a href="#profile/${user.uid}" class="btn btn-outline-primary btn-sm">
                    <i class="bi bi-person me-1"></i>Профиль
                </a>
                <button class="btn btn-outline-danger btn-sm remove-friend-btn" data-uid="${user.uid}">
                    <i class="bi bi-person-x me-1"></i>Удалить
                </button>
            `;
        } else if (type === 'request') {
            actionButtons = `
                <button class="btn btn-success btn-sm accept-btn" data-uid="${user.uid}">
                    <i class="bi bi-check me-1"></i>Принять
                </button>
                <button class="btn btn-outline-danger btn-sm reject-btn" data-uid="${user.uid}">
                    <i class="bi bi-x me-1"></i>Отклонить
                </button>
            `;
        } else if (type === 'sent') {
            actionButtons = `
                <button class="btn btn-outline-secondary btn-sm cancel-btn" data-uid="${user.uid}" disabled>
                    <i class="bi bi-clock me-1"></i>Ожидает
                </button>
            `;
        }

        return `
            <div class="col-12 col-md-6">
                <div class="card-premium p-3">
                    <div class="d-flex align-items-center gap-3">
                        <div class="friend-avatar">
                            ${user.avatar ? `<img src="${user.avatar}" alt="${user.username}" class="rounded-circle" width="50" height="50">`
                : `<div class="friend-avatar-placeholder">${initials}</div>`}
                        </div>
                        <div class="flex-grow-1">
                            <h6 class="fw-bold mb-0">@${user.username}</h6>
                            ${user.displayName ? `<small class="text-muted">${user.displayName}</small>` : ''}
                            <div class="d-flex gap-2 mt-1">
                                <small class="text-muted"><i class="bi bi-airplane me-1"></i>${stats.travels || 0}</small>
                                <small class="text-muted"><i class="bi bi-film me-1"></i>${stats.movies || 0}</small>
                                <small class="text-muted"><i class="bi bi-book me-1"></i>${stats.books || 0}</small>
                                <small class="text-muted"><i class="bi bi-people me-1"></i>${stats.friends || 0}</small>
                            </div>
                        </div>
                        <div class="d-flex gap-1">
                            ${actionButtons}
                        </div>
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

        const searchUserBtn = document.getElementById('searchUserBtn');
        const searchUsername = document.getElementById('searchUsername');

        if (searchUserBtn) {
            searchUserBtn.addEventListener('click', () => this.searchUser());
        }

        if (searchUsername) {
            searchUsername.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchUser();
            });
        }
    }

    switchTab(tab) {
        this.currentTab = tab;
        const searchSection = document.getElementById('searchSection');
        const searchResults = document.getElementById('searchResults');
        const friendsList = document.getElementById('friendsList');

        if (tab === 'search') {
            if (searchSection) searchSection.style.display = 'block';
            if (friendsList) friendsList.innerHTML = '';
            if (searchResults) searchResults.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="bi bi-search fs-3"></i>
                <p class="mt-2">Введи никнейм чтобы найти друга</p>
            </div>
        `;
        } else {
            if (searchSection) searchSection.style.display = 'none';
            if (searchResults) searchResults.innerHTML = '';
            this.loadTabContent();
        }
    }


    async searchUser() {
        const input = document.getElementById('searchUsername');
        const results = document.getElementById('searchResults');
        if (!input || !results) return;

        const username = input.value.trim().replace('@', '');
        if (!username) return;

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

        results.innerHTML = this.createFriendCard(user, 'search');
        results.querySelector('.friend-avatar + div + div')?.remove();

        const actionDiv = results.querySelector('.d-flex.gap-1');
        if (actionDiv) {
            actionDiv.innerHTML = `
                <button class="btn btn-premium btn-sm send-request-btn" data-uid="${user.uid}">
                    <i class="bi bi-person-plus me-1"></i>Добавить
                </button>
            `;
        }

        document.querySelector('.send-request-btn')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Отправка...';

            const result = await this.friendsService.sendFriendRequest(window.app.currentUser.uid, user.uid);
            if (result.success) {
                window.app.ui.showToast('Заявка отправлена! 🎉', 'success');
                btn.innerHTML = '<i class="bi bi-check me-1"></i>Отправлено';
                btn.classList.remove('btn-premium');
                btn.classList.add('btn-success');
            } else {
                window.app.ui.showToast('Ошибка: ' + result.error, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-person-plus me-1"></i>Добавить';
            }
        });

        this.attachCardListeners();
    }

    attachCardListeners() {
        document.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uid = btn.dataset.uid;
                const result = await this.friendsService.acceptFriendRequest(window.app.currentUser.uid, uid);
                if (result.success) {
                    window.app.ui.showToast('Друг добавлен! 🤝', 'success');
                    await this.loadTabContent();
                    window.app.refreshUserData();
                }
            });
        });

        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uid = btn.dataset.uid;
                const result = await this.friendsService.rejectFriendRequest(window.app.currentUser.uid, uid);
                if (result.success) {
                    window.app.ui.showToast('Заявка отклонена', 'info');
                    await this.loadTabContent();
                }
            });
        });

        document.querySelectorAll('.remove-friend-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('Удалить из друзей?')) {
                    const uid = btn.dataset.uid;
                    const result = await this.friendsService.removeFriend(window.app.currentUser.uid, uid);
                    if (result.success) {
                        window.app.ui.showToast('Друг удалён', 'info');
                        await this.loadTabContent();
                        window.app.refreshUserData();
                    }
                }
            });
        });
    }
}