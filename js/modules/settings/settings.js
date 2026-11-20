import { db } from '../../config/firebase.js';
import { escapeHTML } from '../../core/escape-html.js';
import { validateProfileSettings } from '../../core/profile-settings-policy.js';
import { setPublicProfileVisibility } from '../../services/public-profile-callable.service.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class SettingsModule {
    constructor() { this.requestId = 0; }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        const requestId = ++this.requestId;
        mainContent.innerHTML = `<div data-settings-request="${requestId}">${window.app.ui.createLoader()}</div>`;
        const isCurrent = () => requestId === this.requestId && window.app.currentUser?.uid === userId &&
            mainContent.isConnected !== false && !!mainContent.querySelector(`[data-settings-request="${requestId}"]`);

        let userDoc;
        try {
            const userRef = doc(db, 'users', userId);
            userDoc = await getDoc(userRef);
        } catch (error) {
            console.error('Не удалось загрузить настройки:', error);
            if (!isCurrent()) return;
            mainContent.innerHTML = `<section class="atlas-empty" role="alert">
                <h2>Не удалось загрузить настройки</h2>
                <p>Проверь подключение и попробуй снова. Изменения не вносились.</p>
                <button type="button" class="btn btn-premium" data-retry-settings>Повторить</button>
            </section>`;
            mainContent.querySelector('[data-retry-settings]')?.addEventListener('click', () => this.render());
            return;
        }
        if (!isCurrent()) return;
        const userData = userDoc.exists() ? userDoc.data() : {};

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
                                               value="${escapeHTML(userData.username || '')}" 
                                               minlength="3" maxlength="20" readonly required>
                                    </div>
                                    <div class="form-text">Смена никнейма временно закрыта до запуска безопасной проверки уникальности.</div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Имя</label>
                                    <input type="text" class="form-control" name="displayName" 
                                           value="${escapeHTML(userData.displayName || '')}" 
                                           placeholder="Как тебя зовут?">
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">О себе</label>
                                    <textarea class="form-control" name="bio" rows="3" 
                                              placeholder="Расскажи о себе...">${escapeHTML(userData.bio || '')}</textarea>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Город</label>
                                    <input type="text" class="form-control" name="location" 
                                           value="${escapeHTML(userData.location || '')}" 
                                           placeholder="Твой город">
                                </div>

                                <button type="submit" class="btn btn-premium">
                                    <i class="bi bi-check-lg me-2"></i>Сохранить
                                </button>
                            </form>
                        </div>

                        <div class="card-premium p-4 mb-4">
                            <h5 class="fw-bold mb-3">
                                <i class="bi bi-shield-lock me-2"></i>Приватность профиля
                            </h5>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch"
                                       id="publicProfileEnabled"
                                       ${userData.publicProfileEnabled === true ? 'checked' : ''}>
                                <label class="form-check-label fw-semibold" for="publicProfileEnabled">
                                    Публичный профиль
                                </label>
                            </div>
                            <p class="form-text mt-2 mb-1">
                                Если включено, другие пользователи смогут найти тебя по никнейму и увидеть имя,
                                аватар, описание и общую статистику. Email, город, личные записи и настройки не публикуются.
                            </p>
                            <p class="small text-muted mb-0" id="publicProfileVisibilityStatus" aria-live="polite">
                                ${userData.publicProfileEnabled === true ? 'Профиль отмечен как публичный.' : 'Сейчас профиль приватный.'}
                            </p>
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

        const visibilityToggle = document.getElementById('publicProfileEnabled');
        visibilityToggle?.addEventListener('change', async () => {
            const uid = window.app.currentUser?.uid;
            if (!uid || uid !== userId || !visibilityToggle.isConnected || visibilityToggle.disabled) return;
            const requested = visibilityToggle.checked;
            const status = document.getElementById('publicProfileVisibilityStatus');
            visibilityToggle.disabled = true;
            if (status) status.textContent = 'Сохраняем настройку...';
            try {
                const enabled = await setPublicProfileVisibility(requested);
                if (window.app.currentUser?.uid !== uid || !visibilityToggle.isConnected) return;
                visibilityToggle.checked = enabled;
                window.app.userData = { ...window.app.userData, publicProfileEnabled: enabled };
                if (status) status.textContent = enabled
                    ? 'Публичный профиль включён.'
                    : 'Профиль теперь приватный.';
                window.app.ui.showToast(enabled ? 'Публичный профиль включён' : 'Профиль скрыт', 'success');
            } catch (error) {
                console.error('Не удалось изменить видимость профиля:', error);
                if (window.app.currentUser?.uid === uid && visibilityToggle.isConnected) {
                    visibilityToggle.checked = !requested;
                    if (status) status.textContent = error?.code === 'functions/failed-precondition'
                        ? 'Включение станет доступно после безопасной миграции никнеймов.'
                        : 'Не удалось сохранить настройку. Попробуй ещё раз.';
                    window.app.ui.showToast(status?.textContent || 'Ошибка настройки приватности', 'warning');
                }
            } finally {
                if (visibilityToggle.isConnected) visibilityToggle.disabled = false;
            }
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
            const uid = window.app.currentUser?.uid;
            if (!uid || uid !== userId || !btn || btn.disabled) return;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Экспорт...';
            try {
                const success = await window.app.exportService.exportAndDownload(uid);
                if (window.app.currentUser?.uid !== uid || !btn.isConnected) return;
                window.app.ui.showToast(success ? 'Данные скачаны! 📦' : 'Ошибка экспорта', success ? 'success' : 'error');
            } catch (error) {
                console.error('Ошибка экспорта:', error);
                if (window.app.currentUser?.uid === uid && btn.isConnected) window.app.ui.showToast('Ошибка экспорта', 'error');
            } finally {
                if (btn.isConnected) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-download me-2"></i>Скачать данные';
                }
            }
        });
    }

    async saveSettings(form) {
        const uid = window.app.currentUser?.uid;
        if (!uid || !form.isConnected || form.dataset.settingsOwner !== uid) return;
        const formData = new FormData(form);
        const username = formData.get('username').trim();
        const displayName = formData.get('displayName').trim();
        const bio = formData.get('bio').trim();
        const location = formData.get('location').trim();

        let settings;
        try {
            settings = validateProfileSettings(
                { username, displayName, bio, location },
                window.app.userData?.username
            );
        } catch (error) {
            window.app.ui.showToast(error.message, 'warning');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
        submitBtn.disabled = true;

        try {
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, settings);
            if (window.app.currentUser?.uid !== uid || !form.isConnected) return;
            window.app.userData = { ...window.app.userData, ...settings };
            window.app.ui.showToast('Настройки сохранены! ✨', 'success');
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            if (window.app.currentUser?.uid === uid && form.isConnected) window.app.ui.showToast('Ошибка сохранения', 'error');
        } finally {
            if (form.isConnected) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    }
}
