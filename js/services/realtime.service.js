import { db } from '../config/firebase.js';
import { 
    collection, doc, query, orderBy, limit,
    onSnapshot, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class RealtimeService {
    constructor() {
        this.db = db;
        this.listeners = {};
    }

    subscribeToMessages(chatId, callback) {
        const key = `messages_${chatId}`;
        this.unsubscribe(key);

        const messagesRef = collection(this.db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = [];
            snapshot.docs.slice().reverse().forEach(docSnap => {
                const data = docSnap.data();
                messages.push({
                    id: docSnap.id,
                    ...data,
                    createdAt: data.createdAt?.toDate?.() || new Date(),
                    readAt: data.readAt?.toDate?.() || null,
                    editedAt: data.editedAt?.toDate?.() || null
                });
            });
            callback(messages);
        }, (error) => {
            console.error('Ошибка подписки на сообщения:', error);
            callback([]);
        });

        this.listeners[key] = unsubscribe;
        return unsubscribe;
    }

    subscribeToChats(userId, callback) {
        const key = `chats_${userId}`;
        this.unsubscribe(key);

        const chatsRef = collection(this.db, 'users', userId, 'chats');
        const q = query(chatsRef, orderBy('lastMessageTime', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const chats = [];
            for (const docSnap of snapshot.docs) {
                if (docSnap.id === '_init') continue;

                const chatData = docSnap.data();
                const partnerData = await this.getUserProfile(chatData.partnerId);
                chats.push({
                    id: docSnap.id,
                    chatId: docSnap.id,
                    partnerId: chatData.partnerId,
                    partnerName: partnerData?.username || chatData.partnerName || 'Пользователь',
                    partnerAvatar: partnerData?.avatar || chatData.partnerAvatar || null,
                    lastMessage: chatData.lastMessage || '',
                    lastMessageTime: chatData.lastMessageTime?.toDate?.() || new Date(),
                    unread: chatData.unread || 0,
                    isGroup: false,
                    groupName: ''
                });
            }
            callback(chats);
        }, (error) => {
            console.error('Ошибка подписки на чаты:', error);
            callback([]);
        });

        this.listeners[key] = unsubscribe;
        return unsubscribe;
    }

    subscribeToFriends(userId, callback) {
        const key = `friends_${userId}`;
        this.unsubscribe(key);

        const friendsRef = collection(this.db, 'users', userId, 'friends');
        
        const unsubscribe = onSnapshot(friendsRef, async (snapshot) => {
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
            
            callback(friends);
        }, (error) => {
            console.error('Ошибка подписки на друзей:', error);
            callback([]);
        });

        this.listeners[key] = unsubscribe;
        return unsubscribe;
    }

    subscribeToFriendRequests(userId, callback) {
        const key = `friendRequests_${userId}`;
        this.unsubscribe(key);

        const requestsRef = collection(this.db, 'users', userId, 'friendRequests');
        
        const unsubscribe = onSnapshot(requestsRef, async (snapshot) => {
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
            
            callback(requests);
        }, (error) => {
            console.error('Ошибка подписки на заявки:', error);
            callback([]);
        });

        this.listeners[key] = unsubscribe;
        return unsubscribe;
    }

    subscribeToSentRequests(userId, callback) {
        const key = `sentRequests_${userId}`;
        this.unsubscribe(key);

        const sentRef = collection(this.db, 'users', userId, 'sentRequests');
        
        const unsubscribe = onSnapshot(sentRef, async (snapshot) => {
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
            
            callback(sent);
        }, (error) => {
            console.error('Ошибка подписки на отправленные заявки:', error);
            callback([]);
        });

        this.listeners[key] = unsubscribe;
        return unsubscribe;
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

    unsubscribe(key) {
        if (this.listeners[key]) {
            this.listeners[key]();
            delete this.listeners[key];
        }
    }

    unsubscribeAll() {
        Object.keys(this.listeners).forEach(key => {
            this.listeners[key]();
        });
        this.listeners = {};
    }
}