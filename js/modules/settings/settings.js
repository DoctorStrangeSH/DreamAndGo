import { ProfilePrivacyService } from '../../services/profile-privacy.service.js';

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

export class SettingsModule {
    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = window.app.ui.createLoader();

        const userData = window.app.userData;
        if (!userData || window.app.currentUser?.uid !== userId || !mainContent.isConnected) return;
        const privacy = userData.privacy || {};
        const visibilityOptions = (name, label, description) => `
            <div class="d-flex align-items-center justify-content-between gap-3 py-3 border-bottom">
                <div class="flex-grow-1">
                    <label class="form-label fw-semibold mb-1" for="privacy-${name}">${label}</label>
                    <div class="form-text">${description}</div>
                </div>
                <select class="form-select" style="max-width: 150px" id="privacy-${name}" name="${name}">
                    <option value="private" ${privacy[name] === 'public' ? '' : 'selected'}>Только я</option>
                    <option value="public" ${privacy[name] === 'public' ? 'selected' : ''}>Всем</option>
                </select>
            </div>`;

        mainContent.innerHTML = `
            <div class="container py-4 fade-in-up">
                <h2 class="fw-bold mb-4">
                    <i class="bi bi-gear text-primary me-2"></i>Настройки
                </h2>

                <div class="row g-4">
                    <div class="col-lg-8">
                        <div class="card-premium p-4 mb-4">
                            <h5 class="fw-bold mb-4">
                                <i class="bi bi-person me-2"></i>Профиль
                            </h5>
                            <form id="profileSettingsForm" data-settings-owner="${escapeHTML(userId)}">
                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Никнейм</label>
                                    <div class="input-group">
                                        <span class="input-group-text">@</span>
                                        <input type="text" class="form-control" name="username" 
                                               value="${escapeHTML(userData.username)}" 
                                               minlength="3" maxlength="20" required>
                                    </div>
                                    <div class="form-text">От 3 до 20 символов, только буквы, цифры и _</div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Имя</label>
                                    <input type="text" class="form-control" name="displayName" 
                                           value="${escapeHTML(userData.displayName)}" 
                                           placeholder="Как тебя зовут?">
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">О себе</label>
                                    <textarea class="form-control" name="bio" rows="3" 
                                              placeholder="Расскажи о себе...">${escapeHTML(userData.bio)}</textarea>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Город</label>
                                    <input type="text" class="form-control" name="location" 
                                           value="${escapeHTML(userData.location)}" 
                                           placeholder="Твой город">
                                </div>

                                <button type="submit" class="btn btn-premium">
                                    <i class="bi bi-check-lg me-2"></i>Сохранить
                                </button>
                            </form>
                        </div>

                        <div class="card-premium p-4 mb-4">
                            <div class="d-flex align-items-start gap-3 mb-2">
                                <div class="rounded-3 bg-primary bg-opacity-10 text-primary p-3"><i class="bi bi-shield-lock fs-4"></i></div>
                                <div>
                                    <h5 class="fw-bold mb-1">Приватность профиля</h5>
                                    <p class="text-muted small mb-0">Решай сам, что увидят другие пользователи. Публичная страница выключена по умолчанию; категории настраиваются отдельно.</p>
                                </div>
                            </div>
                            <form id="profilePrivacyForm" data-settings-owner="${escapeHTML(userId)}">
                                ${visibilityOptions('profile', 'Публичная страница', 'Если выключить, твой профиль не будет доступен другим пользователям.')}
                                <div class="pt-2">
                                    <div class="fw-semibold small mb-1">Что показывать на публичной странице</div>
                                    ${visibilityOptions('travels', 'Путешествия', 'Количество добавленных путешествий.')}
                                    ${visibilityOptions('food', 'Рестораны', 'Количество сохранённых ресторанов.')}
                                    ${visibilityOptions('movies', 'Фильмы', 'Количество просмотренных фильмов.')}
                                    ${visibilityOptions('books', 'Книги', 'Количество прочитанных книг.')}
                                    ${visibilityOptions('dreams', 'Мечты', 'Количество записанных мечт.')}
                                </div>
                                <div class="alert alert-info small mt-3 mb-3">
                                    <i class="bi bi-info-circle me-1"></i>
                                    Публикуются только выбранные поля. Email, история входов, друзья и личные настройки не публикуются.
                                </div>
                                <div class="d-flex flex-wrap align-items-center gap-3">
                                    <button type="submit" class="btn btn-premium" ${!window.app.profilePrivacyService?.isReady ? 'disabled' : ''}>
                                        <i class="bi bi-shield-check me-2"></i>Сохранить приватность
                                    </button>
                                    <span class="small ${window.app.profilePrivacyService?.isReady ? 'text-success' : 'text-warning'}">
                                        ${window.app.profilePrivacyService?.isReady ? 'Защищённое соединение готово' : 'Требуется настроить App Check'}
                                    </span>
                                </div>
                            </form>
                        </div>

                        <div class="card-premium p-4 mb-4">
                            <h5 class="fw-bold mb-4">
                                <i class="bi bi-palette me-2"></i>Оформление
                            </h5>
                            <div class="mb-3">
                                <label class="form-label fw-semibold">Тема</label>
                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-outline-primary theme-btn active" data-theme="light">
                                        <i class="bi bi-sun me-1"></i>Светлая
                                    </button>
                                    <button type="button" class="btn btn-outline-primary theme-btn" data-theme="dark">
                                        <i class="bi bi-moon me-1"></i>Тёмная
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="card-premium p-4">
                            <h5 class="fw-bold mb-3">
                                <i class="bi bi-download me-2"></i>Экспорт данных
                            </h5>
                            <p class="text-muted small mb-3">Скачай все свои данные в JSON формате для резервной копии</p>
                            <button class="btn btn-outline-primary" id="exportDataBtn">
                                <i class="bi bi-download me-2"></i>Скачать данные
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('profileSettingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveSettings(e.target);
        });

        document.getElementById('profilePrivacyForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.savePrivacySettings(e.target);
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const theme = btn.dataset.theme;
                window.app.themeService.setTheme(theme);
                window.app.ui.showToast(`Тема изменена на ${theme === 'dark' ? 'тёмную' : 'светлую'}`, 'info');
            });
        });

        document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('exportDataBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Экспорт...';

            const success = await window.app.exportService.exportAndDownload(window.app.currentUser.uid);

            if (success) {
                window.app.ui.showToast('Данные скачаны! 📦', 'success');
            } else {
                window.app.ui.showToast('Ошибка экспорта', 'error');
            }

            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-download me-2"></i>Скачать данные';
        });
    }


    async savePrivacySettings(form) {
        const uid = window.app.currentUser?.uid;
        if (!uid || !form?.isConnected || form.dataset.settingsOwner !== uid) return;
        const visibility = Object.fromEntries(
            ['profile', 'travels', 'food', 'movies', 'books', 'dreams']
                .map(key => [key, form.elements.namedItem(key)?.value])
        );
        if (Object.values(visibility).some(value => value !== 'public' && value !== 'private')) {
            window.app.ui.showToast('Проверь настройки приватности', 'warning');
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
        try {
            const result = await window.app.profilePrivacyService.updateVisibility(visibility);
            if (window.app.currentUser?.uid !== uid || !form.isConnected) return;
            window.app.userData = { ...window.app.userData, privacy: visibility };
            window.app.ui.showToast(
                result.publicProfilePublished
                    ? 'Приватность сохранена. Публичный профиль обновлён.'
                    : 'Профиль закрыт. Публичная страница удалена.',
                'success'
            );
        } catch (error) {
            console.error('Ошибка сохранения приватности:', error);
            if (window.app.currentUser?.uid === uid && form.isConnected) {
                const message = error.code === 'app-check/not-configured'
                    ? 'Сначала настрой App Check в Firebase Console.'
                    : 'Не удалось сохранить настройки. Попробуй позже.';
                window.app.ui.showToast(message, 'warning');
            }
        } finally {
            if (form.isConnected) {
                button.disabled = false;
                button.innerHTML = original;
            }
        }
    }

    async saveSettings(form) {
        const uid = window.app.currentUser?.uid;
        if (!uid || !form?.isConnected || form.dataset.settingsOwner !== uid) return;

        const formData = new FormData(form);
        const username = formData.get('username').trim();
        const displayName = formData.get('displayName').trim();
        const bio = formData.get('bio').trim();
        const location = formData.get('location').trim();

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            window.app.ui.showToast('Никнейм: от 3 до 20 символов (буквы, цифры, _)', 'warning');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
        submitBtn.disabled = true;

        try {
            if (window.app.currentUser?.uid !== uid) return;
            const currentUser = window.app.userData;

            const result = await window.app.profileAccountService.updateMyProfile({
                username,
                displayName,
                bio,
                location
            });

            if (window.app.currentUser?.uid !== uid || !form.isConnected) return;
            window.app.userData = {
                ...window.app.userData,
                username: result.username,
                usernameNormalized: result.usernameNormalized,
                displayName: result.displayName,
                bio: result.bio,
                location: result.location
            };
            window.app.ui.showToast(
                result.publicProfileUpdated
                    ? 'Профиль сохранён и публичная страница обновлена! ✨'
                    : 'Профиль сохранён! ✨',
                'success'
            );
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            if (window.app.currentUser?.uid === uid && form.isConnected) {
                const message = error.code === 'functions/already-exists'
                    ? 'Этот никнейм уже занят 😔'
                    : error.code === 'functions/failed-precondition'
                        ? 'Смена никнейма пока недоступна: завершается безопасная миграция.'
                        : error.code === 'app-check/not-configured'
                            ? 'Сначала настрой App Check в Firebase Console.'
                            : 'Ошибка сохранения';
                window.app.ui.showToast(message, 'error');
            }
        } finally {
            if (form.isConnected) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    }
}