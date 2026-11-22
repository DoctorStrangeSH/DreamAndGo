import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    deleteUser,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { completeSignupV2 } from '../core/signup-v2-flow.js';

export class AuthService {
    constructor(auth, signupV2Service = null, profileAccountService = null) {
        this.auth = auth;
        this.signupV2Service = signupV2Service;
        this.profileAccountService = profileAccountService;
        this.isSignupInProgress = false;
    }

    onAuthChange(callback) {
        return onAuthStateChanged(this.auth, user => {
            callback(user);
        }, error => {
            console.error('Ошибка отслеживания авторизации:', error);
            callback(null);
        });
    }

    async signInWithEmail(email, password) {
        try {
            const result = await signInWithEmailAndPassword(this.auth, email.trim(), password);
            return { success: true, user: result.user };
        } catch (error) {
            console.error('Ошибка входа:', error.code, error.message);
            return {
                success: false,
                code: error.code,
                error: this.getErrorMessage(error.code)
            };
        }
    }

    getSignupStatus() {
        return this.signupV2Service?.signupStatus || {
            available: false,
            message: 'Новая регистрация пока недоступна.'
        };
    }

    async signUpWithEmail(email, password, username) {
        if (!this.signupV2Service?.canStartNewSignup) {
            const status = this.getSignupStatus();
            return {
                success: false,
                code: 'signup-v2/disabled',
                error: status.message || 'Новая регистрация пока недоступна.'
            };
        }

        this.isSignupInProgress = true;
        try {
            return await completeSignupV2({
                email,
                password,
                username,
                createAuthUser: async (normalizedEmail, rawPassword) => {
                    const credential = await createUserWithEmailAndPassword(
                        this.auth,
                        normalizedEmail,
                        rawPassword
                    );
                    return credential.user;
                },
                registerProfile: value => this.signupV2Service.registerProfile(value),
                getRegistrationState: () => this.signupV2Service.getRegistrationState(),
                deleteAuthUser: account => deleteUser(account),
                signOutAuth: () => signOut(this.auth)
            });
        } finally {
            this.isSignupInProgress = false;
        }
    }

    async getRegistrationState() {
        if (!this.signupV2Service?.isTransportReady) {
            return {
                success: false,
                error: 'Проверка регистрации временно недоступна.'
            };
        }
        try {
            const state = await this.signupV2Service.getRegistrationState();
            return { success: true, ...state };
        } catch (error) {
            console.error('Не удалось проверить состояние регистрации:', error);
            return {
                success: false,
                code: error.code,
                error: 'Не удалось проверить состояние аккаунта. Попробуйте позже.'
            };
        }
    }

    async completeProfileRecovery(username) {
        if (!this.auth.currentUser || !this.signupV2Service?.isTransportReady) {
            return {
                success: false,
                error: 'Восстановление профиля сейчас недоступно. Попробуйте позже.'
            };
        }

        try {
            await this.signupV2Service.registerProfile(username);
            const state = await this.signupV2Service.getRegistrationState();
            if (state.status !== 'complete') {
                return {
                    success: false,
                    error: 'Профиль пока не подтверждён сервером. Попробуйте ещё раз позже.'
                };
            }
            return { success: true, user: this.auth.currentUser, recovered: true };
        } catch (error) {
            try {
                const state = await this.signupV2Service.getRegistrationState();
                if (state.status === 'complete') {
                    return { success: true, user: this.auth.currentUser, recovered: true };
                }
            } catch {
                // Preserve the account and surface a retryable recovery error.
            }
            const messages = {
                'functions/already-exists': 'Этот никнейм уже занят. Попробуйте другой.',
                'functions/invalid-argument': 'Проверьте никнейм: от 3 до 20 латинских букв, цифр или _.',
                'functions/failed-precondition': 'Восстановление временно недоступно до завершения безопасной миграции.',
                'app-check/not-configured': 'Защищённая проверка аккаунта пока не настроена.'
            };
            return {
                success: false,
                code: error.code,
                error: messages[error.code] || 'Не удалось восстановить профиль. Аккаунт сохранён — повторная регистрация не нужна.'
            };
        }
    }

    async signOut() {
        try {
            await signOut(this.auth);
            return { success: true };
        } catch (error) {
            console.error('Ошибка выхода:', error);
            return { success: false, error: 'Не удалось выйти' };
        }
    }

    async getUserData(uid) {
        try {
            if (!uid || uid !== this.auth.currentUser?.uid || !this.profileAccountService) {
                return { success: false, error: 'Профиль недоступен' };
            }
            const data = await this.profileAccountService.getMyProfile();
            return { success: true, data };
        } catch (error) {
            console.error('Ошибка получения данных:', error);
            return { success: false, error: 'Ошибка загрузки данных' };
        }
    }

    getErrorMessage(code) {
        const errors = {
            'auth/invalid-email': 'Неверный формат email 📧',
            'auth/user-disabled': 'Аккаунт отключён администратором',
            'auth/user-not-found': 'Пользователь с таким email не найден',
            'auth/wrong-password': 'Неверный пароль 🔒',
            'auth/email-already-in-use': 'Этот email уже зарегистрирован',
            'auth/weak-password': 'Пароль должен быть минимум 6 символов',
            'auth/invalid-credential': 'Неверный email или пароль',
            'auth/too-many-requests': 'Слишком много попыток. Подождите немного ⏳',
            'auth/network-request-failed': 'Проблемы с интернетом 🌐',
            'auth/internal-error': 'Техническая ошибка. Попробуйте позже'
        };
        return errors[code] || 'Не удалось выполнить запрос. Попробуйте ещё раз.';
    }
}
