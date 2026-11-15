import { app } from '../config/firebase.js';
import { completeSignupV2 } from '../core/signup-v2-flow.js';
import { canUseSignupV2 } from '../core/signup-v2-policy.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { normalizeUsername } from '../core/username.js';
import { 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    deleteUser,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    doc,
    setDoc,
    getDoc,
    query,
    collection,
    where,
    getDocs,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class AuthService {
    constructor(auth, db, signupV2Rollout = { enabled: false }) {
        this.auth = auth;
        this.db = db;
        this.signupV2Rollout = signupV2Rollout;
    }

    // Отслеживание состояния авторизации
    onAuthChange(callback) {
        return onAuthStateChanged(this.auth, (user) => {
            console.log('🔄 Состояние авторизации изменилось:', user ? 'Вошёл' : 'Вышел');
            callback(user);
        }, (error) => {
            console.error('❌ Ошибка отслеживания авторизации:', error);
            callback(null);
        });
    }

    // Вход по email
    async signInWithEmail(email, password) {
        try {
            console.log('🔑 Попытка входа:', email);
            const result = await signInWithEmailAndPassword(this.auth, email, password);
            console.log('✅ Успешный вход');
            
            // Обновляем время последнего входа
            // Legacy merge writes would create an empty users/{uid} for an
            // Auth-only account and permanently block signup recovery.
            if (this.signupV2Rollout?.enabled !== true) {
                await this.updateLastLogin(result.user.uid);
            }
            
            return { success: true, user: result.user };
        } catch (error) {
            console.error('❌ Ошибка входа:', error.code, error.message);
            return { 
                success: false, 
                error: this.getErrorMessage(error.code),
                code: error.code 
            };
        }
    }

    // Candidate server-backed signup, unreachable unless explicitly opted in.
    async signUpWithEmailV2(email, password, username) {
        if (!canUseSignupV2(this.signupV2Rollout)) {
            return { success: false, error: 'Регистрация временно недоступна до проверки безопасности.' };
        }
        const register = httpsCallable(getFunctions(app, 'europe-west3'), 'registerProfileV2');
        return completeSignupV2({
            email, password, username,
            createAuthUser: async (newEmail, newPassword) =>
                (await createUserWithEmailAndPassword(this.auth, newEmail, newPassword)).user,
            registerProfile: async newUsername => register({ username: newUsername }),
            deleteAuthUser: async user => deleteUser(user),
            signOutAuth: async () => signOut(this.auth)
        });
    }

    // Candidate-only recovery after logging in to an Auth-only account.
    // The backend reveals only own-account status, never private fields.
    async getRegistrationStateV2() {
        if (!canUseSignupV2(this.signupV2Rollout) || !this.auth.currentUser) {
            return { success: false, status: 'temporarily-unavailable' };
        }
        try {
            const call = httpsCallable(getFunctions(app, 'europe-west3'), 'getRegistrationStateV2');
            const result = await call({});
            const status = result.data?.status;
            if (!['complete', 'needs-profile', 'temporarily-unavailable'].includes(status)) {
                return { success: false, status: 'temporarily-unavailable' };
            }
            return { success: true, status };
        } catch {
            return { success: false, status: 'temporarily-unavailable' };
        }
    }

    async recoverRegistrationV2(username) {
        if (!canUseSignupV2(this.signupV2Rollout) || !this.auth.currentUser) {
            return { success: false, error: 'Восстановление временно недоступно.' };
        }
        try {
            const call = httpsCallable(getFunctions(app, 'europe-west3'), 'registerProfileV2');
            const response = await call({ username });
            return { success: true, recovered: response.data?.recovered === true };
        } catch (error) {
            return {
                success: false, code: error?.code,
                error: 'Не удалось завершить профиль. Проверь никнейм или попробуй позднее.'
            };
        }
    }

    // Регистрация
    async signUpWithEmail(email, password, username) {
        if (this.signupV2Rollout?.enabled === true) {
            return this.signUpWithEmailV2(email, password, username);
        }
        try {
            console.log('📝 Попытка регистрации:', email, username);
            
            // Проверяем уникальность ника
            const isUnique = await this.checkUsernameUnique(username);
            if (isUnique === null) {
                return { success: false, error: 'Не удалось проверить никнейм. Проверь подключение и попробуй ещё раз.' };
            }
            if (!isUnique) {
                console.warn('⚠️ Ник уже занят:', username);
                return { success: false, error: 'Этот ник уже занят 😔 Придумай другой!' };
            }

            // Создаём аккаунт
            const result = await createUserWithEmailAndPassword(this.auth, email, password);
            console.log('✅ Аккаунт создан');
            
            // Создаём профиль пользователя в Firestore
            try {
                await this.createUserProfile(result.user.uid, {
                email: email,
                username: username,
                usernameNormalized: normalizeUsername(username),
                displayName: username,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
                avatar: null,
                bio: '',
                location: '',
                website: '',
                stats: {
                    travels: 0,
                    restaurants: 0,
                    movies: 0,
                    books: 0,
                    dreams: 0,
                    friends: 0
                },
                achievements: [],
                friends: [],
                privacy: {
                    travels: 'public',
                    food: 'public',
                    movies: 'public',
                    books: 'public',
                    dreams: 'public'
                },
                preferences: {
                    theme: 'light',
                    language: 'ru'
                }
                });
            } catch (profileError) {
                console.error("Не удалось создать профиль после регистрации:", profileError);
                let rollbackFailed = false;
                try {
                    // Откатываем только что созданный пустой аккаунт.
                    await deleteUser(result.user);
                } catch (cleanupError) {
                    rollbackFailed = true;
                    console.error("Не удалось откатить незавершённую регистрацию:", cleanupError);
                    try { await signOut(this.auth); } catch (signOutError) { console.error(signOutError); }
                }
                return {
                    success: false,
                    error: rollbackFailed
                        ? "Аккаунт создан, но профиль не сохранился. Не регистрируйся повторно с этим email: требуется восстановление профиля."
                        : "Не удалось сохранить профиль. Попробуй зарегистрироваться ещё раз."
                };
            }

            return { success: true, user: result.user };
        } catch (error) {
            console.error('❌ Ошибка регистрации:', error.code, error.message);
            return { 
                success: false, 
                error: this.getErrorMessage(error.code),
                code: error.code 
            };
        }
    }

    // Выход
    async signOut() {
        try {
            console.log('👋 Выход из аккаунта');
            await signOut(this.auth);
            return { success: true };
        } catch (error) {
            console.error('❌ Ошибка выхода:', error);
            return { success: false, error: 'Не удалось выйти' };
        }
    }

    // Проверка уникальности ника
    async checkUsernameUnique(username) {
        try {
            const usersRef = collection(this.db, 'users');
            const normalized = normalizeUsername(username);
            const [indexed, legacy] = await Promise.all([
                getDocs(query(usersRef, where('usernameNormalized', '==', normalized))),
                getDocs(query(usersRef, where('username', '==', username.trim())))
            ]);
            const isUnique = indexed.empty && legacy.empty;
            
            console.log(`🔍 Проверка ника "${username}":`, isUnique ? 'свободен' : 'занят');
            return isUnique;
        } catch (error) {
            console.error('❌ Ошибка проверки ника:', error);
            // Не путаем сбой Firestore с действительно занятым ником.
            return null;
        }
    }

    // Создание профиля пользователя
    async createUserProfile(uid, data) {
        try {
            await setDoc(doc(this.db, 'users', uid), data);
            console.log('👤 Профиль создан для:', uid);
            
            // Создаём подколлекции
            await this.createUserCollections(uid);
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка создания профиля:', error);
            throw error;
        }
    }

    // Создание начальных коллекций пользователя
    async createUserCollections(uid) {
        const collections = ['travels', 'restaurants', 'movies', 'books', 'dreams', 'friends', 'messages'];
        
        for (const collectionName of collections) {
            try {
                // Создаём документ-заглушку для инициализации коллекции
                const initDoc = doc(this.db, 'users', uid, collectionName, '_init');
                await setDoc(initDoc, { 
                    created: serverTimestamp(),
                    _note: `Коллекция для ${collectionName}`
                });
            } catch (error) {
                console.warn(`⚠️ Не удалось создать коллекцию ${collectionName}:`, error);
            }
        }
    }

    // Обновление времени последнего входа
    async updateLastLogin(uid) {
        try {
            const userRef = doc(this.db, 'users', uid);
            await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
        } catch (error) {
            console.warn('⚠️ Не удалось обновить время входа:', error);
        }
    }

    // Получение данных пользователя
    async getUserData(uid) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', uid));
            if (userDoc.exists()) {
                return { success: true, data: userDoc.data() };
            } else {
                return { success: false, error: 'Пользователь не найден' };
            }
        } catch (error) {
            console.error('❌ Ошибка получения данных:', error);
            return { success: false, error: 'Ошибка загрузки данных' };
        }
    }

    // Обработка ошибок
    getErrorMessage(code) {
        const errors = {
            'auth/invalid-email': 'Неверный формат email 📧',
            'auth/user-disabled': 'Аккаунт отключен администратором',
            'auth/user-not-found': 'Пользователь с таким email не найден',
            'auth/wrong-password': 'Неверный пароль 🔒',
            'auth/email-already-in-use': 'Этот email уже зарегистрирован',
            'auth/weak-password': 'Пароль должен быть минимум 6 символов',
            'auth/invalid-credential': 'Неверный email или пароль',
            'auth/too-many-requests': 'Слишком много попыток. Подождите немного ⏳',
            'auth/network-request-failed': 'Проблемы с интернетом 🌐',
            'auth/internal-error': 'Техническая ошибка. Попробуйте позже'
        };
        
        return errors[code] || `Произошла ошибка (${code}). Попробуйте еще раз`;
    }
}