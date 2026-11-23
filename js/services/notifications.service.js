import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const REFRESH_INTERVAL_MS = 30000;

function backendReady() {
    return document.querySelector('meta[name="firebase-functions-backend-ready"]')
        ?.content?.trim().toLowerCase() === 'true';
}

export class NotificationsService {
    constructor() {
        this.listeners = {};
        this.callables = null;

        if (app && appCheck && backendReady()) {
            const functions = getFunctions(app, 'europe-west3');
            this.callables = {
                list: httpsCallable(functions, 'getMyNotificationsV1'),
                markRead: httpsCallable(functions, 'markNotificationReadV1'),
                markAllRead: httpsCallable(functions, 'markAllNotificationsReadV1')
            };
        }
    }

    get isReady() {
        return Boolean(this.callables);
    }

    async fetchNotifications() {
        if (!this.callables) {
            throw new Error('Защищённая загрузка уведомлений пока не подключена.');
        }

        const result = await this.callables.list({});
        const notifications = result?.data?.notifications;
        if (!Array.isArray(notifications)) {
            throw new Error('Сервер вернул некорректный список уведомлений.');
        }
        return notifications;
    }

    subscribeToNotifications(userId, callback, onError = () => {}) {
        this.unsubscribe(`notifications_${userId}`);
        const key = `notifications_${userId}`;

        if (!this.callables || !userId) {
            callback([]);
            return () => {};
        }

        let active = true;
        let loading = false;

        const refresh = async () => {
            if (!active || loading) return;
            loading = true;
            try {
                const notifications = await this.fetchNotifications();
                if (active) callback(notifications);
            } catch (error) {
                console.error('Ошибка загрузки уведомлений:', error);
                if (active) onError(error);
            } finally {
                loading = false;
            }
        };

        void refresh();
        const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
        const subscription = {
            callback,
            stop: () => {
                active = false;
                window.clearInterval(timer);
            }
        };
        this.listeners[key] = subscription;
        return () => this.unsubscribe(key);
    }

    async markAsRead(userId, notificationId) {
        if (!this.callables || !userId || !notificationId) {
            return { success: false, error: 'Защищённые уведомления пока недоступны.' };
        }
        try {
            const result = await this.callables.markRead({ notificationId });
            if (result?.data?.success !== true) throw new Error('Некорректный ответ сервера');
            await this.refreshUserNotifications(userId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка отметки уведомления:', error);
            return { success: false, error: 'Не удалось отметить уведомление прочитанным.' };
        }
    }

    async markAllAsRead(userId) {
        if (!this.callables || !userId) {
            return { success: false, error: 'Защищённые уведомления пока недоступны.' };
        }
        try {
            const result = await this.callables.markAllRead({});
            if (result?.data?.success !== true) throw new Error('Некорректный ответ сервера');
            await this.refreshUserNotifications(userId);
            return { success: true, updated: result.data.updated || 0 };
        } catch (error) {
            console.error('Ошибка отметки всех уведомлений:', error);
            return { success: false, error: 'Не удалось отметить уведомления прочитанными.' };
        }
    }

    async refreshUserNotifications(userId) {
        const key = `notifications_${userId}`;
        if (!this.listeners[key]) return;
        const subscription = this.listeners[key];
        if (!subscription) return;
        try {
            const notifications = await this.fetchNotifications();
            if (this.listeners[key] === subscription) subscription.callback(notifications);
        } catch (error) {
            console.error('Ошибка обновления уведомлений:', error);
        }
    }

    unsubscribe(key) {
        if (this.listeners[key]) {
            this.listeners[key].stop();
            delete this.listeners[key];
        }
    }

    unsubscribeAll() {
        Object.keys(this.listeners).forEach(key => this.unsubscribe(key));
    }
}
