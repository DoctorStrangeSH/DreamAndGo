import { db } from '../config/firebase.js';
import { 
    collection, doc, getDocs, getDoc, updateDoc, deleteDoc,
    query, where, orderBy, serverTimestamp, arrayUnion, arrayRemove,
    setDoc, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class FriendsService {
    constructor() {
        this.db = db;
    }

    async getUserByUsername(username) {
        try {
            const usersRef = collection(this.db, 'users');
            const q = query(usersRef, where('username', '==', username.toLowerCase()));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) return null;
            
            const userDoc = snapshot.docs[0];
            return {
                uid: userDoc.id,
                ...userDoc.data()
            };
        } catch (error) {
            console.error('Ошибка поиска пользователя:', error);
            return null;
        }
    }

    async sendFriendRequest(fromUserId, toUserId) {
        try {
            const requestRef = doc(this.db, 'users', toUserId, 'friendRequests', fromUserId);
            await setDoc(requestRef, {
                from: fromUserId,
                to: toUserId,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            const sentRef = doc(this.db, 'users', fromUserId, 'sentRequests', toUserId);
            await setDoc(sentRef, {
                from: fromUserId,
                to: toUserId,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error('Ошибка отправки заявки:', error);
            return { success: false, error: error.message };
        }
    }

    async acceptFriendRequest(userId, friendId) {
        try {
            const batch = writeBatch(this.db);

            // Добавляем в друзья обоим
            const userFriendRef = doc(this.db, 'users', userId, 'friends', friendId);
            batch.set(userFriendRef, {
                friendId: friendId,
                addedAt: serverTimestamp()
            });

            const friendUserRef = doc(this.db, 'users', friendId, 'friends', userId);
            batch.set(friendUserRef, {
                friendId: userId,
                addedAt: serverTimestamp()
            });

            // Удаляем заявки
            const requestRef = doc(this.db, 'users', userId, 'friendRequests', friendId);
            batch.delete(requestRef);

            const sentRef = doc(this.db, 'users', friendId, 'sentRequests', userId);
            batch.delete(sentRef);

            await batch.commit();

            // Обновляем статистику
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

            const requestRef = doc(this.db, 'users', userId, 'friendRequests', friendId);
            batch.delete(requestRef);

            const sentRef = doc(this.db, 'users', friendId, 'sentRequests', userId);
            batch.delete(sentRef);

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

            const userFriendRef = doc(this.db, 'users', userId, 'friends', friendId);
            batch.delete(userFriendRef);

            const friendUserRef = doc(this.db, 'users', friendId, 'friends', userId);
            batch.delete(friendUserRef);

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

    async updateFriendsCount(userId) {
        try {
            const friends = await this.getFriends(userId);
            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, {
                'stats.friends': friends.length
            });
        } catch (error) {
            console.error('Ошибка обновления счётчика друзей:', error);
        }
    }
}