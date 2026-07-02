import { auth, db } from '../../config/firebase.js';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ProfileModule {
    constructor() {
        this.currentTab = 'overview';
    }

    async render(params = {}) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const currentUserId = window.app.currentUser?.uid;

        // Если id похож на uid (длинный) — используем его, иначе — текущего пользователя
        const userId = (params.id && params.id.length > 20) ? params.id : currentUserId;

        const isOwnProfile = userId === currentUserId;

        mainContent.innerHTML = window.app.ui.createLoader();

        const userData = await this.loadUserProfile(userId);

        if (!userData) {
            mainContent.innerHTML = window.app.ui.createEmptyState({
                icon: 'bi-person-x',
                title: 'Профиль не найден',
                description: 'Пользователь не существует или был удалён'
            });
            return;
        }

        mainContent.innerHTML = this.getProfileTemplate(userData, isOwnProfile);
        this.initTabs(userId, isOwnProfile);
        await this.loadTabContent(this.currentTab, userData);
    }

    getProfileTemplate(userData, isOwnProfile) {
        const coverGradient = this.getRandomGradient();

        return `
            <div class="profile-page fade-in-up">
                <div class="profile-cover" style="background: ${coverGradient}">
                    <div class="profile-cover-overlay"></div>
                </div>

                <div class="container">
                    <div class="profile-header">
                        <div class="profile-avatar-wrapper">
                            <div class="profile-avatar">
                                ${userData.avatar
                ? `<img src="${userData.avatar}" alt="Аватар">`
                : `<span class="profile-avatar-text">${(userData.username || 'U')[0].toUpperCase()}</span>`
            }
                            </div>
                        </div>

                        <div class="profile-info">
                            <h2 class="profile-username mb-0">@${userData.username || 'user'}</h2>
                            ${userData.displayName ? `<span class="profile-display-name">${userData.displayName}</span>` : ''}
                            <p class="profile-bio text-muted mb-3">${userData.bio || 'Пока нет описания...'}</p>

                            <div class="profile-stats">
                                <div class="profile-stat"><strong>${userData.stats?.travels || 0}</strong><span>путешествий</span></div>
                                <div class="profile-stat"><strong>${userData.stats?.movies || 0}</strong><span>фильмов</span></div>
                                <div class="profile-stat"><strong>${userData.stats?.books || 0}</strong><span>книг</span></div>
                                <div class="profile-stat"><strong>${userData.stats?.friends || 0}</strong><span>друзей</span></div>
                            </div>
                        </div>
                    </div>

                    <ul class="nav nav-tabs profile-tabs mt-4">
                        <li class="nav-item"><button class="nav-link ${this.currentTab === 'overview' ? 'active' : ''}" data-tab="overview"><i class="bi bi-grid me-2"></i>Обзор</button></li>
                        <li class="nav-item"><button class="nav-link" data-tab="travels"><i class="bi bi-airplane me-2"></i>Путешествия</button></li>
                        <li class="nav-item"><button class="nav-link" data-tab="movies"><i class="bi bi-film me-2"></i>Кино</button></li>
                        <li class="nav-item"><button class="nav-link" data-tab="books"><i class="bi bi-book me-2"></i>Книги</button></li>
                        <li class="nav-item"><button class="nav-link" data-tab="dreams"><i class="bi bi-star me-2"></i>Мечты</button></li>
                        ${isOwnProfile ? `<li class="nav-item ms-auto"><button class="nav-link" data-tab="settings"><i class="bi bi-gear me-2"></i>Настройки</button></li>` : ''}
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
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
        ];
        return gradients[Math.floor(Math.random() * gradients.length)];
    }

    initTabs(userId, isOwnProfile) {
        document.querySelectorAll('.profile-tabs .nav-link').forEach(tab => {
            tab.addEventListener('click', async (e) => {
                e.preventDefault();
                document.querySelectorAll('.profile-tabs .nav-link').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;

                const userData = await this.loadUserProfile(userId);
                if (userData) {
                    await this.loadTabContent(this.currentTab, userData);
                }
            });
        });

        document.addEventListener('submit', async (e) => {
            if (e.target.id === 'profileSettingsForm') {
                e.preventDefault();
                await this.saveProfileSettings(e.target);
            }
        });
    }

    async loadTabContent(tab, userData) {
        const container = document.getElementById('profileTabContent');
        if (!container) return;

        switch (tab) {
            case 'overview': container.innerHTML = this.getOverviewContent(userData); break;
            case 'settings': container.innerHTML = this.getSettingsContent(userData); break;
            default: container.innerHTML = this.getPlaceholder(tab); break;
        }
    }

    getOverviewContent(userData) {
        return `
            <div class="card-premium p-4">
                <h5 class="fw-bold mb-3"><i class="bi bi-trophy text-warning me-2"></i>Достижения</h5>
                <div class="text-center py-4">
                    <i class="bi bi-trophy text-muted display-4"></i>
                    <p class="text-muted mt-2">Пока нет достижений</p>
                </div>
            </div>
        `;
    }

    getPlaceholder(tab) {
        const names = { travels: 'путешествий', movies: 'фильмов', books: 'книг', dreams: 'мечт' };
        const icons = { travels: 'airplane', movies: 'film', books: 'book', dreams: 'star' };
        return window.app.ui.createEmptyState({
            icon: `bi-${icons[tab] || 'question'}`,
            title: `Нет ${names[tab] || 'данных'}`,
            description: 'Здесь пока ничего нет'
        });
    }

    getSettingsContent(userData) {
        return `
            <div class="row">
                <div class="col-lg-8">
                    <div class="card-premium p-4">
                        <h5 class="fw-bold mb-4">Настройки профиля</h5>
                        <form id="profileSettingsForm">
                            <div class="mb-3">
                                <label class="form-label fw-semibold">Никнейм</label>
                                <div class="input-group">
                                    <span class="input-group-text">@</span>
                                    <input type="text" class="form-control" name="username" value="${userData.username || ''}" minlength="3" maxlength="20" required>
                                </div>
                                <div class="form-text">От 3 до 20 символов, только буквы, цифры и _</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-semibold">Имя</label>
                                <input type="text" class="form-control" name="displayName" value="${userData.displayName || ''}" placeholder="Как тебя зовут?">
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-semibold">О себе</label>
                                <textarea class="form-control" name="bio" rows="3" placeholder="Расскажи о себе...">${userData.bio || ''}</textarea>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-semibold">Город</label>
                                <input type="text" class="form-control" name="location" value="${userData.location || ''}" placeholder="Твой город">
                            </div>
                            <button type="submit" class="btn btn-premium"><i class="bi bi-check-lg me-2"></i>Сохранить настройки</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    async saveProfileSettings(form) {
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
            if (username !== window.app.userData?.username) {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where('username', '==', username.toLowerCase()));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    window.app.ui.showToast('Этот ник уже занят 😔', 'warning');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            await updateDoc(doc(db, 'users', window.app.currentUser.uid), { username, displayName, bio, location });
            window.app.userData = { ...window.app.userData, username, displayName, bio, location };
            window.app.ui.showToast('Профиль обновлён! ✨', 'success');
        } catch (error) {
            window.app.ui.showToast('Ошибка сохранения', 'error');
        }

        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }

    async loadUserProfile(userId) {
        console.log('loadUserProfile вызван, userId:', userId);

        try {
            if (!userId) {
                console.log('userId пустой');
                return null;
            }

            const userRef = doc(db, 'users', userId);
            console.log('Запрашиваю документ users/' + userId);

            const userDoc = await getDoc(userRef);
            console.log('Документ существует:', userDoc.exists());

            if (!userDoc.exists()) {
                console.log('Документ не найден в Firestore');
                return null;
            }

            const data = userDoc.data();
            console.log('Данные получены:', Object.keys(data));
            console.log('username:', data.username);

            // Если нет username — восстанавливаем
            if (!data.username) {
                console.log('username отсутствует, восстанавливаю...');
                const email = window.app.currentUser?.email || 'user';
                const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);

                const defaultData = {
                    username: username,
                    displayName: '',
                    bio: '',
                    location: '',
                    avatar: null,
                    stats: data.stats || {},
                    achievements: [],
                    privacy: { travels: 'public', food: 'public', movies: 'public', books: 'public', dreams: 'public' }
                };

                await updateDoc(userRef, defaultData);
                console.log('Данные восстановлены');
                return defaultData;
            }

            return data;
        } catch (error) {
            console.error('Ошибка в loadUserProfile:', error);
            return null;
        }
    }
}