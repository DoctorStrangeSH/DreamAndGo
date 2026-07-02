import { db } from '../../config/firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ProfileModule {
    constructor() {
        this.currentTab = 'overview';
    }

    async render(params = {}) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const currentUserId = window.app.currentUser?.uid;
        const userId = (params.id && params.id.length > 20) ? params.id : currentUserId;
        const isOwnProfile = userId === currentUserId;

        mainContent.innerHTML = window.app.ui.createLoader();

        const userData = await this.loadUserProfile(userId);

        if (!userData) {
            mainContent.innerHTML = `
                <div class="container py-5 text-center">
                    <i class="bi bi-person-x display-1 text-muted"></i>
                    <h3 class="mt-3">Профиль не найден</h3>
                    <p class="text-muted">Пользователь не существует или был удалён</p>
                </div>
            `;
            return;
        }

        mainContent.innerHTML = this.getProfileTemplate(userData, isOwnProfile);
        this.initTabs(userId);
        await this.loadTabContent(this.currentTab, userData);
        
        if (!isOwnProfile) {
            this.checkFriendshipStatus(userId);
        }
    }

    getProfileTemplate(userData, isOwnProfile) {
        const coverGradient = this.getRandomGradient();
        const stats = userData.stats || {};
        const initials = (userData.username || 'U')[0].toUpperCase();

        return `
            <div class="profile-page fade-in-up">
                <div class="profile-cover" style="background: ${coverGradient};">
                    <div class="profile-cover-overlay"></div>
                </div>

                <div class="container">
                    <div class="profile-header">
                        <div class="profile-avatar-wrapper">
                            <div class="profile-avatar">
                                ${userData.avatar 
                                    ? `<img src="${userData.avatar}" alt="${userData.username}">`
                                    : `<span class="profile-avatar-text">${initials}</span>`
                                }
                            </div>
                        </div>

                        <div class="profile-info">
                            <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                                <h2 class="profile-username">@${userData.username || 'user'}</h2>
                                ${userData.displayName ? 
                                    `<span class="profile-display-name">${userData.displayName}</span>` : ''}
                            </div>
                            
                            ${userData.bio ? 
                                `<p class="profile-bio text-secondary mb-2">${userData.bio}</p>` : ''}
                            
                            ${userData.location ? 
                                `<p class="text-muted small mb-2"><i class="bi bi-geo-alt me-1"></i>${userData.location}</p>` : ''}

                            <div class="profile-stats mt-2">
                                <div class="profile-stat">
                                    <strong>${stats.travels || 0}</strong>
                                    <span>путешествий</span>
                                </div>
                                <div class="profile-stat">
                                    <strong>${stats.restaurants || 0}</strong>
                                    <span>ресторанов</span>
                                </div>
                                <div class="profile-stat">
                                    <strong>${stats.movies || 0}</strong>
                                    <span>фильмов</span>
                                </div>
                                <div class="profile-stat">
                                    <strong>${stats.books || 0}</strong>
                                    <span>книг</span>
                                </div>
                                <div class="profile-stat">
                                    <strong>${stats.dreams || 0}</strong>
                                    <span>мечт</span>
                                </div>
                                <div class="profile-stat">
                                    <strong>${stats.friends || 0}</strong>
                                    <span>друзей</span>
                                </div>
                            </div>

                            ${!isOwnProfile ? `
                                <div class="mt-3" id="friendActionContainer">
                                    <span class="spinner-border spinner-border-sm text-muted"></span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <ul class="nav nav-tabs profile-tabs mt-4" id="profileTabs">
                        <li class="nav-item">
                            <button class="nav-link ${this.currentTab === 'overview' ? 'active' : ''}" data-tab="overview">
                                <i class="bi bi-grid me-1"></i>Обзор
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" data-tab="travels">
                                <i class="bi bi-airplane me-1"></i>Путешествия
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" data-tab="movies">
                                <i class="bi bi-film me-1"></i>Кино
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" data-tab="books">
                                <i class="bi bi-book me-1"></i>Книги
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" data-tab="dreams">
                                <i class="bi bi-star me-1"></i>Мечты
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" data-tab="restaurants">
                                <i class="bi bi-shop me-1"></i>Рестораны
                            </button>
                        </li>
                        ${isOwnProfile ? `
                            <li class="nav-item ms-auto">
                                <button class="nav-link" data-tab="achievements">
                                    <i class="bi bi-trophy me-1"></i>Ачивки
                                </button>
                            </li>
                        ` : ''}
                    </ul>

                    <div class="profile-tab-content mt-4" id="profileTabContent">
                        ${window.app.ui.createLoader()}
                    </div>
                </div>
            </div>
        `;
    }

    getRandomGradient() {
        const gradients = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
        ];
        return gradients[Math.floor(Math.random() * gradients.length)];
    }

    initTabs(userId) {
        const tabsContainer = document.getElementById('profileTabs');
        if (!tabsContainer) return;

        const newContainer = tabsContainer.cloneNode(true);
        tabsContainer.parentNode.replaceChild(newContainer, tabsContainer);

        newContainer.addEventListener('click', async (e) => {
            const tab = e.target.closest('[data-tab]');
            if (!tab) return;
            e.preventDefault();
            e.stopPropagation();

            newContainer.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            this.currentTab = tab.dataset.tab;

            const userData = await this.loadUserProfile(userId);
            if (userData) {
                await this.loadTabContent(this.currentTab, userData);
            }
        });
    }

    async loadTabContent(tab, userData) {
        const container = document.getElementById('profileTabContent');
        if (!container) return;

        switch (tab) {
            case 'overview':
                container.innerHTML = this.getOverviewContent(userData);
                break;
            case 'achievements':
                container.innerHTML = this.getUserAchievements(userData);
                break;
            default:
                container.innerHTML = this.getPlaceholder(tab);
                break;
        }
    }

    getOverviewContent(userData) {
        const stats = userData.stats || {};
        return `
            <div class="row g-4">
                <div class="col-md-6">
                    <div class="card-premium p-4 h-100">
                        <h6 class="fw-bold mb-3"><i class="bi bi-graph-up text-primary me-2"></i>Активность</h6>
                        <div class="d-flex flex-column gap-3">
                            <div>
                                <div class="d-flex justify-content-between small mb-1">
                                    <span>Путешествия</span><span class="fw-semibold">${stats.travels || 0}</span>
                                </div>
                                <div class="progress" style="height: 6px;"><div class="progress-bar bg-primary" style="width: ${Math.min((stats.travels || 0) * 10, 100)}%"></div></div>
                            </div>
                            <div>
                                <div class="d-flex justify-content-between small mb-1">
                                    <span>Фильмы</span><span class="fw-semibold">${stats.movies || 0}</span>
                                </div>
                                <div class="progress" style="height: 6px;"><div class="progress-bar bg-warning" style="width: ${Math.min((stats.movies || 0) * 5, 100)}%"></div></div>
                            </div>
                            <div>
                                <div class="d-flex justify-content-between small mb-1">
                                    <span>Книги</span><span class="fw-semibold">${stats.books || 0}</span>
                                </div>
                                <div class="progress" style="height: 6px;"><div class="progress-bar bg-danger" style="width: ${Math.min((stats.books || 0) * 10, 100)}%"></div></div>
                            </div>
                            <div>
                                <div class="d-flex justify-content-between small mb-1">
                                    <span>Мечты</span><span class="fw-semibold">${stats.dreams || 0}</span>
                                </div>
                                <div class="progress" style="height: 6px;"><div class="progress-bar bg-info" style="width: ${Math.min((stats.dreams || 0) * 20, 100)}%"></div></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card-premium p-4 h-100">
                        <h6 class="fw-bold mb-3"><i class="bi bi-info-circle text-info me-2"></i>Информация</h6>
                        <p class="text-muted small mb-2"><i class="bi bi-envelope me-2"></i>${window.app.currentUser?.email || '—'}</p>
                        <p class="text-muted small mb-2"><i class="bi bi-geo-alt me-2"></i>${userData.location || 'Не указан'}</p>
                        <p class="text-muted small mb-2"><i class="bi bi-calendar me-2"></i>На сайте с ${this.formatDate(userData.createdAt)}</p>
                        <p class="text-muted small mb-0"><i class="bi bi-clock me-2"></i>Был ${this.formatDate(userData.lastLogin)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    getUserAchievements(userData) {
        const achievements = userData.achievements || [];
        if (achievements.length === 0) {
            return `
                <div class="text-center py-5">
                    <i class="bi bi-trophy display-1 text-muted opacity-25"></i>
                    <h5 class="mt-3 text-muted">Нет достижений</h5>
                    <p class="text-muted small">Пользуйся сайтом чтобы получать ачивки</p>
                </div>
            `;
        }
        return `
            <div class="row g-3">
                ${achievements.map(a => `
                    <div class="col-12 col-md-6">
                        <div class="card-premium p-3 achievement-earned">
                            <div class="d-flex align-items-center gap-3">
                                <div class="achievement-icon earned">
                                    <span>${a.emoji}</span>
                                </div>
                                <div>
                                    <h6 class="fw-bold mb-0">${a.title}</h6>
                                    <p class="text-muted small mb-0">${a.description}</p>
                                    <small class="text-muted">${this.formatDate(a.awardedAt)}</small>
                                </div>
                                <span class="badge bg-warning ms-auto">Ур. ${a.level || 1}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getPlaceholder(tab) {
        const names = { travels: 'путешествий', movies: 'фильмов', books: 'книг', dreams: 'мечт', restaurants: 'ресторанов' };
        const icons = { travels: 'airplane', movies: 'film', books: 'book', dreams: 'star', restaurants: 'shop' };
        return window.app.ui.createEmptyState({
            icon: `bi-${icons[tab] || 'question'}`,
            title: `Нет ${names[tab] || 'данных'}`,
            description: 'Здесь пока ничего нет'
        });
    }

    async checkFriendshipStatus(profileUserId) {
        const container = document.getElementById('friendActionContainer');
        if (!container) return;

        const currentUserId = window.app.currentUser.uid;

        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const { FriendsService } = await import('../../services/friends.service.js');
            const fs = new FriendsService();

            const friendDoc = await getDoc(doc(window.app.db, 'users', currentUserId, 'friends', profileUserId));
            const sentDoc = await getDoc(doc(window.app.db, 'users', currentUserId, 'sentRequests', profileUserId));
            const requestDoc = await getDoc(doc(window.app.db, 'users', currentUserId, 'friendRequests', profileUserId));

            if (friendDoc.exists()) {
                container.innerHTML = `
                    <span class="badge bg-success me-2"><i class="bi bi-check me-1"></i>В друзьях</span>
                    <button class="btn btn-outline-danger btn-sm me-1" id="removeFriendBtn"><i class="bi bi-person-x me-1"></i>Удалить</button>
                    <button class="btn btn-premium btn-sm" id="messageFriendBtn"><i class="bi bi-chat me-1"></i>Написать</button>
                `;
                document.getElementById('removeFriendBtn')?.addEventListener('click', async () => {
                    if (confirm('Удалить из друзей?')) {
                        await fs.removeFriend(currentUserId, profileUserId);
                        window.app.ui.showToast('Удалён из друзей', 'info');
                        this.checkFriendshipStatus(profileUserId);
                    }
                });
                document.getElementById('messageFriendBtn')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.app.router.navigate('chat');
                    setTimeout(async () => {
                        const cm = window.app.router.routes['chat']?.component;
                        if (cm) { await cm.chatService.getOrCreateChat(currentUserId, profileUserId); cm.openChat(profileUserId); }
                    }, 500);
                });
            } else if (sentDoc.exists()) {
                container.innerHTML = `
                    <button class="btn btn-outline-secondary btn-sm me-2" disabled><i class="bi bi-clock me-1"></i>Заявка отправлена</button>
                    <button class="btn btn-outline-danger btn-sm" id="cancelRequestBtn"><i class="bi bi-x me-1"></i>Отменить</button>
                `;
                document.getElementById('cancelRequestBtn')?.addEventListener('click', async () => {
                    await fs.rejectFriendRequest(profileUserId, currentUserId);
                    window.app.ui.showToast('Заявка отменена', 'info');
                    this.checkFriendshipStatus(profileUserId);
                });
            } else if (requestDoc.exists()) {
                container.innerHTML = `
                    <button class="btn btn-success btn-sm me-2" id="acceptRequestBtn"><i class="bi bi-check me-1"></i>Принять</button>
                    <button class="btn btn-outline-danger btn-sm" id="declineRequestBtn"><i class="bi bi-x me-1"></i>Отклонить</button>
                `;
                document.getElementById('acceptRequestBtn')?.addEventListener('click', async () => {
                    await fs.acceptFriendRequest(currentUserId, profileUserId);
                    window.app.ui.showToast('Друг добавлен! 🤝', 'success');
                    this.checkFriendshipStatus(profileUserId);
                });
                document.getElementById('declineRequestBtn')?.addEventListener('click', async () => {
                    await fs.rejectFriendRequest(currentUserId, profileUserId);
                    window.app.ui.showToast('Заявка отклонена', 'info');
                    this.checkFriendshipStatus(profileUserId);
                });
            } else {
                container.innerHTML = `
                    <button class="btn btn-premium btn-sm" id="addFriendBtn"><i class="bi bi-person-plus me-1"></i>Добавить в друзья</button>
                `;
                document.getElementById('addFriendBtn')?.addEventListener('click', async () => {
                    await fs.sendFriendRequest(currentUserId, profileUserId);
                    window.app.ui.showToast('Заявка отправлена! 🎉', 'success');
                    this.checkFriendshipStatus(profileUserId);
                });
            }
        } catch (error) {
            container.innerHTML = `<button class="btn btn-premium btn-sm" id="addFriendBtn"><i class="bi bi-person-plus me-1"></i>Добавить в друзья</button>`;
        }
    }

    async loadUserProfile(userId) {
        try {
            if (!userId) return null;
            const userDoc = await getDoc(doc(db, 'users', userId));
            return userDoc.exists() ? userDoc.data() : null;
        } catch (error) {
            return null;
        }
    }

    formatDate(date) {
        if (!date) return '—';
        const d = date?.toDate ? date.toDate() : new Date(date);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }
}