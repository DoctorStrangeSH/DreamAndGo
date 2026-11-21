import { auth, db } from '../config/firebase.js';
import {
    collection, doc, getDocs, updateDoc,
    query, orderBy, limit, onSnapshot, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const noop = () => {};
const isValidDocumentId = value =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export class NotificationsService {
    constructor() {
        this.db = db;
        this.auth = auth;
        this.listeners = {};
    }

    isCurrentOwner(userId) {
        return typeof userId === 'string' && userId.length > 0 &&
            this.auth?.currentUser?.uid === userId;
    }

    subscribeToNotifications(userId, callback) {
        const key = `notifications_${userId}`;
        this.unsubscribe(key);

        if (!this.isCurrentOwner(userId) || typeof callback !== 'function') {
            if (typeof callback === 'function') callback([]);
            return noop;
        }

        const notifRef = collection(this.db, 'users', userId, 'notifications');
        const q = query(notifRef, orderBy('createdAt', 'desc'), limit(30));
        const unsubscribe = onSnapshot(q, snapshot => {
            if (!this.isCurrentOwner(userId)) return;
            const notifications = [];
            snapshot.forEach(document => {
                const data = document.data();
                notifications.push({
                    id: document.id,
                    ...data,
                    createdAt: data.createdAt?.toDate?.() || new Date()
                });
            });
            callback(notifications);
        });

        this.listeners[key] = unsubscribe;
        return () => {
            unsubscribe();
            if (this.listeners[key] === unsubscribe) delete this.listeners[key];
        };
    }

    async markAsRead(userId, notificationId) {
        if (!this.isCurrentOwner(userId) || !isValidDocumentId(notificationId)) return false;
        try {
            const notifRef = doc(this.db, 'users', userId, 'notifications', notificationId);
            await updateDoc(notifRef, { read: true });
            return true;
        } catch (error) {
            console.error('Ошибка отметки уведомления:', error);
            return false;
        }
    }

    async markAllAsRead(userId) {
        if (!this.isCurrentOwner(userId)) return false;
        try {
            const notifRef = collection(this.db, 'users', userId, 'notifications');
            const q = query(notifRef, where('read', '==', false));
            const snapshot = await getDocs(q);
            if (!this.isCurrentOwner(userId)) return false;

            for (const document of snapshot.docs) {
                if (!this.isCurrentOwner(userId)) return false;
                await updateDoc(document.ref, { read: true });
            }
            return true;
        } catch (error) {
            console.error('Ошибка отметки всех уведомлений:', error);
            return false;
        }
    }

    unsubscribe(key) {
        if (this.listeners[key]) {
            this.listeners[key]();
            delete this.listeners[key];
        }
    }
}
