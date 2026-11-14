import { db } from '../config/firebase.js';
import { normalizeUsername, isValidUsername } from '../core/username.js';
import { toPublicProfile } from '../core/public-profile.js';
import { 
    collection, doc, getDocs, getDoc, updateDoc,
    query, where, limit, serverTimestamp, writeBatch, setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
            return null;
        }
    }

    async sendFriendRequest(fromUserId, toUserId) {
        if (!fromUserId || !toUserId || fromUserId === toUserId) {
            return { success: false, error: 'Нельзя отправить заявку самому себе.' };
        }
        try {
            // Both user-facing views must change atomically, or neither changes.
            const batch = writeBatch(this.db);
            const request = {
                from: fromUserId,
                to: toUserId,
                status: 'pending',
                createdAt: serverTimestamp()
            };
            batch.set(doc(this.db, 'users', toUserId, 'friendRequests', fromUserId), request);
            batch.set(doc(this.db, 'users', fromUserId, 'sentRequests', toUserId), request);
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Ошибка отправки заявки:', error);
            return { success: false, error: 'Не удалось отправить заявку. Попробуй ещё раз.' };
        }
    }

    async acceptFriendRequest(userId, friendId) {
        try {
            const batch = writeBatch(this.db);

            batch.set(doc(this.db, 'users', userId, 'friends', friendId), {
                friendId: friendId,
                addedAt: serverTimestamp()
            });

            batch.set(doc(this.db, 'users', friendId, 'friends', userId), {
                friendId: userId,
                addedAt: serverTimestamp()
            });

            batch.delete(doc(this.db, 'users', userId, 'friendRequests', friendId));
            batch.delete(doc(this.db, 'users', friendId, 'sentRequests', userId));

            await batch.commit();

            await this.updateFriendsCount(userId);
            await this.updateFriendsCount(friendId);

            return { success: true };
        } catch (error) {
            console.error('Ошибка принятия заявки:', error);
            return { success: false, error: error.message };
        }
    }

    async rejectFriendRequest(userId, friendId) {
        try {
            const batch = writeBatch(this.db);

            batch.delete(doc(this.db, 'users', userId, 'friendRequests', friendId));
            batch.delete(doc(this.db, 'users', friendId, 'sentRequests', userId));

            await batch.commit();

            return { success: true };
        } catch (error) {
            console.error('Ошибка отклонения заявки:', error);
            return { success: false, error: error.message };
        }
    }

    async removeFriend(userId, friendId) {
        try {
            const batch = writeBatch(this.db);

            batch.delete(doc(this.db, 'users', userId, 'friends', friendId));
            batch.delete(doc(this.db, 'users', friendId, 'friends', userId));

            await batch.commit();

            await this.updateFriendsCount(userId);
            await this.updateFriendsCount(friendId);

            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления друга:', error);
            return { success: false, error: error.message };
        }
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
        try {
            const friends = await this.getFriends(userId);
            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, { 'stats.friends': friends.length });
        } catch (error) {
            console.error('Ошибка обновления счётчика друзей:', error);
        }
    }
}