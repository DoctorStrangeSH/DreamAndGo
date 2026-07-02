import { 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
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
    constructor(auth, db) {
        this.auth = auth;
        this.db = db;
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
            await this.updateLastLogin(result.user.uid);
            
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

    // Регистрация
    async signUpWithEmail(email, password, username) {
        try {
            console.log('📝 Попытка регистрации:', email, username);
            
            // Проверяем уникальность ника
            const isUnique = await this.checkUsernameUnique(username);
            if (!isUnique) {
                console.warn('⚠️ Ник уже занят:', username);
                return { success: false, error: 'Этот ник уже занят 😔 Придумай другой!' };
            }

            // Создаём аккаунт
            const result = await createUserWithEmailAndPassword(this.auth, email, password);
            console.log('✅ Аккаунт создан');
            
            // Создаём профиль пользователя в Firestore
            await this.createUserProfile(result.user.uid, {
                email: email,
                username: username,
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
            const q = query(usersRef, where('username', '==', username.toLowerCase()));
            const querySnapshot = await getDocs(q);
            const isUnique = querySnapshot.empty;
            
            console.log(`🔍 Проверка ника "${username}":`, isUnique ? 'свободен' : 'занят');
            return isUnique;
        } catch (error) {
            console.error('❌ Ошибка проверки ника:', error);
            // В случае ошибки лучше разрешить регистрацию
            return true;
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