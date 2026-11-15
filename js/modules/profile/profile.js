import { db } from '../../config/firebase.js';
import { escapeHTML } from '../../core/escape-html.js';
import { safeAvatarURL } from '../../core/safe-avatar-url.js';
import { getHomeSnapshot } from '../../core/home-snapshot.js';
import { toPublicProfile } from '../../core/public-profile.js';
import { getProfileGradient } from '../../core/profile-gradient.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ProfileModule {
    constructor() {
        this.currentTab = 'overview';
        this.tabRequestId = 0;
        this.profileIsOwn = false;
        this.profileUserId = null;
    }

    async render(params = {}) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const currentUserId = window.app.currentUser?.uid;
        const userId = (params.id && params.id.length > 20) ? params.id : currentUserId;
        const isOwnProfile = userId === currentUserId;
        this.profileIsOwn = isOwnProfile;
        this.profileUserId = userId;
        this.tabRequestId += 1;
        if (!isOwnProfile && this.currentTab === 'achievements') this.currentTab = 'overview';

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

        mainContent.innerHTML = this.getProfileTemplate(userData, isOwnProfile, userId);
        this.initTabs(userData);
        await this.loadTabContent(this.currentTab, userData);
        
        if (!isOwnProfile) {
            this.checkFriendshipStatus(userId);
        }
    }

    getProfileTemplate(userData, isOwnProfile, userId) {
        const coverGradient = getProfileGradient(userId);
        const stats = getHomeSnapshot(userData);
        const initials = String(userData.username || 'U').charAt(0).toUpperCase();
        const avatarURL = safeAvatarURL(userData.avatar);

        return `
            <div class="profile-page fade-in-up">
                <div class="profile-cover" style="background: ${coverGradient};">
                    <div class="profile-cover-overlay"></div>
                </div>

                <div class="container">
                    <div class="profile-header">
                        <div class="profile-avatar-wrapper">
                            <div class="profile-avatar">
                                ${avatarURL 
                                    ? `<img src="${escapeHTML(avatarURL)}" alt="Аватар ${escapeHTML(userData.username || 'пользователя')}">`
                                    : `<span class="profile-avatar-text">${escapeHTML(initials)}</span>`
                                }
                            </div>
                        </div>

                        <div class="profile-info">
                            <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                                <h2 class="profile-username">@${escapeHTML(userData.username || 'user')}</h2>
                                ${userData.displayName ? 
                                    `<span class="profile-display-name">${escapeHTML(userData.displayName)}</span>` : ''}
                            </div>
                            
                            ${userData.bio ? 
                                `<p class="profile-bio text-secondary mb-2">${escapeHTML(userData.bio)}</p>` : ''}
                            
                            ${userData.location ? 
                                `<p class="text-muted small mb-2"><i class="bi bi-geo-alt me-1"></i>${escapeHTML(userData.location)}</p>` : ''}

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

                    <ul class="nav nav-tabs profile-tabs mt-4" id="profileTabs" role="tablist" aria-label="Разделы профиля">
                        <li class="nav-item">
                            <button type="button" class="nav-link ${this.currentTab === 'overview' ? 'active' : ''}" role="tab" id="profile-tab-overview" aria-controls="profileTabContent" aria-selected="${this.currentTab === 'overview'}" tabindex="${this.currentTab === 'overview' ? '0' : '-1'}" data-tab="overview">
                                <i class="bi bi-grid me-1"></i>Обзор
                            </button>
                        </li>
                        <li class="nav-item">
                            <button type="button" class="nav-link ${this.currentTab === 'travels' ? 'active' : ''}" role="tab" id="profile-tab-travels" aria-controls="profileTabContent" aria-selected="${this.currentTab === 'travels'}" tabindex="${this.currentTab === 'travels' ? '0' : '-1'}" data-tab="travels">
                                <i class="bi bi-airplane me-1"></i>Путешествия
                            </button>
                        </li>
                        <li class="nav-item">
                            <button type="button" class="nav-link ${this.currentTab === 'movies' ? 'active' : ''}" role="tab" id="profile-tab-movies" aria-controls="profileTabContent" aria-selected="${this.currentTab === 'movies'}" tabindex="${this.currentTab === 'movies' ? '0' : '-1'}" data-tab="movies">
                                <i class="bi bi-film me-1"></i>Кино
                            </button>
                        </li>
                        <li class="nav-item">
                            <button type="button" class="nav-link ${this.currentTab === 'books' ? 'active' : ''}" role="tab" id="profile-tab-books" aria-controls="profileTabContent" aria-selected="${this.currentTab === 'books'}" tabindex="${this.currentTab === 'books' ? '0' : '-1'}" data-tab="books">
                                <i class="bi bi-book me-1"></i>Книги
                            </button>
                        </li>
                        <li class="nav-item">
                            <button type="button" class="nav-link ${this.currentTab === 'dreams' ? 'active' : ''}" role="tab" id="profile-tab-dreams" aria-controls="profileTabContent" aria-selected="${this.currentTab === 'dreams'}" tabindex="${this.currentTab === 'dreams' ? '0' : '-1'}" data-tab="dreams">
                                <i class="bi bi-star me-1"></i>Мечты
                            </button>
                        </li>
                        <li class="nav-item">
                            <button type="button" class="nav-link ${this.currentTab === 'restaurants' ? 'active' : ''}" role="tab" id="profile-tab-restaurants" aria-controls="profileTabContent" aria-selected="${this.currentTab === 'restaurants'}" tabindex="${this.currentTab === 'restaurants' ? '0' : '-1'}" data-tab="restaurants">
                                <i class="bi bi-shop me-1"></i>Рестораны
                            </button>
                        </li>
                        ${isOwnProfile ? `
                            <li class="nav-item ms-auto">
                                <button type="button" class="nav-link ${this.currentTab === 'achievements' ? 'active' : ''}" role="tab" id="profile-tab-achievements" aria-controls="profileTabContent" aria-selected="${this.currentTab === 'achievements'}" tabindex="${this.currentTab === 'achievements' ? '0' : '-1'}" data-tab="achievements">
                                    <i class="bi bi-trophy me-1"></i>Ачивки
                                </button>
                            </li>
                        ` : ''}
                    </ul>

                    <div class="profile-tab-content mt-4" id="profileTabContent" role="tabpanel" tabindex="0" aria-labelledby="profile-tab-${this.currentTab}">
                        ${window.app.ui.createLoader()}
                    </div>
                </div>
            </div>
        `;
    }

    initTabs(userData) {
        const tabsContainer = document.getElementById('profileTabs');
        const panel = document.getElementById('profileTabContent');
        if (!tabsContainer || !panel) return;

        const tabs = Array.from(tabsContainer.querySelectorAll('[role="tab"]'));
        const activate = (tab) => {
            if (!tab || tab.dataset.tab === this.currentTab) return;
            this.currentTab = tab.dataset.tab;
            for (const item of tabs) {
                const selected = item === tab;
                item.classList.toggle('active', selected);
                item.setAttribute('aria-selected', String(selected));
                item.tabIndex = selected ? 0 : -1;
            }
            panel.setAttribute('aria-labelledby', tab.id);
            this.loadTabContent(this.currentTab, userData);
        };

        tabsContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('[role="tab"]');
            if (tab && tabsContainer.contains(tab)) activate(tab);
        });
        tabsContainer.addEventListener('keydown', (event) => {
            const index = tabs.indexOf(document.activeElement);
            if (index < 0) return;
            let next = -1;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;
            if (next < 0) return;
            event.preventDefault();
            activate(tabs[next]);
            tabs[next].focus();
        });
    }

    async loadTabContent(tab, userData) {
        const container = document.getElementById('profileTabContent');
        if (!container) return;

        const requestId = ++this.tabRequestId;
        switch (tab) {
            case 'overview':
                container.innerHTML = this.getOverviewContent(userData);
                break;
            case 'travels':
                await this.loadOwnTravels(container, requestId);
                break;
            case 'movies':
                await this.loadOwnMovies(container, requestId);
                break;
            case 'books':
                await this.loadOwnBooks(container, requestId);
                break;
            case 'dreams':
                await this.loadOwnDreams(container, requestId);
                break;
            case 'achievements':
                container.innerHTML = this.getUserAchievements(userData);
                break;
            default:
                container.innerHTML = this.getPlaceholder(tab);
                break;
        }
    }

    async loadOwnTravels(container, requestId) {
        if (!this.profileIsOwn || window.app.currentUser?.uid !== this.profileUserId) {
            container.innerHTML = this.getPlaceholder('travels');
            return;
        }
        container.innerHTML = window.app.ui.createLoader();
        try {
            const { TravelService } = await import('../../services/travel.service.js');
            const travels = await new TravelService().getTravels(this.profileUserId);
            if (requestId !== this.tabRequestId || !container.isConnected ||
                window.app.currentUser?.uid !== this.profileUserId) return;
            if (!travels.length) {
                container.innerHTML = `
                    <section class="atlas-empty atlas-empty--travel">
                        <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-compass"></i></div>
                        <h3>Твоя карта ещё ждёт открытий</h3>
                        <p>Добавь первое путешествие в личную коллекцию.</p>
                    </section>`;
                return;
            }
            container.innerHTML = `
                <div class="row g-3">
                    ${travels.slice(0, 12).map(travel => `
                        <div class="col-12 col-md-6 col-lg-4">
                            <article class="card-premium profile-collection-card p-3 h-100">
                                <span class="profile-collection-kicker">
                                    ${travel.status === 'visited' ? '✓ Посетил' : '✦ Планирую'}
                                </span>
                                <h3 class="h6 mt-2 mb-2">${escapeHTML(String(travel.title || 'Без названия'))}</h3>
                                <p class="text-muted small mb-0">${escapeHTML(String(travel.location || 'Место не указано'))}</p>
                            </article>
                        </div>`).join('')}
                </div>
                <p class="text-muted small mt-3">
                    Показаны первые ${Math.min(travels.length, 12)} из ${travels.length} путешествий.
                    Полный список доступен в разделе «Путешествия».
                </p>`;
        } catch (error) {
            if (requestId !== this.tabRequestId || !container.isConnected) return;
            console.error('Не удалось загрузить путешествия профиля:', error);
            container.innerHTML = '<div class="alert alert-warning" role="status">Не удалось загрузить путешествия. Попробуй открыть раздел позже.</div>';
        }
    }

    async loadOwnMovies(container, requestId) {
        if (!this.profileIsOwn || window.app.currentUser?.uid !== this.profileUserId) {
            container.innerHTML = this.getPlaceholder('movies');
            return;
        }
        container.innerHTML = window.app.ui.createLoader();
        try {
            const { MovieService } = await import('../../services/movie.service.js');
            const movies = await new MovieService().getUserMovies(this.profileUserId);
            if (requestId !== this.tabRequestId || !container.isConnected ||
                window.app.currentUser?.uid !== this.profileUserId) return;
            if (!movies.length) {
                container.innerHTML = `
                    <section class="atlas-empty atlas-empty--movie">
                        <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-film"></i></div>
                        <h3>Твоя киноколлекция ждёт первой истории</h3>
                        <p>Добавь фильм, который хочется посмотреть или уже полюбил.</p>
                    </section>`;
                return;
            }
            container.innerHTML = `
                <div class="row g-3">
                    ${movies.slice(0, 12).map(movie => `
                        <div class="col-12 col-md-6 col-lg-4">
                            <article class="card-premium profile-collection-card p-3 h-100">
                                <span class="profile-collection-kicker">
                                    ${movie.status === 'watched' ? '✓ Просмотрен' : '✦ Хочу посмотреть'}
                                </span>
                                <h3 class="h6 mt-2 mb-2">${escapeHTML(String(movie.title || 'Без названия'))}</h3>
                                <p class="text-muted small mb-0">${escapeHTML(String(movie.releaseDate || 'Дата выхода не указана'))}</p>
                            </article>
                        </div>`).join('')}
                </div>
                <p class="text-muted small mt-3">
                    Показаны первые ${Math.min(movies.length, 12)} из ${movies.length} фильмов.
                    Полный список доступен в разделе «Кино».
                </p>`;
        } catch (error) {
            if (requestId !== this.tabRequestId || !container.isConnected) return;
            console.error('Не удалось загрузить фильмы профиля:', error);
            container.innerHTML = '<div class="alert alert-warning" role="status">Не удалось загрузить фильмы. Попробуй открыть раздел позже.</div>';
        }
    }

    async loadOwnBooks(container, requestId) {
        if (!this.profileIsOwn || window.app.currentUser?.uid !== this.profileUserId) {
            container.innerHTML = this.getPlaceholder('books');
            return;
        }
        container.innerHTML = window.app.ui.createLoader();
        try {
            const { BookService } = await import('../../services/book.service.js');
            const books = await new BookService().getBooks(this.profileUserId);
            if (requestId !== this.tabRequestId || !container.isConnected ||
                window.app.currentUser?.uid !== this.profileUserId) return;
            if (!books.length) {
                container.innerHTML = `
                    <section class="atlas-empty atlas-empty--book">
                        <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-book"></i></div>
                        <h3>Первая глава ещё впереди</h3>
                        <p>Добавь книгу в личную библиотеку — прочитанную или из списка желаний.</p>
                    </section>`;
                return;
            }
            const statusLabels = { read: '✓ Прочитана', reading: '↗ Читаю', want_to_read: '✦ Хочу прочитать' };
            container.innerHTML = `
                <div class="row g-3">
                    ${books.slice(0, 12).map(book => `
                        <div class="col-12 col-md-6 col-lg-4">
                            <article class="card-premium profile-collection-card p-3 h-100">
                                <span class="profile-collection-kicker">
                                    ${Object.hasOwn(statusLabels, book.status) ? statusLabels[book.status] : '✦ В библиотеке'}
                                </span>
                                <h3 class="h6 mt-2 mb-2">${escapeHTML(String(book.title || 'Без названия'))}</h3>
                                <p class="text-muted small mb-0">${escapeHTML(String(book.author || 'Автор не указан'))}</p>
                            </article>
                        </div>`).join('')}
                </div>
                <p class="text-muted small mt-3">
                    Показаны первые ${Math.min(books.length, 12)} из ${books.length} книг.
                    Полный список доступен в разделе «Книги».
                </p>`;
        } catch (error) {
            if (requestId !== this.tabRequestId || !container.isConnected) return;
            console.error('Не удалось загрузить книги профиля:', error);
            container.innerHTML = '<div class="alert alert-warning" role="status">Не удалось загрузить книги. Попробуй открыть раздел позже.</div>';
        }
    }

    async loadOwnDreams(container, requestId) {
        if (!this.profileIsOwn || window.app.currentUser?.uid !== this.profileUserId) {
            container.innerHTML = this.getPlaceholder('dreams');
            return;
        }
        container.innerHTML = window.app.ui.createLoader();
        try {
            const { DreamsService } = await import('../../services/dreams.service.js');
            const dreams = await new DreamsService().getDreams(this.profileUserId);
            if (requestId !== this.tabRequestId || !container.isConnected ||
                window.app.currentUser?.uid !== this.profileUserId) return;
            if (!dreams.length) {
                container.innerHTML = `
                    <section class="atlas-empty atlas-empty--dream">
                        <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-stars"></i></div>
                        <h3>Всё начинается с мечты</h3>
                        <p>Запиши то, чего по-настоящему хочется достичь, в разделе «Мечты».</p>
                    </section>`;
                return;
            }
            const statusLabels = { completed: '✓ Сбылось', in_progress: '↗ В процессе', dreaming: '✦ Мечтаю' };
            container.innerHTML = `
                <div class="row g-3">
                    ${dreams.slice(0, 12).map(dream => `
                        <div class="col-12 col-md-6 col-lg-4">
                            <article class="card-premium profile-collection-card p-3 h-100">
                                <span class="profile-collection-kicker">
                                    ${statusLabels[dream.status] || statusLabels.dreaming}
                                </span>
                                <h3 class="h6 mt-2 mb-2">${escapeHTML(String(dream.title || 'Без названия'))}</h3>
                                <p class="text-muted small mb-0">${escapeHTML(String(dream.category || 'Личная мечта'))}</p>
                            </article>
                        </div>`).join('')}
                </div>
                <p class="text-muted small mt-3">
                    Показаны первые ${Math.min(dreams.length, 12)} из ${dreams.length} мечт.
                    Полный список доступен в разделе «Мечты».
                </p>`;
        } catch (error) {
            if (requestId !== this.tabRequestId || !container.isConnected) return;
            console.error('Не удалось загрузить мечты профиля:', error);
            container.innerHTML = '<div class="alert alert-warning" role="status">Не удалось загрузить мечты. Попробуй открыть раздел позже.</div>';
        }
    }

    getOverviewContent(userData) {
        const stats = getHomeSnapshot(userData);
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
                        <p class="text-muted small mb-2"><i class="bi bi-envelope me-2"></i>${escapeHTML(userData.email && userData.email === window.app.currentUser?.email ? userData.email : 'Скрыт')}</p>
                        <p class="text-muted small mb-2"><i class="bi bi-geo-alt me-2"></i>${escapeHTML(userData.location || 'Не указан')}</p>
                        <p class="text-muted small mb-2"><i class="bi bi-calendar me-2"></i>На сайте с ${this.formatDate(userData.createdAt)}</p>
                        <p class="text-muted small mb-0"><i class="bi bi-clock me-2"></i>Был ${this.formatDate(userData.lastLogin)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    getUserAchievements(userData) {
        const achievements = Array.isArray(userData.achievements) ? userData.achievements.filter(Boolean) : [];
        if (achievements.length === 0) {
            return `
                <section class="atlas-empty atlas-empty--achievement" aria-label="Достижения пока не получены">
                    <div class="atlas-empty-art" aria-hidden="true">
                        <span class="atlas-empty-orbit"></span>
                        <i class="bi bi-trophy"></i>
                        <span class="atlas-empty-spark atlas-empty-spark--one">✦</span>
                    </div>
                    <span class="atlas-empty-kicker">Путь открытий</span>
                    <h3>Первая награда впереди</h3>
                    <p>Продолжай исследовать Dream&Go, записывать мечты и открытия — здесь появятся твои достижения.</p>
                </section>
            `;
        }
        return `
            <div class="row g-3">
                ${achievements.map(a => `
                    <div class="col-12 col-md-6">
                        <div class="card-premium p-3 achievement-earned">
                            <div class="d-flex align-items-center gap-3">
                                <div class="achievement-icon earned">
                                    <span>${escapeHTML(a.emoji)}</span>
                                </div>
                                <div>
                                    <h6 class="fw-bold mb-0">${escapeHTML(a.title)}</h6>
                                    <p class="text-muted small mb-0">${escapeHTML(a.description)}</p>
                                    <small class="text-muted">${this.formatDate(a.awardedAt)}</small>
                                </div>
                                <span class="badge bg-warning ms-auto">Ур. ${Math.min(999, Math.max(1, Number(a.level) || 1))}</span>
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
            title: `Раздел ${names[tab] || 'профиля'}`,
            description: 'Публичное отображение этого раздела появится позже'
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

            if (!container.isConnected || window.app.currentUser?.uid !== currentUserId) return;

            if (friendDoc.exists()) {
                container.innerHTML = `
                    <span class="badge bg-success me-2"><i class="bi bi-check me-1"></i>В друзьях</span>
                    <button class="btn btn-outline-danger btn-sm me-1" id="removeFriendBtn"><i class="bi bi-person-x me-1"></i>Удалить</button>
                    <button class="btn btn-premium btn-sm" id="messageFriendBtn"><i class="bi bi-chat me-1"></i>Написать</button>
                `;
                document.getElementById('removeFriendBtn')?.addEventListener('click', async () => {
                    if (confirm('Удалить из друзей?')) {
                        await this.runFriendAction(document.getElementById('removeFriendBtn'), () => fs.removeFriend(currentUserId, profileUserId), 'Удалён из друзей', profileUserId);
                    }
                });
                document.getElementById('messageFriendBtn')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.app.router.navigate('chat', { id: profileUserId });
                });
            } else if (sentDoc.exists()) {
                container.innerHTML = `
                    <button class="btn btn-outline-secondary btn-sm me-2" disabled><i class="bi bi-clock me-1"></i>Заявка отправлена</button>
                    <button class="btn btn-outline-danger btn-sm" id="cancelRequestBtn"><i class="bi bi-x me-1"></i>Отменить</button>
                `;
                document.getElementById('cancelRequestBtn')?.addEventListener('click', async () => {
                    await this.runFriendAction(document.getElementById('cancelRequestBtn'), () => fs.rejectFriendRequest(profileUserId, currentUserId), 'Заявка отменена', profileUserId);
                });
            } else if (requestDoc.exists()) {
                container.innerHTML = `
                    <button class="btn btn-success btn-sm me-2" id="acceptRequestBtn"><i class="bi bi-check me-1"></i>Принять</button>
                    <button class="btn btn-outline-danger btn-sm" id="declineRequestBtn"><i class="bi bi-x me-1"></i>Отклонить</button>
                `;
                document.getElementById('acceptRequestBtn')?.addEventListener('click', async () => {
                    await this.runFriendAction(document.getElementById('acceptRequestBtn'), () => fs.acceptFriendRequest(currentUserId, profileUserId), 'Друг добавлен! 🤝', profileUserId);
                });
                document.getElementById('declineRequestBtn')?.addEventListener('click', async () => {
                    await this.runFriendAction(document.getElementById('declineRequestBtn'), () => fs.rejectFriendRequest(currentUserId, profileUserId), 'Заявка отклонена', profileUserId);
                });
            } else {
                container.innerHTML = `
                    <button class="btn btn-premium btn-sm" id="addFriendBtn"><i class="bi bi-person-plus me-1"></i>Добавить в друзья</button>
                `;
                document.getElementById('addFriendBtn')?.addEventListener('click', async () => {
                    await this.runFriendAction(document.getElementById('addFriendBtn'), () => fs.sendFriendRequest(currentUserId, profileUserId), 'Заявка отправлена! 🎉', profileUserId);
                });
            }
        } catch (error) {
            console.error('Не удалось проверить статус дружбы:', error);
            if (!container.isConnected || window.app.currentUser?.uid !== currentUserId) return;
            container.innerHTML = `<span class="text-muted small me-2">Не удалось загрузить статус дружбы</span><button class="btn btn-outline-secondary btn-sm" id="retryFriendStatusBtn">Повторить</button>`;
            container.querySelector('#retryFriendStatusBtn')?.addEventListener('click', () => this.checkFriendshipStatus(profileUserId));
        }
    }

    async runFriendAction(button, task, successMessage, profileUserId) {
        if (!button || button.disabled) return;
        const currentUserId = window.app.currentUser?.uid;
        button.disabled = true;
        try {
            const result = await task();
            if (window.app.currentUser?.uid !== currentUserId) return;
            if (!result?.success) {
                window.app.ui.showToast(result?.error || 'Не удалось выполнить действие', 'error');
                return;
            }
            window.app.ui.showToast(successMessage, 'success');
            await this.checkFriendshipStatus(profileUserId);
        } catch (error) {
            console.error('Ошибка действия с другом:', error);
            if (window.app.currentUser?.uid === currentUserId) window.app.ui.showToast('Не удалось выполнить действие', 'error');
        } finally {
            if (button.isConnected) button.disabled = false;
        }
    }

    async loadUserProfile(userId) {
        try {
            if (!userId) return null;
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (!userDoc.exists()) return null;
            const isOwnProfile = userId === window.app.currentUser?.uid;
            return isOwnProfile ? userDoc.data() : toPublicProfile(userId, userDoc.data());
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