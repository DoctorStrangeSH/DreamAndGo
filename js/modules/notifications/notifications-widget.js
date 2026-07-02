export class NotificationsWidget {
    constructor() {
        this.unsubscribe = null;
    }

    init() {
        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        this.unsubscribe = window.app.notificationsService.subscribeToNotifications(userId, (notifications) => {
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
                badge.textContent = unread > 9 ? '9+' : unread;
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

        const unread = notifications.filter(n => !n.read);

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
                ${notifications.length === 0 ? `
                    <div class="text-center py-4 text-muted">
                        <i class="bi bi-bell-slash fs-3"></i>
                        <p class="mt-2 small">Нет уведомлений</p>
                    </div>
                ` : notifications.map(n => this.createNotificationItem(n)).join('')}
            </div>
        `;

        document.getElementById('markAllReadBtn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await window.app.notificationsService.markAllAsRead(window.app.currentUser.uid);
        });

        container.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const notifId = item.dataset.notifId;
                const link = item.dataset.link;
                
                await window.app.notificationsService.markAsRead(window.app.currentUser.uid, notifId);
                
                if (link) {
                    window.app.router.navigate(link.replace('#', ''));
                }
            });
        });
    }

    createNotificationItem(n) {
        const time = this.formatTime(n.createdAt);
        const colors = {
            primary: '#6C5CE7', success: '#00B894', warning: '#FDCB6E',
            danger: '#E17055', info: '#74b9ff'
        };

        return `
            <div class="notification-item p-2 border-bottom ${!n.read ? 'unread' : ''}" 
                 data-notif-id="${n.id}" data-link="${n.link || ''}"
                 style="cursor: pointer; transition: background 0.15s;">
                <div class="d-flex gap-2">
                    <div class="notification-icon" style="background: ${colors[n.color] || colors.primary}20; color: ${colors[n.color] || colors.primary};">
                        <i class="bi ${n.icon}"></i>
                    </div>
                    <div class="flex-grow-1 min-width-0">
                        <div class="d-flex justify-content-between">
                            <small class="fw-bold">${n.title}</small>
                            <small class="text-muted" style="font-size: 0.65rem;">${time}</small>
                        </div>
                        <small class="text-muted">${n.message}</small>
                    </div>
                    ${!n.read ? `<div class="unread-dot"></div>` : ''}
                </div>
            </div>
        `;
    }

    formatTime(date) {
        if (!date) return '';
        const now = new Date();
        const d = new Date(date);
        const diff = Math.floor((now - d) / 1000);

        if (diff < 60) return 'сейчас';
        if (diff < 3600) return `${Math.floor(diff / 60)}м`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}ч`;
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    destroy() {
        if (this.unsubscribe) this.unsubscribe();
    }
}