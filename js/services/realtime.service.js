import { db } from '../config/firebase.js';
import { SubscriptionVersions } from '../core/subscription-versions.js';
import { SnapshotGate } from '../core/snapshot-gate.js';
import { toPublicProfile } from '../core/public-profile.js';
import { 
    collection, doc, query, orderBy, limit,
    onSnapshot, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class RealtimeService {
    constructor() {
        this.db = db;
        this.listeners = {};
        this.listenerVersions = new SubscriptionVersions();
    }

    subscribeToMessages(chatId, callback) {
        const key = `messages_${chatId}`;
        this.unsubscribe(key);
        const token = this.listenerVersions.current(key);

        const messagesRef = collection(this.db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                messages.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate?.() || new Date()
                });
            });
            this.deliverIfCurrent(key, token, callback, messages);
        }, (error) => {
            console.error('Ошибка подписки на сообщения:', error);
            this.deliverIfCurrent(key, token, callback, []);
        });

        this.listeners[key] = unsubscribe;
        return () => {
            if (this.listenerVersions.isCurrent(key, token)) this.unsubscribe(key);
        };
    }

    subscribeToChats(userId, callback) {
        const key = `chats_${userId}`;
        this.unsubscribe(key);
        const token = this.listenerVersions.current(key);
        const gate = new SnapshotGate();

        const chatsRef = collection(this.db, 'users', userId, 'chats');
        const q = query(chatsRef, orderBy('lastMessageTime', 'desc'));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const snapshotId = gate.begin();
            const chats = [];
            
            for (const docSnap of snapshot.docs) {
                if (docSnap.id === '_init') continue;
                
                const chatData = docSnap.data();
                const partnerData = await this.getUserProfile(chatData.partnerId);
                
                chats.push({
                    id: docSnap.id,
                    partnerId: chatData.partnerId,
                    partnerName: partnerData?.username || 'Пользователь',
                    partnerAvatar: partnerData?.avatar || null,
                    lastMessage: chatData.lastMessage || '',
                    lastMessageTime: chatData.lastMessageTime?.toDate?.() || new Date(),
                    unread: chatData.unread || 0,
                    isGroup: chatData.isGroup || false,
                    groupName: chatData.groupName || ''
                });
            }
            
            if (gate.isLatest(snapshotId)) this.deliverIfCurrent(key, token, callback, chats);
        }, (error) => {
            console.error('Ошибка подписки на чаты:', error);
            this.deliverIfCurrent(key, token, callback, []);
        });

        this.listeners[key] = unsubscribe;
        return () => {
            if (this.listenerVersions.isCurrent(key, token)) this.unsubscribe(key);
        };
    }

    subscribeToFriends(userId, callback) {
        const key = `friends_${userId}`;
        this.unsubscribe(key);
        const token = this.listenerVersions.current(key);
        const gate = new SnapshotGate();

        const friendsRef = collection(this.db, 'users', userId, 'friends');
        
        const unsubscribe = onSnapshot(friendsRef, async (snapshot) => {
            const snapshotId = gate.begin();
            const friends = [];
            
            for (const docSnap of snapshot.docs) {
                if (docSnap.id === '_init') continue;
                
                const friendData = await this.getUserProfile(docSnap.id);
                if (friendData) {
                    friends.push({
                        uid: docSnap.id,
                        ...friendData,
                        addedAt: docSnap.data().addedAt?.toDate?.() || new Date()
                    });
                }
            }
            
            if (gate.isLatest(snapshotId)) this.deliverIfCurrent(key, token, callback, friends);
        }, (error) => {
            console.error('Ошибка подписки на друзей:', error);
            this.deliverIfCurrent(key, token, callback, []);
        });

        this.listeners[key] = unsubscribe;
        return () => {
            if (this.listenerVersions.isCurrent(key, token)) this.unsubscribe(key);
        };
    }

    subscribeToFriendRequests(userId, callback) {
        const key = `friendRequests_${userId}`;
        this.unsubscribe(key);
        const token = this.listenerVersions.current(key);
        const gate = new SnapshotGate();

        const requestsRef = collection(this.db, 'users', userId, 'friendRequests');
        
        const unsubscribe = onSnapshot(requestsRef, async (snapshot) => {
            const snapshotId = gate.begin();
            const requests = [];
            
            for (const docSnap of snapshot.docs) {
                if (docSnap.id === '_init') continue;
                
                const userData = await this.getUserProfile(docSnap.id);
                if (userData) {
                    requests.push({
                        uid: docSnap.id,
                        ...userData,
                        createdAt: docSnap.data().createdAt?.toDate?.() || new Date()
                    });
                }
            }
            
            if (gate.isLatest(snapshotId)) this.deliverIfCurrent(key, token, callback, requests);
        }, (error) => {
            console.error('Ошибка подписки на заявки:', error);
            this.deliverIfCurrent(key, token, callback, []);
        });

        this.listeners[key] = unsubscribe;
        return () => {
            if (this.listenerVersions.isCurrent(key, token)) this.unsubscribe(key);
        };
    }

    subscribeToSentRequests(userId, callback) {
        const key = `sentRequests_${userId}`;
        this.unsubscribe(key);
        const token = this.listenerVersions.current(key);
        const gate = new SnapshotGate();

        const sentRef = collection(this.db, 'users', userId, 'sentRequests');
        
        const unsubscribe = onSnapshot(sentRef, async (snapshot) => {
            const snapshotId = gate.begin();
            const sent = [];
            
            for (const docSnap of snapshot.docs) {
                if (docSnap.id === '_init') continue;
                
                const userData = await this.getUserProfile(docSnap.id);
                if (userData) {
                    sent.push({
                        uid: docSnap.id,
                        ...userData,
                        createdAt: docSnap.data().createdAt?.toDate?.() || new Date()
                    });
                }
            }
            
            if (gate.isLatest(snapshotId)) this.deliverIfCurrent(key, token, callback, sent);
        }, (error) => {
            console.error('Ошибка подписки на отправленные заявки:', error);
            this.deliverIfCurrent(key, token, callback, []);
        });

        this.listeners[key] = unsubscribe;
        return () => {
            if (this.listenerVersions.isCurrent(key, token)) this.unsubscribe(key);
        };
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

    deliverIfCurrent(key, token, callback, value) {
        if (this.listenerVersions.isCurrent(key, token)) callback(value);
    }

    unsubscribe(key) {
        // Аннулируем даже уже запущенные асинхронные обработчики snapshot.
        this.listenerVersions.invalidate(key);
        if (this.listeners[key]) {
            this.listeners[key]();
            delete this.listeners[key];
        }
    }

    unsubscribeAll() {
        Object.keys(this.listeners).forEach(key => this.unsubscribe(key));
    }
}