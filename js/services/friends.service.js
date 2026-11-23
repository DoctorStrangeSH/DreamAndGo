import { app, auth, appCheck, db } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { 
    collection, doc, getDocs, getDoc,
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
                remove: httpsCallable(getFunctions(app, 'europe-west3'), 'removeFriendV1')
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
                stats: data.stats || {}
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

    async getFriends(userId) {
        try {
            const friendsRef = collection(this.db, 'users', userId, 'friends');
            const snapshot = await getDocs(friendsRef);
            
            const friends = [];
            for (const docSnap of snapshot.docs) {
                if (docSnap.id !== '_init') {
                    const friendData = await this.getUserProfile(docSnap.id);
                    if (friendData) {
                        friends.push({
                            uid: docSnap.id,
                            ...friendData,
                            addedAt: docSnap.data().addedAt?.toDate?.() || new Date()
                        });
                    }
                }
            }

            return friends;
        } catch (error) {
            console.error('Ошибка загрузки друзей:', error);
            return [];
        }
    }

    async getFriendRequests(userId) {
        try {
            const requestsRef = collection(this.db, 'users', userId, 'friendRequests');
            const snapshot = await getDocs(requestsRef);
            
            const requests = [];
            for (const docSnap of snapshot.docs) {
                if (docSnap.id !== '_init') {
                    const userData = await this.getUserProfile(docSnap.id);
                    if (userData) {
                        requests.push({
                            uid: docSnap.id,
                            ...userData,
                            createdAt: docSnap.data().createdAt?.toDate?.() || new Date()
                        });
                    }
                }
            }

            return requests;
        } catch (error) {
            console.error('Ошибка загрузки заявок:', error);
            return [];
        }
    }

    async getSentRequests(userId) {
        try {
            const sentRef = collection(this.db, 'users', userId, 'sentRequests');
            const snapshot = await getDocs(sentRef);
            
            const sent = [];
            for (const docSnap of snapshot.docs) {
                if (docSnap.id !== '_init') {
                    const userData = await this.getUserProfile(docSnap.id);
                    if (userData) {
                        sent.push({
                            uid: docSnap.id,
                            ...userData,
                            createdAt: docSnap.data().createdAt?.toDate?.() || new Date()
                        });
                    }
                }
            }

            return sent;
        } catch (error) {
            console.error('Ошибка загрузки отправленных заявок:', error);
            return [];
        }
    }

    async getUserProfile(uid) {
        try {
            const userDoc = await getDoc(doc(this.db, 'publicProfiles', uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                return {
                    username: data.username,
                    displayName: data.displayName || data.username,
                    avatar: data.avatar,
                    bio: data.bio || '',
                    stats: data.stats || {}
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }

}