export class Navigation {
    constructor(router) {
        this.router = router;
    }

    render() {
        const navHTML = `
            <nav class="navbar navbar-expand-lg navbar-premium fixed-top">
                <div class="container">
                    <a class="navbar-brand fw-bold" href="#home">
                        <i class="bi bi-rocket-takeoff text-primary me-2"></i>
                        Dream<span class="text-accent-warning">&</span>Go
                    </a>
                    
                    <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <i class="bi bi-list fs-4"></i>
                    </button>
                    
                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav me-auto mb-2 mb-lg-0" id="mainNav">
                            ${this.getNavItems()}
                        </ul>
                        
                        <div class="d-flex align-items-center gap-2">
                            ${this.getUserMenu()}
                        </div>
                    </div>
                </div>
            </nav>
            <div style="padding-top: 70px;"></div>
        `;

        setTimeout(() => this.attachEventListeners(), 0);

        return navHTML;
    }

    getNavItems() {
        const items = [
            { path: 'home', icon: 'bi-house-heart', label: 'Главная' },
            { path: 'travels', icon: 'bi-airplane', label: 'Путешествия' },
            { path: 'food', icon: 'bi-shop', label: 'Рестораны' },
            { path: 'movies', icon: 'bi-film', label: 'Кино' },
            { path: 'books', icon: 'bi-book', label: 'Книги' },
            { path: 'dreams', icon: 'bi-star', label: 'Мечты' },
            { path: 'friends', icon: 'bi-people', label: 'Друзья' },
            { path: 'chat', icon: 'bi-chat-dots', label: 'Чат' },
            { path: 'achievements', icon: 'bi-trophy', label: 'Ачивки' },
        ];

        return items.map(item => `
            <li class="nav-item">
                <a class="nav-link nav-link-premium" href="#${item.path}" data-route="${item.path}">
                    <i class="bi ${item.icon}"></i>
                    ${item.label}
                </a>
            </li>
        `).join('');
    }

    getUserMenu() {
        return `
        <button class="btn btn-icon theme-toggle" onclick="window.app.themeService.toggleTheme()" title="Переключить тему">
            <i id="themeIcon" class="bi bi-moon-fill"></i>
        </button>
        
        <button class="btn btn-icon" title="Поиск" onclick="window.app.openSearch()">
            <i class="bi bi-search"></i>
        </button>
        
        <div class="dropdown">
            <button class="btn btn-icon position-relative" data-bs-toggle="dropdown" data-bs-auto-close="outside" title="Уведомления">
                <i class="bi bi-bell" id="notificationsBell"></i>
                <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" 
                      id="notificationsBadge" style="font-size: 0.5rem; display: none;"></span>
            </button>
            <div class="dropdown-menu dropdown-menu-end p-0" style="width: 340px;" id="notificationsDropdown">
                <div class="text-center py-3 text-muted">
                    <span class="spinner-border spinner-border-sm"></span>
                </div>
            </div>
        </div>
        
        <div class="dropdown">
            <button class="btn btn-icon dropdown-toggle" type="button" data-bs-toggle="dropdown">
                <div class="avatar-circle" style="width: 32px; height: 32px; font-size: 14px;">
                    ${this.getUserInitials()}
                </div>
            </button>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-premium">
                <li>
                    <a class="dropdown-item" href="#profile">
                        <i class="bi bi-person me-2"></i>Мой профиль
                    </a>
                </li>
                <li>
                    <a class="dropdown-item" href="#settings">
                        <i class="bi bi-gear me-2"></i>Настройки
                    </a>
                </li>
                <li><hr class="dropdown-divider"></li>
                <li>
                    <a class="dropdown-item text-danger" href="#" id="logoutBtn">
                        <i class="bi bi-box-arrow-right me-2"></i>Выйти
                        </a>
                </li>
            </ul>
        </div>
    `;
    }

    getUserInitials() {
        const user = window.app?.currentUser;
        if (user?.email) {
            return user.email[0].toUpperCase();
        }
        return 'U';
    }

    attachEventListeners() {
        document.querySelectorAll('.nav-link-premium').forEach(link => {
            link.addEventListener('click', (e) => {
                setTimeout(() => {
                    const route = link.getAttribute('data-route');
                    this.router.updateActiveNav(route);
                }, 100);
            });
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.app.authService.signOut();
            });
        }

        document.querySelectorAll('.nav-link-premium').forEach(link => {
            link.addEventListener('click', () => {
                const navbarCollapse = document.getElementById('navbarNav');
                if (navbarCollapse && navbarCollapse.classList.contains('show')) {
                    const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
                    if (bsCollapse) bsCollapse.hide();
                }
            });
        });
    }
}