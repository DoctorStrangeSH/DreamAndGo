import { app, auth, appCheck, db } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { 
    collection, getDocs,
    query, where, limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class FriendsService {
    constructor() {
        this.db = db;
        this.callables = null;
        const backendReady = document.querySelector('meta[name="firebase-functions-backend-ready"]')
            ?.content?.trim().toLowerCase() === 'true';
        if (app && appCheck && backendReady) {
            this.callables = {
                send: httpsCallable(getFunctions(app, 'europe-west3'), 'sendFriendRequestV1'),
                accept: httpsCallable(getFunctions(app, 'europe-west3'), 'acceptFriendRequestV1'),
                reject: httpsCallable(getFunctions(app, 'europe-west3'), 'rejectFriendRequestV1'),
                cancel: httpsCallable(getFunctions(app, 'europe-west3'), 'cancelFriendRequestV1'),
                remove: httpsCallable(getFunctions(app, 'europe-west3'), 'removeFriendV1'),
                listFriends: httpsCallable(getFunctions(app, 'europe-west3'), 'getMyFriendsV1'),
                listRequests: httpsCallable(getFunctions(app, 'europe-west3'), 'getMyFriendRequestsV1'),
                listSent: httpsCallable(getFunctions(app, 'europe-west3'), 'getMySentFriendRequestsV1')
            };
        }
    }

    async invokeFriendAction(action, targetUid) {
        if (!this.callables?.[action]) {
            return { success: false, error: 'Защищённые операции с друзьями пока не подключены.' };
        }
        try {
            const result = await this.callables[action]({ targetUid });
            return result?.data?.success === true
                ? { success: true }
                : { success: false, error: 'Сервер вернул некорректный ответ.' };
        } catch (error) {
            const messages = {
                'functions/already-exists': 'Заявка или дружба уже существует.',
                'functions/not-found': 'Заявка или пользователь больше не существуют.',
                'functions/failed-precondition': 'Это действие сейчас недоступно.',
                'functions/invalid-argument': 'Некорректные данные запроса.',
                'functions/unauthenticated': 'Войди в аккаунт и попробуй снова.',
                'functions/app-check-failed': 'Не пройдена проверка безопасности.'
            };
            return { success: false, error: messages[error.code] || 'Не удалось выполнить действие. Попробуй позже.' };
        }
    }

    async getUserByUsername(username) {
        const searchName = String(username ?? '').trim();
        const normalizedName = searchName.toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(normalizedName)) return null;

        try {
            const usersRef = collection(this.db, 'publicProfiles');
            const indexed = await getDocs(query(
                usersRef,
                where('username', '==', normalizedName),
                limit(1)
            ));
            let match = indexed.docs[0];

            if (!match) return null;
            const data = match.data();
            // Return only fields intended for the friend-search card.
            return {
                uid: match.id,
                username: data.username || '',
                displayName: data.displayName || data.username || '',
                avatar: data.avatar || null,
                bio: data.bio || '',
                location: data.location || '',
                stats: {
                    travels: Number(data.stats?.travels) || 0,
                    movies: Number(data.stats?.movies) || 0,
                    books: Number(data.stats?.books) || 0
                }
            };
        } catch (error) {
            console.error('Ошибка поиска пользователя:', error);
            throw new Error('Не удалось выполнить поиск. Проверь подключение к интернету и повтори попытку.');
        }
    }

    async sendFriendRequest(fromUserId, toUserId) {
        if (!fromUserId || fromUserId !== auth.currentUser?.uid) {
            return { success: false, error: 'Не удалось подтвердить текущий аккаунт.' };
        }
        return this.invokeFriendAction('send', toUserId);
    }

    async acceptFriendRequest(userId, friendId) {
        if (!userId || userId !== auth.currentUser?.uid) {
            return { success: false, error: 'Не удалось подтвердить текущий аккаунт.' };
        }
        return this.invokeFriendAction('accept', friendId);
    }

    async rejectFriendRequest(userId, friendId) {
        if (!userId || userId !== auth.currentUser?.uid) {
            return { success: false, error: 'Не удалось подтвердить текущий аккаунт.' };
        }
        return this.invokeFriendAction('reject', friendId);
    }

    async cancelFriendRequest(userId, targetUid) {
        if (!userId || userId !== auth.currentUser?.uid) {
            return { success: false, error: 'Не удалось подтвердить текущий аккаунт.' };
        }
        return this.invokeFriendAction('cancel', targetUid);
    }

    async removeFriend(userId, friendId) {
        if (!userId || userId !== auth.currentUser?.uid) {
            return { success: false, error: 'Не удалось подтвердить текущий аккаунт.' };
        }
        return this.invokeFriendAction('remove', friendId);
    }

    async loadRelationshipList(userId, callableName, timestampField) {
        if (!userId || userId !== auth.currentUser?.uid) return [];
        const callable = this.callables?.[callableName];
        if (!callable) {
            console.warn('Защищённое чтение списка друзей пока не подключено.');
            return [];
        }
        try {
            const result = await callable({});
            if (result?.data?.success !== true || !Array.isArray(result.data.items)) return [];
            return result.data.items.map(item => ({
                ...item,
                [timestampField]: item[timestampField] ? new Date(item[timestampField]) : new Date()
            }));
        } catch (error) {
            console.error('Ошибка загрузки списка друзей:', error);
            return [];
        }
    }

    async getFriends(userId) {
        return this.loadRelationshipList(userId, 'listFriends', 'addedAt');
    }

    async getFriendRequests(userId) {
        return this.loadRelationshipList(userId, 'listRequests', 'createdAt');
    }

    async getSentRequests(userId) {
        return this.loadRelationshipList(userId, 'listSent', 'createdAt');
    }


}