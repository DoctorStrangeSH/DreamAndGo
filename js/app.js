import { auth, db, checkFirebaseConnection } from './config/firebase.js';
import { AuthService } from './services/auth.service.js';
import { ThemeService } from './services/theme.service.js';
import { Router } from './core/router.js';
import { UIComponents } from './core/ui-components.js';
import { EventBus } from './core/event-bus.js';
import { RealtimeService } from './services/realtime.service.js';
import { Navigation } from './modules/navigation/navigation.js';
import { AuthModule } from './modules/auth/auth.js';
import { ProfileModule } from './modules/profile/profile.js';
import { TravelsModule } from './modules/travels/travels.js';
import { RestaurantsModule } from './modules/restaurants/restaurants.js';
import { MoviesModule } from './modules/movies/movies.js';
import { BooksModule } from './modules/books/books.js';
import { DreamsModule } from './modules/dreams/dreams.js';
import { FriendsModule } from './modules/friends/friends.js';
import { ChatModule } from './modules/chat/chat.js';
import { SettingsModule } from './modules/settings/settings.js';
import { AchievementsModule } from './modules/achievements/achievements.js';
import { AchievementsService } from './services/achievements.service.js';
import { NotificationsService } from './services/notifications.service.js';
import { NotificationsWidget } from './modules/notifications/notifications-widget.js';
import { SearchService } from './services/search.service.js';
import { ExportService } from './services/export.service.js';
import { SearchModal } from './modules/search/search-modal.js';
import { LevelService } from './services/level.service.js';
import { LevelWidget } from './modules/level/level-widget.js';
import { DailyTasksService } from './services/daily-tasks.service.js';
import { DailyTasksWidget } from './modules/daily-tasks/daily-tasks.js';

class DreamAndGo {
    constructor() {
        this.authService = new AuthService(auth, db);
        this.db = db;
        this.themeService = new ThemeService();
        this.router = new Router();
        this.ui = new UIComponents();
        this.eventBus = new EventBus();
        this.realtimeService = new RealtimeService();
        this.achievementsService = new AchievementsService();
        this.notificationsService = new NotificationsService();
        this.notificationsWidget = new NotificationsWidget();
        this.searchService = new SearchService();
        this.exportService = new ExportService();
        this.searchModal = new SearchModal();
        this.levelService = new LevelService();
        this.levelWidget = new LevelWidget();
        this.dailyTasksService = new DailyTasksService();
        this.dailyTasksWidget = new DailyTasksWidget();

        this.currentUser = null;
        this.userData = null;
        this.isOnline = navigator.onLine;
        this.authResolved = false;
        this.dataLoaded = false;

        window.app = this;
        this.init();
        this.initConnectionListeners();
    }

