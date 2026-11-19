import { escapeHTML } from './escape-html.js';

// Переиспользуемые UI компоненты
export class UIComponents {
    constructor() {
        this.toastContainer = null;
        this.toastSequence = 0;
    }

    // Модальное окно
    createModal({ id, title, content, size = 'md', onClose = null }) {
        const safeId = escapeHTML(id);
        const safeSize = ['sm', 'md', 'lg', 'xl'].includes(size) ? size : 'md';
        // `content` is trusted markup assembled by the caller; the title is plain text.
        const modalHTML = `
            <div class="modal fade" id="${safeId}" tabindex="-1">
                <div class="modal-dialog modal-${safeSize} modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header border-0">
                            <h5 class="modal-title fw-bold">${escapeHTML(title)}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть окно"></button>
                        </div>
                        <div class="modal-body">
                            ${content}
                        </div>
                    </div>
                </div>
            </div>
        `;
        return modalHTML;
    }

    // Toast уведомления
    showToast(message, type = 'success') {
        if (!this.toastContainer?.isConnected) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(this.toastContainer);
        }

        const icons = {
            success: 'bi-check-circle-fill',
            error: 'bi-x-circle-fill',
            warning: 'bi-exclamation-triangle-fill',
            info: 'bi-info-circle-fill'
        };

        const colors = {
            success: 'success',
            error: 'danger',
            warning: 'warning',
            info: 'primary'
        };

        const variant = Object.hasOwn(colors, type) ? type : 'info';
        const isImportant = variant === 'error' || variant === 'warning';
        const toastId = `toast-${Date.now()}-${++this.toastSequence}`;
        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-bg-${colors[variant]} border-0" role="${isImportant ? 'alert' : 'status'}" aria-live="${isImportant ? 'assertive' : 'polite'}" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi ${icons[variant]} me-2" aria-hidden="true"></i>
                        ${escapeHTML(message)}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Закрыть уведомление"></button>
                </div>
            </div>
        `;

        this.toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        const toastElement = this.toastContainer.querySelector(`#${toastId}`);
        const toast = new bootstrap.Toast(toastElement, { delay: isImportant ? 6000 : 3500 });
        toast.show();

        toastElement.addEventListener('hidden.bs.toast', () => toastElement.remove());
    }

    // Спиннер загрузки
    createLoader(size = 'md') {
        const sizes = {
            sm: 'spinner-border-sm',
            md: '',
            lg: 'spinner-border-lg'
        };
        return `
            <div class="d-flex justify-content-center align-items-center p-5">
                <div class="spinner-border ${sizes[size]} text-primary" role="status">
                    <span class="visually-hidden">Загрузка...</span>
                </div>
            </div>
        `;
    }

    // Пустое состояние
    createEmptyState({ icon, title, description, action = null }) {
        const safeIcon = /^bi-[a-z0-9-]+$/.test(String(icon)) ? icon : 'bi-info-circle';
        // `action` is trusted button markup; title and description are plain text.
        return `
            <div class="text-center py-5 fade-in-up">
                <div class="empty-state-icon mb-4">
                    <i class="bi ${safeIcon} display-1 text-muted opacity-50" aria-hidden="true"></i>
                </div>
                <h4 class="fw-bold mb-2">${escapeHTML(title)}</h4>
                <p class="text-muted mb-4">${escapeHTML(description)}</p>
                ${action ? action : ''}
            </div>
        `;
    }

    // Бейдж рейтинга
    createRatingBadge(rating) {
        const stars = [];
        for (let i = 1; i <= 5; i++) {
            stars.push(`
                <i class="bi ${i <= rating ? 'bi-star-fill' : 'bi-star'} ${i <= rating ? 'text-warning' : 'text-muted'}"></i>
            `);
        }
        return `<div class="rating-badge">${stars.join('')}</div>`;
    }
}
