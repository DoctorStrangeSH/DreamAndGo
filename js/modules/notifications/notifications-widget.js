import { escapeHTML } from '../../core/escape-html.js';
import { safeInternalRoute } from '../../core/safe-internal-route.js';

const NOTIFICATION_ROUTES = ['#friends', '#chat', '#achievements', '#profile', '#profile/:uid'];
const NOTIFICATION_COLORS = Object.freeze({
    primary: '#6C5CE7',
    success: '#00B894',
    warning: '#FDCB6E',
    danger: '#E17055',
    info: '#74b9ff'
});
const NOTIFICATION_ICONS = new Set([
    'bi-person-plus', 'bi-person-check', 'bi-chat-dots', 'bi-trophy', 'bi-star-fill'
]);

export class NotificationsWidget {
    constructor() {
        this.unsubscribe = null;
    }

    init() {
        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        this.unsubscribe = window.app.notificationsService.subscribeToNotifications(userId, (notifications) => {
            if (window.app.currentUser?.uid !== userId) return;
            this.renderDropdown(notifications);
            this.updateBadge(notifications);
        });
    }

    updateBadge(notifications) {
        const unread = notifications.filter(n => !n.read).length;
        const badge = document.getElementById('notificationsBadge');
        const bell = document.getElementById('notificationsBell');

        if (badge) {
            if (unread > 0) {
                badge.textContent = unread > 9 ? '9+' : String(unread);
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (bell) {
            bell.className = unread > 0 ? 'bi bi-bell-fill' : 'bi bi-bell';
        }
    }

    renderDropdown(notifications) {
        const container = document.getElementById('notificationsDropdown');
        if (!container) return;

        const safeNotifications = Array.isArray(notifications) ? notifications : [];
        const unread = safeNotifications.filter(n => !n.read);

        container.innerHTML = `
            <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
                <h6 class="fw-bold mb-0">Уведомления</h6>
                ${unread.length > 0 ? `
                    <button class="btn btn-link btn-sm text-decoration-none" id="markAllReadBtn">
                        Прочитать все
                    </button>
                ` : ''}
            </div>
            <div style="max-height: 350px; overflow-y: auto;">
                ${safeNotifications.length === 0 ? `
                    <div class="text-center py-4 text-muted">
                        <i class="bi bi-bell-slash fs-3"></i>
                        <p class="mt-2 small">Нет уведомлений</p>
                    </div>
                ` : safeNotifications.map(n => this.createNotificationItem(n)).join('')}
            </div>
        `;

        const userId = window.app.currentUser?.uid;
        document.getElementById('markAllReadBtn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!userId || window.app.currentUser?.uid !== userId) return;
            await window.app.notificationsService.markAllAsRead(userId);
        });

        container.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async () => {
                const notifId = item.dataset.notifId;
                const link = item.dataset.link;
                if (!userId || window.app.currentUser?.uid !== userId || !notifId) return;

                await window.app.notificationsService.markAsRead(userId, notifId);
                if (window.app.currentUser?.uid !== userId) return;
                if (link) window.app.router.navigate(link.replace(/^#/, ''));
            });
        });
    }

    createNotificationItem(notification) {
        const n = notification && typeof notification === 'object' ? notification : {};
        const time = this.formatTime(n.createdAt);
        const color = NOTIFICATION_COLORS[n.color] || NOTIFICATION_COLORS.primary;
        const icon = NOTIFICATION_ICONS.has(n.icon) ? n.icon : 'bi-bell';
        const notifId = escapeHTML(String(n.id || ''));
        const route = safeInternalRoute(n.link, NOTIFICATION_ROUTES);

        return `
            <div class="notification-item p-2 border-bottom ${n.read ? '' : 'unread'}"
                 data-notif-id="${notifId}" data-link="${escapeHTML(route)}"
                 style="cursor: pointer; transition: background 0.15s;">
                <div class="d-flex gap-2">
                    <div class="notification-icon" style="background: ${color}20; color: ${color};">
                        <i class="bi ${icon}"></i>
                    </div>
                    <div class="flex-grow-1 min-width-0">
                        <div class="d-flex justify-content-between">
                            <small class="fw-bold">${escapeHTML(n.title || 'Уведомление')}</small>
                            <small class="text-muted" style="font-size: 0.65rem;">${escapeHTML(time)}</small>
                        </div>
                        <small class="text-muted">${escapeHTML(n.message || '')}</small>
                    </div>
                    ${!n.read ? '<div class="unread-dot"></div>' : ''}
                </div>
            </div>
        `;
    }

    formatTime(date) {
        if (!date) return '';
        const now = new Date();
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return '';

        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'сейчас';
        if (diff < 3600) return `${Math.floor(diff / 60)}м`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}ч`;
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
}
