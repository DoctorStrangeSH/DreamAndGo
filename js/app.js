import { auth, db, checkFirebaseConnection } from './config/firebase.js';
import { AuthService } from './services/auth.service.js';
import { ThemeService } from './services/theme.service.js';
import { Router } from './core/router.js';
import { UIComponents } from './core/ui-components.js';
import { EventBus } from './core/event-bus.js';
import { Navigation } from './modules/navigation/navigation.js';
import { AuthModule } from './modules/auth/auth.js';
import { ProfileModule } from './modules/profile/profile.js';
import { TravelsModule } from './modules/travels/travels.js';
import { MoviesModule } from './modules/movies/movies.js';
import { RestaurantsModule } from './modules/restaurants/restaurants.js';
import { DreamsModule } from './modules/dreams/dreams.js';
import { BooksModule } from './modules/books/books.js';
import { FriendsModule } from './modules/friends/friends.js';

class DreamAndGo {
    constructor() {
        // Инициализация сервисов
        this.authService = new AuthService(auth, db);
        this.db = db; // Прямой доступ к Firestore
        this.themeService = new ThemeService();
        this.router = new Router();
        this.ui = new UIComponents();
        this.eventBus = new EventBus();

        // Состояние приложения
        this.currentUser = null;
        this.userData = null;
        this.isOnline = navigator.onLine;
        this.authResolved = false;

        // Делаем приложение доступным глобально
        window.app = this;

        // Запускаем инициализацию
        this.init();

        // Отслеживаем онлайн/офлайн статус
        this.initConnectionListeners();
    }

    async init() {
        console.log('🚀 Инициализация Dream&Go...');
        console.log('⏰ Время:', new Date().toLocaleString());

        // Проверяем подключение к Firebase
        try {
            const isConnected = await checkFirebaseConnection();
            if (!isConnected) {
                console.warn('⚠️ Проблемы с подключением к Firebase. Проверь интернет-соединение');
                this.ui.showToast('Проблемы с подключением к серверу', 'warning');
            }
        } catch (error) {
            console.warn('⚠️ Не удалось проверить подключение:', error);
        }

        // Показываем сплеш-скрин
        await this.showSplash();

        // Инициализируем тему
        this.themeService.init();

        // Регистрируем ВСЕ маршруты (но роутер ещё не запускаем)
        this.registerRoutes();

        // Подписываемся на события
        this.initEventListeners();

        // ЖДЁМ ответа от Firebase перед запуском роутера
        console.log('⏳ Ожидание статуса авторизации от Firebase...');

        this.authService.onAuthChange((user) => {
            this.currentUser = user;
            this.authResolved = true;

            console.log('🔐 Статус авторизации получен:', user ? `Вошёл (${user.email})` : 'Не вошёл');

            if (user) {
                this.showApp();
                this.loadUserData();
            } else {
                this.userData = null;
                this.showAuth();
            }

            // Запускаем роутер только если ещё не запущен
            if (!this.router.isReady) {
                console.log('✅ Статус получен, запускаю роутер');
                this.router.init();
            }
        });
    }

    async showSplash() {
        return new Promise(resolve => {
            const splash = document.getElementById('splashScreen');
            if (!splash) {
                console.log('⚠️ Сплш-скрин не найден');
                resolve();
                return;
            }

            // Минимальная задержка для красоты
            const duration = 1500;
            console.log(`✨ Показываю сплш-скрин (${duration}ms)`);

            setTimeout(() => {
                splash.classList.add('fade-out');
                setTimeout(() => {
                    if (splash.parentNode) {
                        splash.remove();
                    }
                    console.log('✨ Сплш-скрин скрыт');
                    resolve();
                }, 500);
            }, duration);
        });
    }

