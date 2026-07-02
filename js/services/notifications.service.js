import { db } from '../config/firebase.js';
import { 
    collection, doc, addDoc, getDocs, updateDoc, deleteDoc,
    query, orderBy, limit, serverTimestamp, onSnapshot, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class NotificationsService {
    constructor() {
        this.db = db;
        this.listeners = {};
    }

    async addNotification(userId, data) {
        try {
            const notifRef = collection(this.db, 'users', userId, 'notifications');
            await addDoc(notifRef, {
                ...data,
                read: false,
                createdAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Ошибка создания уведомления:', error);
            return { success: false };
        }
    }

    // Типы уведомлений
    async notifyFriendRequest(fromUserId, toUserId, fromUsername) {
        await this.addNotification(toUserId, {
            type: 'friend_request',
            title: 'Новая заявка в друзья',
            message: `@${fromUsername} хочет добавить тебя в друзья`,
            icon: 'bi-person-plus',
            color: 'primary',
            link: '#friends',
            fromUserId: fromUserId
        });
    }

    async notifyFriendAccepted(fromUserId, toUserId, toUsername) {
        await this.addNotification(fromUserId, {
            type: 'friend_accepted',
            title: 'Заявка принята',
            message: `@${toUsername} принял твою заявку в друзья`,
            icon: 'bi-person-check',
            color: 'success',
            link: `#profile/${toUserId}`,
            fromUserId: toUserId
        });
    }

    async notifyNewMessage(fromUserId, toUserId, fromUsername, text) {
        await this.addNotification(toUserId, {
            type: 'new_message',
            title: 'Новое сообщение',
            message: `@${fromUsername}: ${text.substring(0, 50)}`,
            icon: 'bi-chat-dots',
            color: 'info',
            link: '#chat',
            fromUserId: fromUserId
        });
    }

    async notifyAchievement(userId, achievement) {
        await this.addNotification(userId, {
            type: 'achievement',
            title: 'Новое достижение!',
            message: `${achievement.emoji} ${achievement.title} — ${achievement.description}`,
            icon: 'bi-trophy',
            color: 'warning',
            link: '#achievements'
        });
    }

    async notifyLevelUp(userId, level, title) {
        await this.addNotification(userId, {
            type: 'level_up',
            title: 'Новый уровень!',
            message: `Ты достиг ${level} уровня — ${title}`,
            icon: 'bi-star-fill',
            color: 'warning',
            link: '#profile'
        });
    }

    subscribeToNotifications(userId, callback) {
        const key = `notifications_${userId}`;
        this.unsubscribe(key);

        const notifRef = collection(this.db, 'users', userId, 'notifications');
        const q = query(notifRef, orderBy('createdAt', 'desc'), limit(30));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifications = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                notifications.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate?.() || new Date()
                });
            });
            callback(notifications);
        });

        this.listeners[key] = unsubscribe;
        return unsubscribe;
    }

    async markAsRead(userId, notificationId) {
        try {
            const notifRef = doc(this.db, 'users', userId, 'notifications', notificationId);
            await updateDoc(notifRef, { read: true });
        } catch (error) {
            console.error('Ошибка отметки уведомления:', error);
        }
    }

    async markAllAsRead(userId) {
        try {
            const notifRef = collection(this.db, 'users', userId, 'notifications');
            const q = query(notifRef, where('read', '==', false));
            const snapshot = await getDocs(q);
            
            for (const docSnap of snapshot.docs) {
                await updateDoc(docSnap.ref, { read: true });
            }
        } catch (error) {
            console.error('Ошибка отметки всех уведомлений:', error);
        }
    }

    unsubscribe(key) {
        if (this.listeners[key]) {
            this.listeners[key]();
            delete this.listeners[key];
        }
    }
}