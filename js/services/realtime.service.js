import { db } from '../config/firebase.js';
import { SubscriptionVersions } from '../core/subscription-versions.js';
import { SnapshotGate } from '../core/snapshot-gate.js';
import { getPublicProfilesByIds } from './public-profile-callable.service.js';
import { isValidChatUid } from '../core/chat-message-policy.js';
import { 
    collection, doc, query, orderBy, limit, startAfter,
    onSnapshot, getDocs
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
        // Live tail of the conversation; ascending limit would freeze after 100 messages.
        const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(100));

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
            this.deliverIfCurrent(key, token, callback, messages.reverse(), null, {
                cursor: snapshot.docs[snapshot.docs.length - 1] || null,
                hasMore: snapshot.size === 100
            });
        }, (error) => {
            console.error('Ошибка подписки на сообщения:', error);
            this.deliverIfCurrent(key, token, callback, [], error);
        });

        this.listeners[key] = unsubscribe;
        return () => {
            if (this.listenerVersions.isCurrent(key, token)) this.unsubscribe(key);
        };
    }

    async loadOlderMessages(chatId, cursor, pageSize = 50) {
        if (!cursor) return { messages: [], cursor: null, hasMore: false };
        const ref = collection(this.db, 'chats', chatId, 'messages');
        const q = query(ref, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
        const snapshot = await getDocs(q);
        const messages = snapshot.docs.map(item => {
            const data = item.data();
            return {
                id: item.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        }).reverse();
        return {
            messages,
            cursor: snapshot.docs[snapshot.docs.length - 1] || null,
            hasMore: snapshot.size === pageSize
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
            const chatDocs = snapshot.docs.filter(item => item.id !== '_init');
            const profilesById = await this.getUserProfiles(
                chatDocs.map(item => item.data().partnerId)
            );
            const chats = chatDocs.map(docSnap => {
                const chatData = docSnap.data();
                const partnerData = profilesById.get(chatData.partnerId) || null;
                return {
                    id: docSnap.id,
                    partnerId: chatData.partnerId,
                    partnerName: partnerData?.username || 'Пользователь',
                    partnerAvatar: partnerData?.avatar || null,
                    lastMessage: chatData.lastMessage || '',
                    lastMessageTime: chatData.lastMessageTime?.toDate?.() || new Date(),
                    unread: chatData.unread || 0,
                    isGroup: chatData.isGroup || false,
                    groupName: chatData.groupName || ''
                };
            });
            
            if (gate.isLatest(snapshotId)) this.deliverIfCurrent(key, token, callback, chats);
        }, (error) => {
            console.error('Ошибка подписки на чаты:', error);
            this.deliverIfCurrent(key, token, callback, [], error);
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
            const friendDocs = snapshot.docs.filter(item => item.id !== '_init');
            const profilesById = await this.getUserProfiles(friendDocs.map(item => item.id));
            const friends = friendDocs.flatMap(docSnap => {
                const friendData = profilesById.get(docSnap.id);
                return friendData ? [{
                    uid: docSnap.id,
                    ...friendData,
                    addedAt: docSnap.data().addedAt?.toDate?.() || new Date()
                }] : [];
            });
            
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
            const requestDocs = snapshot.docs.filter(item => item.id !== '_init');
            const profilesById = await this.getUserProfiles(requestDocs.map(item => item.id));
            const requests = requestDocs.flatMap(docSnap => {
                const userData = profilesById.get(docSnap.id);
                return userData ? [{
                    uid: docSnap.id,
                    ...userData,
                    createdAt: docSnap.data().createdAt?.toDate?.() || new Date()
                }] : [];
            });
            
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
            const sentDocs = snapshot.docs.filter(item => item.id !== '_init');
            const profilesById = await this.getUserProfiles(sentDocs.map(item => item.id));
            const sent = sentDocs.flatMap(docSnap => {
                const userData = profilesById.get(docSnap.id);
                return userData ? [{
                    uid: docSnap.id,
                    ...userData,
                    createdAt: docSnap.data().createdAt?.toDate?.() || new Date()
                }] : [];
            });
            
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

    async getUserProfiles(uids) {
        const uniqueUids = [...new Set(uids.filter(isValidChatUid))];
        if (uniqueUids.length === 0) return new Map();
        try {
            const profiles = await getPublicProfilesByIds(uniqueUids);
            return new Map(profiles.map(profile => [profile.uid, profile]));
        } catch (error) {
            return new Map();
        }
    }

    async getUserProfile(uid) {
        if (!isValidChatUid(uid)) return null;
        const profiles = await this.getUserProfiles([uid]);
        return profiles.get(uid) || null;
    }

    deliverIfCurrent(key, token, callback, ...values) {
        if (this.listenerVersions.isCurrent(key, token)) callback(...values);
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