    registerRoutes() {
        console.log('📝 Регистрация маршрутов...');

        // Аутентификация (без авторизации)
        this.router.register('auth', new AuthModule(this.authService), {
            title: 'Вход',
            requiresAuth: false,
            showInNav: false
        });

        // Главная страница
        this.router.register('home', {
            render: () => this.renderHomePage()
        }, {
            title: 'Главная',
            icon: 'bi-house-heart',
            showInNav: true
        });

        // Путешествия
        this.router.register('travels', new TravelsModule(), {
            title: 'Путешествия',
            icon: 'bi-airplane',
            showInNav: true
        });

        // Рестораны
        this.router.register('food', new RestaurantsModule(), {
            title: 'Рестораны',
            icon: 'bi-shop',
            showInNav: true
        });

        // Кино
        this.router.register('movies', new MoviesModule(), {
            title: 'Кино',
            icon: 'bi-film',
            showInNav: true
        });
        // Книги
        this.router.register('books', new BooksModule(), {
            title: 'Книги',
            icon: 'bi-book',
            showInNav: true
        });

        // Мечты
        this.router.register('dreams', new DreamsModule(), {
            title: 'Мечты',
            icon: 'bi-star',
            showInNav: true
        });

        // Друзья
        this.router.register('friends', new FriendsModule(), {
            title: 'Друзья',
            icon: 'bi-people',
            showInNav: true
        });

        // Чат
        this.router.register('chat', {
            render: () => this.renderPlaceholder(
                'Чат 💬',
                'chat-dots',
                'Общайся с друзьями в реальном времени'
            )
        }, {
            title: 'Чат',
            icon: 'bi-chat-dots',
            showInNav: false
        });

        // Профиль
        this.router.register('profile', new ProfileModule(), {
            title: 'Профиль',
            showInNav: false
        });

        console.log(`✅ Зарегистрировано ${Object.keys(this.router.routes).length} маршрутов`);

        // Хук проверки авторизации (срабатывает перед каждым переходом)
        this.router.beforeEach((path, params) => {
            console.log(`🪝 Before хук для: ${path}, пользователь:`, this.currentUser ? 'есть' : 'нет');

            // Страница входа доступна всем
            if (path === 'auth') {
                // Если пользователь уже вошёл, не пускаем на страницу входа
                if (this.currentUser && this.authResolved) {
                    console.log('👤 Уже вошёл, перенаправляю на home');
                    this.router.navigate('home');
                    return false;
                }
                return true;
            }

            // Все остальные страницы требуют авторизации
            if (!this.currentUser) {
                console.log('🔒 Нет доступа, перенаправляю на auth');
                this.router.navigate('auth');
                return false;
            }

            return true;
        });

        // Хук после загрузки страницы
        this.router.afterEach((path, params) => {
            console.log(`📄 Страница загружена: ${path}`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    initEventListeners() {
        // Отслеживаем изменения данных пользователя
        this.eventBus.on('userDataUpdated', (data) => {
            this.userData = { ...this.userData, ...data };
            this.updateHomeStats();
        });

        // Отслеживаем выход из системы
        this.eventBus.on('userLoggedOut', () => {
            this.currentUser = null;
            this.userData = null;
        });

        // Обработка ошибок
        window.addEventListener('error', (event) => {
            console.error('❌ Глобальная ошибка:', event.error);
        });

        // Обработка необработанных промисов
        window.addEventListener('unhandledrejection', (event) => {
            console.error('❌ Необработанная ошибка промиса:', event.reason);
            this.ui.showToast('Произошла ошибка. Попробуйте позже', 'error');
        });
    }

    initConnectionListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Онлайн');
            this.ui.showToast('Подключение восстановлено ✅', 'success');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📡 Офлайн');
            this.ui.showToast('Отсутствует подключение к интернету 📡', 'warning');
        });
    }

    showApp() {
        const appContainer = document.getElementById('app');
        if (!appContainer) {
            console.error('❌ Контейнер приложения не найден');
            return;
        }

        // Не перерисовываем, если приложение уже показано
        if (!appContainer.classList.contains('d-none') && document.getElementById('main-content')) {
            console.log('📱 Приложение уже отрендерено');
            // Но роутер всё равно запускаем
            if (!this.router.isReady) {
                this.router.init();
            }
            return;
        }

        console.log('📱 Рендеринг приложения...');

        appContainer.classList.remove('d-none');
        appContainer.innerHTML = '';

        // Добавляем навигацию
        const navigation = new Navigation(this.router);
        appContainer.insertAdjacentHTML('beforeend', navigation.render());

        // Создаём контейнер для основного контента
        const mainContent = document.createElement('main');
        mainContent.id = 'main-content';
        mainContent.className = 'container-fluid p-3 p-md-4';
        appContainer.appendChild(mainContent);

        console.log('✅ Приложение отрендерено');

        // Запускаем роутер после рендера
        if (!this.router.isReady) {
            this.router.init();
        }
    }

    showAuth() {
        const appContainer = document.getElementById('app');
        if (!appContainer) {
            console.error('❌ Контейнер приложения не найден');
            return;
        }

        console.log('🔐 Показываю страницу входа');

        appContainer.classList.remove('d-none');
        appContainer.innerHTML = '';

        // Показываем страницу входа
        const authModule = new AuthModule(this.authService);
        authModule.render();
    }

    async loadUserData() {
        if (!this.currentUser) return;

        try {
            console.log('📊 Загрузка данных пользователя...');
            const result = await this.authService.getUserData(this.currentUser.uid);
            if (result.success) {
                this.userData = result.data;
                console.log('✅ Данные пользователя загружены');

                // Обновляем статистику на главной
                this.updateHomeStats();

                // Оповещаем систему о загрузке данных
                this.eventBus.emit('userDataLoaded', this.userData);
            } else {
                console.error('❌ Ошибка загрузки данных:', result.error);
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки данных пользователя:', error);
        }
    }

    updateHomeStats() {
        if (!this.userData?.stats) return;

        const stats = this.userData.stats;
        const statElements = {
            travels: document.querySelector('[data-stat="travels"]'),
            restaurants: document.querySelector('[data-stat="restaurants"]'),
            movies: document.querySelector('[data-stat="movies"]'),
            books: document.querySelector('[data-stat="books"]')
        };

        Object.entries(statElements).forEach(([key, element]) => {
            if (element && stats[key] !== undefined) {
                this.animateNumber(element, parseInt(element.textContent) || 0, stats[key]);
            }
        });
    }

    animateNumber(element, start, end) {
        if (start === end) return;

        const duration = 1000;
        const startTime = performance.now();

        const updateNumber = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(updateNumber);
            }
        };

        requestAnimationFrame(updateNumber);
    }

