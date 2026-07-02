export class ThemeService {
    constructor() {
        this.themeKey = 'dreamandgo-theme';
    }

    init() {
        const savedTheme = localStorage.getItem(this.themeKey) || 'light';
        this.setTheme(savedTheme);
        this.addThemeToggle();
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-bs-theme', theme);
        localStorage.setItem(this.themeKey, theme);
        this.updateThemeIcon(theme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    updateThemeIcon(theme) {
        const icon = document.getElementById('themeIcon');
        if (icon) {
            icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
        }
    }

    addThemeToggle() {
        // Добавляем кнопку переключения темы в интерфейс
        const themeToggle = `
            <button class="btn btn-icon theme-toggle" onclick="app.themeService.toggleTheme()">
                <i id="themeIcon" class="bi bi-moon-fill"></i>
            </button>
        `;
        // Вставка в DOM будет происходить после рендеринга
    }
}