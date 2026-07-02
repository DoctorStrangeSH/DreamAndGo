export class Router {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
        this.currentParams = {};
        this.beforeHooks = [];
        this.afterHooks = [];
        this.isReady = false;
        this.isProcessing = false; // Защита от повторных вызовов
        
        console.log('🛠️ Роутер создан (ожидает инициализации)');
    }

    // Инициализация - вызываем после регистрации всех маршрутов
    init() {
        if (this.isReady) {
            console.log('📍 Роутер уже инициализирован, пропускаю');
            return;
        }
        
        this.isReady = true;
        
        // Слушаем изменения хеша
        window.addEventListener('hashchange', () => {
            console.log('🔄 Хеш изменился');
            this.handleRoute();
        });
        
        console.log('📍 Роутер инициализирован, запускаю первый рендер');
        
        // Запускаем первый рендер
        this.handleRoute();
    }

    // Регистрация маршрута
    register(path, component, options = {}) {
        this.routes[path] = {
            component,
            options,
            meta: {
                title: options.title || 'Dream&Go',
                icon: options.icon || null,
                requiresAuth: options.requiresAuth !== false,
                showInNav: options.showInNav !== false
            }
        };
        console.log(`📍 Маршрут зарегистрирован: ${path} [${this.routes[path].meta.title}]`);
    }

    // Навигация
    navigate(path, params = {}) {
        this.currentParams = params;
        const hashPath = params.id ? `${path}/${params.id}` : path;
        console.log(`🧭 Переход: ${hashPath}`);
        window.location.hash = hashPath;
    }

    // Обработка текущего маршрута
    async handleRoute() {
        // Защита от одновременных вызовов
        if (this.isProcessing) {
            console.log('⏳ Роутер занят, пропускаю вызов');
            return;
        }
        
        this.isProcessing = true;
        
        try {
            // Получаем путь из хеша
            let hash = window.location.hash.slice(1) || 'home';
            
            // Разбираем путь
            const parts = hash.split('/');
            let path = parts[0];
            let id = parts[1] || null;
            
            console.log(`🧭 Навигация: ${path}${id ? '/' + id : ''}`);
            console.log(`📋 Доступные маршруты (${Object.keys(this.routes).length}):`, Object.keys(this.routes).join(', '));
            
            // Выполняем before хуки
            for (const hook of this.beforeHooks) {
                try {
                    const result = await hook(path, { id });
                    if (result === false) {
                        console.warn('⛔ Навигация отменена хуком');
                        return;
                    }
                } catch (error) {
                    console.error('❌ Ошибка в before хуке:', error);
                }
            }
            
            // Находим маршрут
            const route = this.routes[path];
            
            if (route) {
                this.currentRoute = path;
                
                // Проверяем авторизацию
                if (route.meta.requiresAuth && !window.app?.currentUser) {
                    console.warn('🔒 Требуется авторизация, перенаправляю на auth');
                    this.navigate('auth');
                    return;
                }
                
                // Обновляем заголовок
                document.title = `${route.meta.title} | Dream&Go`;
                
                try {
                    // Рендерим компонент
                    await route.component.render({ id, ...this.currentParams });
                    console.log(`✅ Маршрут отрендерен: ${path}`);
                } catch (error) {
                    console.error(`❌ Ошибка рендеринга маршрута ${path}:`, error);
                    this.renderErrorPage(path, error);
                }
                
                // Обновляем активный пункт меню
                this.updateActiveNav(path);
                
                // Выполняем after хуки
                for (const hook of this.afterHooks) {
                    try {
                        await hook(path, { id });
                    } catch (error) {
                        console.error('❌ Ошибка в after хуке:', error);
                    }
                }
            } else {
                console.warn(`❌ Маршрут не найден: ${path}`);
                console.log('📋 Доступные:', Object.keys(this.routes).join(', '));
                
                // Если маршрут не найден, показываем 404 или перенаправляем на home
                if (path !== 'home') {
                    console.log('🏠 Перенаправляю на home');
                    this.navigate('home');
                } else {
                    this.render404Page(path);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    // Обновление активного пункта в навигации
    updateActiveNav(path) {
        setTimeout(() => {
            document.querySelectorAll('.nav-link-premium').forEach(link => {
                const route = link.getAttribute('data-route');
                if (route === path) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        }, 50);
    }

    // Страница 404
    render404Page(path) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;
        
        mainContent.innerHTML = `
            <div class="container py-5 text-center">
                <div class="display-1 text-muted mb-3">404</div>
                <h2>Страница не найдена</h2>
                <p class="text-muted">Маршрут "${path}" не существует</p>
                <button class="btn btn-premium" onclick="window.app.router.navigate('home')">
                    <i class="bi bi-house me-2"></i>На главную
                </button>
            </div>
        `;
    }

    // Страница ошибки
    renderErrorPage(path, error) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;
        
        console.error(`Ошибка на странице ${path}:`, error);
        
        mainContent.innerHTML = `
            <div class="container py-5 text-center">
                <div class="display-1 text-danger mb-3">
                    <i class="bi bi-exclamation-triangle"></i>
                </div>
                <h2>Ошибка загрузки</h2>
                <p class="text-muted">Не удалось загрузить страницу "${path}"</p>
                <p class="text-muted small">${error.message || 'Неизвестная ошибка'}</p>
                <button class="btn btn-premium" onclick="window.app.router.navigate('home')">
                    <i class="bi bi-house me-2"></i>На главную
                </button>
                <button class="btn btn-outline-primary ms-2" onclick="location.reload()">
                    <i class="bi bi-arrow-clockwise me-2"></i>Обновить
                </button>
            </div>
        `;
    }

    // Хуки
    beforeEach(hook) {
        this.beforeHooks.push(hook);
    }

    afterEach(hook) {
        this.afterHooks.push(hook);
    }

    // Получить текущий маршрут
    getCurrentRoute() {
        return this.currentRoute;
    }

    // Получить параметры
    getParams() {
        return this.currentParams;
    }
}