    renderHomePage() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userName = this.userData?.username ||
            this.currentUser?.email?.split('@')[0] ||
            'Мечтатель';

        mainContent.innerHTML = `
            <div class="container py-3 py-md-4">
                <!-- Приветствие -->
                <div class="welcome-section mb-5 fade-in-up">
                    <div class="row align-items-center">
                        <div class="col-12 col-lg-8">
                            <h1 class="display-4 fw-bold mb-2">
                                Привет, <span class="text-gradient">@${userName}</span>! 👋
                            </h1>
                            <p class="lead text-muted mb-0">
                                ${this.getRandomGreeting()}
                            </p>
                        </div>
                        <div class="col-12 col-lg-4 text-lg-end mt-3 mt-lg-0">
                            <span class="badge bg-light text-dark">
                                <i class="bi bi-circle-fill text-success me-1" style="font-size: 0.5rem;"></i>
                                Онлайн
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Статистика -->
                <div class="row g-4 mb-5">
                    ${this.createStatCard('travels', 'bi-airplane', 'Путешествия', '0', '#6C5CE7', 0)}
                    ${this.createStatCard('restaurants', 'bi-egg-fried', 'Рестораны', '0', '#00B894', 1)}
                    ${this.createStatCard('movies', 'bi-film', 'Фильмы', '0', '#FDCB6E', 2)}
                    ${this.createStatCard('books', 'bi-book', 'Книги', '0', '#E17055', 3)}
                </div>

                <!-- Быстрые действия -->
                <div class="quick-actions mb-5">
                    <h3 class="fw-bold mb-4">
                        <i class="bi bi-lightning-charge text-warning me-2"></i>
                        Быстрые действия
                    </h3>
                    <div class="row g-3">
                        <div class="col-12 col-md-6 col-lg-4">
                            ${this.createQuickAction('travels', 'bi-plus-circle', 'Добавить путешествие', 'Запланируй новое приключение', 'primary')}
                        </div>
                        <div class="col-12 col-md-6 col-lg-4">
                            ${this.createQuickAction('food', 'bi-star', 'Добавить ресторан', 'Поделись любимым местом', 'success')}
                        </div>
                        <div class="col-12 col-md-6 col-lg-4">
                            ${this.createQuickAction('dreams', 'bi-lightbulb', 'Записать мечту', 'Сохрани свою цель', 'warning')}
                        </div>
                    </div>
                </div>

                <!-- Последняя активность -->
                <div class="recent-activity">
                    <h3 class="fw-bold mb-4">
                        <i class="bi bi-clock-history text-info me-2"></i>
                        Последняя активность
                    </h3>
                    <div class="card-premium p-4">
                        ${this.getRecentActivity()}
                    </div>
                </div>
            </div>
        `;

