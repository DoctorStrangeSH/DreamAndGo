import { auth, db } from '../config/firebase.js';
import { normalizeUsername, isValidUsername } from '../core/username.js';
import { toPublicProfile } from '../core/public-profile.js';
import { countFriendRecords } from '../core/friend-count.js';
import { 
    collection, doc, getDocs, getDoc, updateDoc,
    query, where, limit, serverTimestamp, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

function isValidFriendPair(userId, friendId) {
    const isValidUid = value => typeof value === 'string' && value.length > 0 &&
        value.length <= 128 && value.trim() === value && !value.includes('/');
    return isValidUid(userId) && isValidUid(friendId) && userId !== friendId;
}


function isCurrentUser(userId) {
    return typeof userId === 'string' && auth?.currentUser?.uid === userId;
}

export class FriendsService {
    constructor() {
        this.db = db;
    }

    async getUserByUsername(username) {
        const normalized = normalizeUsername(username);
        if (!isValidUsername(normalized)) return null;

        try {
            const usersRef = collection(this.db, 'users');
            // New profiles use the canonical key. Legacy profiles are still
            // available via exact-case username until a safe backfill exists.
            const indexed = await getDocs(query(usersRef, where('usernameNormalized', '==', normalized), limit(1)));
            let match = indexed.docs[0];
            if (!match) {
                const legacy = await getDocs(query(usersRef, where('username', '==', String(username).trim()), limit(1)));
                match = legacy.docs[0];
            }
            if (!match) return null;
            return toPublicProfile(match.id, match.data());
        } catch (error) {
            console.error('Ошибка поиска пользователя:', error);
            throw new Error('Не удалось выполнить поиск. Проверь подключение к интернету и повтори попытку.');
        }
    }

    async sendFriendRequest(fromUserId, toUserId) {
        if (!isCurrentUser(fromUserId) || !isValidFriendPair(fromUserId, toUserId)) {
            return { success: false, error: fromUserId === toUserId
                ? 'Нельзя отправить заявку самому себе.'
                : 'Некорректные данные для отправки заявки.' };
        }
        try {
            const outgoingRef = doc(this.db, 'users', fromUserId, 'sentRequests', toUserId);
            const incomingRef = doc(this.db, 'users', toUserId, 'friendRequests', fromUserId);
            const reverseIncomingRef = doc(this.db, 'users', fromUserId, 'friendRequests', toUserId);
            const reverseOutgoingRef = doc(this.db, 'users', toUserId, 'sentRequests', fromUserId);
            const ownFriendRef = doc(this.db, 'users', fromUserId, 'friends', toUserId);
            const peerFriendRef = doc(this.db, 'users', toUserId, 'friends', fromUserId);

            await runTransaction(this.db, async transaction => {
                const [outgoing, reverseIncoming, ownFriend, peerFriend] = await Promise.all([
                    transaction.get(outgoingRef),
                    transaction.get(reverseIncomingRef),
                    transaction.get(ownFriendRef),
                    transaction.get(peerFriendRef)
                ]);
                if (!isCurrentUser(fromUserId)) throw new Error('Сессия изменилась.');
                if (ownFriend.exists() || peerFriend.exists()) throw new Error('Вы уже друзья.');
                if (outgoing.exists()) throw new Error('Заявка уже отправлена.');
                if (reverseIncoming.exists()) throw new Error('Этот пользователь уже отправил тебе заявку.');
                const request = {
                    from: fromUserId,
                    to: toUserId,
                    status: 'pending',
                    createdAt: serverTimestamp()
                };
                transaction.set(incomingRef, request);
                transaction.set(outgoingRef, request);
            });
            return { success: true };
        } catch (error) {
            console.error('Ошибка отправки заявки:', error);
            return { success: false, error: error.message || 'Не удалось отправить заявку. Попробуй ещё раз.' };
        }
    }

    async acceptFriendRequest(userId, friendId) {
        if (!isCurrentUser(userId) || !isValidFriendPair(userId, friendId)) {
            return { success: false, error: 'Некорректные данные для принятия заявки.' };
        }
        try {
            const requestRef = doc(this.db, 'users', userId, 'friendRequests', friendId);
            const sentRef = doc(this.db, 'users', friendId, 'sentRequests', userId);
            const ownFriendRef = doc(this.db, 'users', userId, 'friends', friendId);
            const peerFriendRef = doc(this.db, 'users', friendId, 'friends', userId);

            await runTransaction(this.db, async transaction => {
                const request = await transaction.get(requestRef);
                if (!request.exists()) throw new Error('Заявка не найдена или уже обработана.');
                const data = request.data();
                if (data.from !== friendId || data.to !== userId || data.status !== 'pending') {
                    throw new Error('Заявка не прошла проверку.');
                }
                transaction.set(ownFriendRef, { friendId, addedAt: serverTimestamp() });
                transaction.set(peerFriendRef, { friendId: userId, addedAt: serverTimestamp() });
                transaction.delete(requestRef);
                transaction.delete(sentRef);
            });

            await this.updateFriendsCount(userId);
            await this.updateFriendsCount(friendId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка принятия заявки:', error);
            return { success: false, error: error.message || 'Не удалось принять заявку.' };
        }
    }

    async rejectFriendRequest(userId, friendId) {
        if (!isCurrentUser(userId) || !isValidFriendPair(userId, friendId)) {
            return { success: false, error: 'Некорректные данные для отклонения заявки.' };
        }
        try {
            const requestRef = doc(this.db, 'users', userId, 'friendRequests', friendId);
            const sentRef = doc(this.db, 'users', friendId, 'sentRequests', userId);
            await runTransaction(this.db, async transaction => {
                const request = await transaction.get(requestRef);
                if (!request.exists()) throw new Error('Заявка не найдена или уже обработана.');
                const data = request.data();
                if (data.from !== friendId || data.to !== userId || data.status !== 'pending') {
                    throw new Error('Заявка не прошла проверку.');
                }
                transaction.delete(requestRef);
                transaction.delete(sentRef);
            });
            return { success: true };
        } catch (error) {
            console.error('Ошибка отклонения заявки:', error);
            return { success: false, error: error.message || 'Не удалось отклонить заявку.' };
        }
    }

    async removeFriend(userId, friendId) {
        if (!isCurrentUser(userId) || !isValidFriendPair(userId, friendId)) {
            return { success: false, error: 'Некорректные данные для удаления друга.' };
        }
        try {
            const ownFriendRef = doc(this.db, 'users', userId, 'friends', friendId);
            const peerFriendRef = doc(this.db, 'users', friendId, 'friends', userId);
            await runTransaction(this.db, async transaction => {
                const ownFriend = await transaction.get(ownFriendRef);
                if (!ownFriend.exists()) throw new Error('Пользователь не находится в списке друзей.');
                transaction.delete(ownFriendRef);
                transaction.delete(peerFriendRef);
            });
            await this.updateFriendsCount(userId);
            await this.updateFriendsCount(friendId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления друга:', error);
            return { success: false, error: error.message || 'Не удалось удалить друга.' };
        }
    }

    async getFriends(userId) {
        if (!isCurrentUser(userId)) return [];
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
        if (!isCurrentUser(userId)) return [];
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
        if (!isCurrentUser(userId)) return [];
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
            const userDoc = await getDoc(doc(this.db, 'users', uid));
            if (userDoc.exists()) {
                return toPublicProfile(uid, userDoc.data());
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async updateFriendsCount(userId) {
        if (!isCurrentUser(userId)) return;
        try {
            const friendsRef = collection(this.db, 'users', userId, 'friends');
            const snapshot = await getDocs(friendsRef);
            const count = countFriendRecords(snapshot.docs);
            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, { 'stats.friends': count });
        } catch (error) {
            console.error('Ошибка обновления счётчика друзей:', error);
        }
    }
}