    async init() {
        try { await checkFirebaseConnection(); } catch (e) { }

        await this.showSplash();
        this.themeService.init();
        this.registerRoutes();
        this.initEventListeners();

        this.authService.onAuthChange(async (user) => {
            this.currentUser = user;
            this.authResolved = true;

            if (user) {
                this.showApp();
                this.notificationsWidget.init();
                await this.loadUserData();
                setTimeout(() => this.renderNavWidgets(), 500);
            } else {
                this.userData = null;
                this.dataLoaded = false;
                this.showAuth();
            }

            if (!this.router.isReady) this.router.init();
        });

        // Горячие клавиши
        document.addEventListener('keydown', (e) => {
            if (!this.currentUser) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); this.openSearch(); }
            const navKeys = { '1': 'home', '2': 'travels', '3': 'food', '4': 'movies', '5': 'books', '6': 'dreams', '7': 'friends', '8': 'chat', '9': 'achievements' };
            if ((e.ctrlKey || e.metaKey) && navKeys[e.key]) { e.preventDefault(); this.router.navigate(navKeys[e.key]); }
        });
    }

    async showSplash() {
        return new Promise(resolve => {
            const splash = document.getElementById('splashScreen');
            if (!splash) { resolve(); return; }
            setTimeout(() => {
                splash.classList.add('fade-out');
                setTimeout(() => { if (splash.parentNode) splash.remove(); resolve(); }, 500);
            }, 1500);
        });
    }

    registerRoutes() {
        this.router.register('auth', new AuthModule(this.authService), { title: 'Вход', requiresAuth: false, showInNav: false });
        this.router.register('home', { render: () => this.renderHomePage() }, { title: 'Главная', icon: 'bi-house-heart', showInNav: true });
        this.router.register('travels', new TravelsModule(), { title: 'Путешествия', icon: 'bi-airplane', showInNav: true });
        this.router.register('food', new RestaurantsModule(), { title: 'Рестораны', icon: 'bi-shop', showInNav: true });
        this.router.register('movies', new MoviesModule(), { title: 'Кино', icon: 'bi-film', showInNav: true });
        this.router.register('books', new BooksModule(), { title: 'Книги', icon: 'bi-book', showInNav: true });
        this.router.register('dreams', new DreamsModule(), { title: 'Мечты', icon: 'bi-star', showInNav: true });
        this.router.register('friends', new FriendsModule(), { title: 'Друзья', icon: 'bi-people', showInNav: true });
        this.router.register('chat', new ChatModule(), { title: 'Чат', icon: 'bi-chat-dots', showInNav: true });
        this.router.register('profile', new ProfileModule(), { title: 'Профиль', showInNav: false });
        this.router.register('settings', new SettingsModule(), { title: 'Настройки', showInNav: false });
        this.router.register('achievements', new AchievementsModule(), { title: 'Достижения', icon: 'bi-trophy', showInNav: true });

        this.router.beforeEach((path) => {
            if (path === 'auth') {
                if (this.currentUser && this.authResolved) { this.router.navigate('home'); return false; }
                return true;
            }
            if (!this.currentUser) { this.router.navigate('auth'); return false; }
            return true;
        });

        this.router.afterEach((path) => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    }

    initEventListeners() {
        this.eventBus.on('userDataUpdated', (data) => { this.userData = { ...this.userData, ...data }; this.updateHomeStats(); });
        this.eventBus.on('userLoggedOut', () => { this.currentUser = null; this.userData = null; this.dataLoaded = false; });
    }

    initConnectionListeners() {
        window.addEventListener('online', () => { this.isOnline = true; this.ui.showToast('Подключение восстановлено ✅', 'success'); });
        window.addEventListener('offline', () => { this.isOnline = false; this.ui.showToast('Отсутствует подключение к интернету 📡', 'warning'); });
    }

    showApp() {
        const appContainer = document.getElementById('app');
        if (!appContainer) return;
        if (!appContainer.classList.contains('d-none') && document.getElementById('main-content')) {
            if (!this.router.isReady) this.router.init();
            return;
        }
        appContainer.classList.remove('d-none');
        appContainer.innerHTML = '';
        const navigation = new Navigation(this.router);
        appContainer.insertAdjacentHTML('beforeend', navigation.render());
        const mainContent = document.createElement('main');
        mainContent.id = 'main-content';
        mainContent.className = 'container-fluid p-3 p-md-4';
        appContainer.appendChild(mainContent);
        mainContent.innerHTML = this.ui.createLoader();
    }

    showAuth() {
        const appContainer = document.getElementById('app');
        if (!appContainer) return;
        appContainer.classList.remove('d-none');
        appContainer.innerHTML = '';
        new AuthModule(this.authService).render();
    }

    async loadUserData() {
        if (!this.currentUser) return;
        try {
            const result = await this.authService.getUserData(this.currentUser.uid);
            if (result.success) {
                this.userData = result.data;
                this.dataLoaded = true;
                this.updateHomeStats();
                this.eventBus.emit('userDataLoaded', this.userData);
                this.checkAchievements();
                const currentRoute = this.router.getCurrentRoute();
                if (currentRoute && this.router.routes[currentRoute]) {
                    await this.router.routes[currentRoute].component.render();
                }
            }
        } catch (error) { console.error('Ошибка загрузки данных:', error); }
    }

    async checkAchievements() {
        if (!this.currentUser) return;
        try {
            const newAchievements = await this.achievementsService.checkAndAwardAchievements(this.currentUser.uid);
            if (newAchievements.length > 0) {
                newAchievements.forEach(a => this.ui.showToast(`${a.emoji} ${a.title} — ${a.description}`, 'success'));
            }
        } catch (error) { console.error('Ошибка проверки достижений:', error); }
    }

    async awardXP(action) {
        if (!this.currentUser) return;
        try {
            const result = await this.levelService.addXP(this.currentUser.uid, action);
            if (result) this.renderNavWidgets();
            return result;
        } catch (error) { return null; }
    }

    async onUserAction(action) {
        await this.awardXP(action);
        try { await this.dailyTasksService?.updateTaskProgress(this.currentUser.uid, action); } catch (e) { }
    }

    updateHomeStats() {
        if (!this.userData?.stats) return;
        const stats = this.userData.stats;
        ['travels', 'restaurants', 'movies', 'books'].forEach(key => {
            const el = document.querySelector(`[data-stat="${key}"]`);
            if (el) el.textContent = stats[key] || 0;
        });
    }

    async renderNavWidgets() {
        const navbarNav = document.getElementById('navbarNav');
        if (!navbarNav) return;
        const userMenu = navbarNav.querySelector('.d-flex.align-items-center.gap-2');
        if (!userMenu) return;

        // Удаляем старые виджеты
        userMenu.querySelectorAll('.level-widget, .daily-tasks-widget').forEach(el => el.remove());

        const levelHTML = await this.levelWidget.render();
        if (levelHTML) {
            const lc = document.createElement('div');
            lc.innerHTML = levelHTML;
            userMenu.insertBefore(lc.firstElementChild, userMenu.firstChild);
        }

        const tasksHTML = await this.dailyTasksWidget.render();
        if (tasksHTML) {
            const tc = document.createElement('div');
            tc.innerHTML = tasksHTML;
            userMenu.insertBefore(tc.firstElementChild, userMenu.children[1] || userMenu.firstChild);
            this.dailyTasksWidget.attachListeners();
        }
    }

    renderHomePage() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userName = this.userData?.username || this.currentUser?.email?.split('@')[0] || 'Мечтатель';
        const stats = this.userData?.stats || {};

        mainContent.innerHTML = `
            <div class="container py-3 py-md-4">
                <div class="welcome-section mb-4 fade-in-up">
                    <div class="card-premium p-4 p-md-5" style="background: linear-gradient(135deg, rgba(108,92,231,0.05) 0%, rgba(168,85,247,0.05) 100%);">
                        <div class="row align-items-center">
                            <div class="col-12 col-lg-7">
                                <h1 class="display-4 fw-bold mb-2">Привет, <span class="text-gradient">@${userName}</span>! ✨</h1>
                                <p class="lead text-secondary mb-3">${this.getRandomGreeting()}</p>
                                <div class="d-flex gap-2 flex-wrap">
                                    <a href="#travels" class="btn btn-premium btn-sm"><i class="bi bi-plus-lg me-1"></i>Добавить путешествие</a>
                                    <a href="#movies" class="btn btn-outline-primary btn-sm"><i class="bi bi-search me-1"></i>Найти фильм</a>
                                    <a href="#dreams" class="btn btn-outline-primary btn-sm"><i class="bi bi-star me-1"></i>Записать мечту</a>
                                </div>
                            </div>
                            <div class="col-12 col-lg-5 text-center mt-3 mt-lg-0">
                                <div class="position-relative d-inline-block">
                                    <div class="avatar-circle" style="width: 100px; height: 100px; font-size: 2.5rem;">${userName[0].toUpperCase()}</div>
                                    <span class="position-absolute bottom-0 end-0 bg-success rounded-circle p-1" style="width: 20px; height: 20px;"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row g-3 mb-4 fade-in-up" style="animation-delay: 0.1s;">
                    <div class="col-6 col-md-3"><div class="card-premium stat-card p-3 text-center h-100"><div class="stat-icon mb-2 mx-auto" style="background: rgba(108,92,231,0.1); color: #6C5CE7;"><i class="bi bi-airplane fs-3"></i></div><h4 class="fw-bold mb-0" data-stat="travels">${stats.travels || 0}</h4><small class="text-muted">Путешествий</small></div></div>
                    <div class="col-6 col-md-3"><div class="card-premium stat-card p-3 text-center h-100"><div class="stat-icon mb-2 mx-auto" style="background: rgba(0,184,148,0.1); color: #00B894;"><i class="bi bi-shop fs-3"></i></div><h4 class="fw-bold mb-0" data-stat="restaurants">${stats.restaurants || 0}</h4><small class="text-muted">Ресторанов</small></div></div>
                    <div class="col-6 col-md-3"><div class="card-premium stat-card p-3 text-center h-100"><div class="stat-icon mb-2 mx-auto" style="background: rgba(253,203,110,0.1); color: #FDCB6E;"><i class="bi bi-film fs-3"></i></div><h4 class="fw-bold mb-0" data-stat="movies">${stats.movies || 0}</h4><small class="text-muted">Фильмов</small></div></div>
                    <div class="col-6 col-md-3"><div class="card-premium stat-card p-3 text-center h-100"><div class="stat-icon mb-2 mx-auto" style="background: rgba(225,112,85,0.1); color: #E17055;"><i class="bi bi-book fs-3"></i></div><h4 class="fw-bold mb-0" data-stat="books">${stats.books || 0}</h4><small class="text-muted">Книг</small></div></div>
                </div>

                <div class="row g-4 fade-in-up" style="animation-delay: 0.2s;">
                    <div class="col-12 col-md-5">
                        <div class="card-premium p-4 h-100">
                            <h5 class="fw-bold mb-3"><i class="bi bi-lightning-charge text-warning me-2"></i>Быстрые действия</h5>
                            ${['travels', 'movies', 'food', 'dreams', 'books'].map((id, i) => {
            const icons = ['bi-plus-circle', 'bi-film', 'bi-shop', 'bi-star', 'bi-book'];
            const colors = ['primary', 'warning', 'success', 'info', 'danger'];
            const labels = ['Добавить путешествие', 'Найти фильм', 'Добавить ресторан', 'Записать мечту', 'Добавить книгу'];
            return `<a href="#${id}" class="quick-action-link text-decoration-none"><div class="d-flex align-items-center gap-3 p-2 rounded-3 hover-bg"><div class="bg-${colors[i]} bg-opacity-10 rounded-3 d-flex align-items-center justify-content-center" style="width:40px;height:40px"><i class="bi ${icons[i]} text-${colors[i]}"></i></div><span class="fw-semibold">${labels[i]}</span></div></a>`;
        }).join('')}
                        </div>
                    </div>
                    <div class="col-12 col-md-7">
                        <div class="card-premium p-4 h-100">
                            <h5 class="fw-bold mb-3"><i class="bi bi-clock-history text-info me-2"></i>С чего начать?</h5>
                            ${this.getOnboardingSteps()}
                            <hr class="my-3">
                            <h6 class="fw-bold mb-2"><i class="bi bi-trophy text-warning me-2"></i>Последние достижения</h6>
                            ${this.getRecentAchievements()}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    getOnboardingSteps() {
        const stats = this.userData?.stats || {};
        const steps = [
            { done: stats.travels > 0, icon: 'bi-airplane', text: 'Добавь своё первое путешествие', link: '#travels', color: 'primary' },
            { done: stats.movies > 0, icon: 'bi-film', text: 'Найди и оцени первый фильм', link: '#movies', color: 'warning' },
            { done: stats.books > 0, icon: 'bi-book', text: 'Добавь любимую книгу', link: '#books', color: 'danger' },
            { done: stats.dreams > 0, icon: 'bi-star', text: 'Запиши свою мечту', link: '#dreams', color: 'info' },
            { done: stats.friends > 0, icon: 'bi-people', text: 'Найди друга по никнейму', link: '#friends', color: 'success' },
        ];
        return steps.map(step => `
            <a href="${step.link}" class="text-decoration-none">
                <div class="d-flex align-items-center gap-3 p-2 rounded-3 hover-bg">
                    <div style="width:36px;height:36px;background:rgba(108,92,231,0.1);border-radius:10px;display:flex;align-items:center;justify-content:center">
                        <i class="bi ${step.icon} ${step.done ? 'text-success' : 'text-muted'}"></i>
                    </div>
                    <span class="${step.done ? 'text-success text-decoration-line-through' : ''}">${step.text}</span>
                    ${step.done ? '<i class="bi bi-check-circle-fill text-success ms-auto"></i>' : '<i class="bi bi-chevron-right text-muted ms-auto"></i>'}
                </div>
            </a>`).join('');
    }

    getRecentAchievements() {
        const achievements = this.userData?.achievements || [];
        const recent = achievements.slice(-3).reverse();
        if (recent.length === 0) return '<p class="text-muted small mb-0">Пока нет достижений. Начни пользоваться сайтом!</p>';
        return recent.map(a => `
            <div class="d-flex align-items-center gap-2 mb-2">
                <span style="font-size:1.2rem">${a.emoji}</span>
                <div><small class="fw-semibold">${a.title}</small><small class="text-muted d-block" style="font-size:0.7rem">${a.description}</small></div>
            </div>`).join('');
    }

    getRandomGreeting() {
        const hour = new Date().getHours();
        let timeGreeting = 'Добрый день';
        if (hour < 6) timeGreeting = 'Доброй ночи';
        else if (hour < 12) timeGreeting = 'Доброе утро';
        else if (hour < 18) timeGreeting = 'Добрый день';
        else timeGreeting = 'Добрый вечер';
        const greetings = [`${timeGreeting}! Готов к новым приключениям?`, `${timeGreeting}! Какие планы на сегодня?`, `${timeGreeting}! Время воплощать мечты!`, `${timeGreeting}! Отличный день для открытий!`, `${timeGreeting}! Твои мечты ждут тебя!`];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    openSearch() { this.searchModal.show(); }
    refreshUserData() { return this.loadUserData(); }
}

document.addEventListener('DOMContentLoaded', () => { new DreamAndGo(); });
export { DreamAndGo };