        // Обновляем статистику после рендера
        setTimeout(() => this.updateHomeStats(), 100);
    }

    createStatCard(id, icon, title, defaultVal, color, delay) {
        return `
            <div class="col-6 col-md-3 fade-in-up" style="animation-delay: ${delay * 0.1}s">
                <div class="card-premium stat-card p-3 p-md-4 text-center h-100">
                    <div class="stat-icon mb-3" style="background: ${color}20; color: ${color}">
                        <i class="bi ${icon} fs-1"></i>
                    </div>
                    <h3 class="fw-bold mb-1 counter" data-stat="${id}">${defaultVal}</h3>
                    <p class="text-muted mb-0 small">${title}</p>
                </div>
            </div>
        `;
    }

    createQuickAction(link, icon, title, description, color) {
        return `
            <a href="#${link}" class="text-decoration-none">
                <div class="card-premium p-3 quick-action-card h-100">
                    <div class="d-flex align-items-center gap-3">
                        <div class="quick-action-icon bg-${color} bg-opacity-10">
                            <i class="bi ${icon} fs-4 text-${color}"></i>
                        </div>
                        <div>
                            <h6 class="fw-bold mb-1">${title}</h6>
                            <p class="text-muted small mb-0">${description}</p>
                        </div>
                        <i class="bi bi-chevron-right ms-auto text-muted"></i>
                    </div>
                </div>
            </a>
        `;
    }

    getRecentActivity() {
        const activities = [
            { icon: 'bi-person-plus', text: 'Добро пожаловать в Dream&Go!', time: 'Только что', color: 'primary' },
            { icon: 'bi-rocket', text: 'Создай своё первое путешествие', time: 'Сейчас', color: 'success' },
            { icon: 'bi-star', text: 'Запиши свою первую мечту', time: 'Сейчас', color: 'warning' }
        ];

        if (!activities.length) {
            return this.ui.createEmptyState({
                icon: 'bi-inbox',
                title: 'Пока нет активности',
                description: 'Начни использовать Dream&Go и здесь появится история'
            });
        }

        return activities.map((activity, index) => `
            <div class="d-flex align-items-center ${index > 0 ? 'mt-3 pt-3 border-top' : ''}">
                <div class="activity-icon me-3 bg-${activity.color} bg-opacity-10 p-2 rounded">
                    <i class="bi ${activity.icon} text-${activity.color}"></i>
                </div>
                <div class="flex-grow-1">
                    <p class="mb-0">${activity.text}</p>
                    <small class="text-muted">${activity.time}</small>
                </div>
            </div>
        `).join('');
    }

    getRandomGreeting() {
        const greetings = [
            'Готов к новым приключениям? 🚀',
            'Какие планы на сегодня? 📋',
            'Время воплощать мечты в реальность! ✨',
            'Отличный день для новых открытий! 🌟',
            'Твои мечты ждут тебя! 💫'
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    renderPlaceholder(title, icon, description) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="container py-5">
                <div class="row justify-content-center">
                    <div class="col-12 col-md-8 col-lg-6 text-center">
                        <div class="card-premium p-5">
                            <div class="placeholder-icon mb-4">
                                <i class="bi bi-${icon} display-1 text-primary opacity-50"></i>
                            </div>
                            <h2 class="fw-bold mb-3">${title}</h2>
                            <p class="text-muted mb-4">${description}</p>
                            <div class="d-flex justify-content-center gap-3">
                                <button class="btn btn-premium" onclick="window.app.router.navigate('home')">
                                    <i class="bi bi-house me-2"></i>На главную
                                </button>
                                <button class="btn btn-outline-primary">
                                    <i class="bi bi-plus me-2"></i>Добавить
                                </button>
                            </div>
                            <div class="mt-4">
                                <span class="badge bg-warning text-dark">
                                    <i class="bi bi-tools me-1"></i>В разработке
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Публичные методы для вызова из других модулей
    openSearch() {
        console.log('🔍 Открыть поиск');
        this.ui.showToast('Поиск будет доступен в следующем обновлении', 'info');
    }

    refreshUserData() {
        return this.loadUserData();
    }
}

window.editTravel = (id) => {
    const travelsModule = window.app.router.routes['travels']?.component;
    if (travelsModule) {
        travelsModule.showTravelModal(id);
    }
};

window.deleteTravel = async (id) => {
    if (confirm('Удалить это путешествие?')) {
        const travelsModule = window.app.router.routes['travels']?.component;
        if (travelsModule) {
            const result = await travelsModule.travelService.deleteTravel(window.app.currentUser.uid, id);
            if (result.success) {
                window.app.ui.showToast('Путешествие удалено', 'info');
                travelsModule.render();
                window.app.refreshUserData();
            }
        }
    }
};

// Запускаем приложение когда DOM готов
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен, запускаю приложение...');
    new DreamAndGo();
});

// Экспорт для возможного использования в других модулях
export { DreamAndGo };