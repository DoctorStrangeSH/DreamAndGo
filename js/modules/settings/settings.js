import { db } from '../../config/firebase.js';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (window.app.currentUser?.uid !== userId || !mainContent.isConnected) return;
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

            if (username !== currentUser?.username) {
                const usersRef = collection(db, 'users');
                const normalized = username.trim().toLowerCase();
                const [indexed, legacy] = await Promise.all([
                    getDocs(query(usersRef, where('usernameNormalized', '==', normalized), limit(2))),
                    getDocs(query(usersRef, where('username', '==', username.trim()), limit(2)))
                ]);
                const isTakenByAnotherUser = [...indexed.docs, ...legacy.docs]
                    .some(userDoc => userDoc.id !== uid);

                if (isTakenByAnotherUser) {
                    window.app.ui.showToast('Этот ник уже занят 😔', 'warning');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, {
                username: username,
                usernameNormalized: username.trim().toLowerCase(),
                displayName: displayName,
                bio: bio,
                location: location
            });

            if (window.app.currentUser?.uid !== uid || !form.isConnected) return;
            window.app.userData = { ...window.app.userData, username, displayName, bio, location };
            window.app.ui.showToast('Настройки сохранены! ✨', 'success');
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            if (window.app.currentUser?.uid === uid && form.isConnected) {
                window.app.ui.showToast('Ошибка сохранения', 'error');
            }
        } finally {
            if (form.isConnected) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    }
}