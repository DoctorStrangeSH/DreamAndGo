import { SearchService } from '../../services/search.service.js';
import { escapeHTML } from '../../core/escape-html.js';
import { safeInternalRoute } from '../../core/safe-internal-route.js';

const SEARCH_ROUTES = ['#travels', '#food', '#movies', '#books', '#dreams'];
const SEARCH_COLORS = Object.freeze({
    primary: '#6C5CE7',
    success: '#00B894',
    warning: '#FDCB6E',
    danger: '#E17055',
    info: '#74b9ff'
});
const SEARCH_ICONS = new Set(['bi-airplane', 'bi-shop', 'bi-film', 'bi-book', 'bi-star']);

export class SearchModal {
    constructor() {
        this.searchService = new SearchService();
        this.searchRequestId = 0;
    }

    show() {
        this.searchRequestId++;
        document.getElementById('searchModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');

        const container = document.createElement('div');
        container.id = 'searchModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="searchModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header border-0 pb-0">
                            <div class="input-group">
                                <span class="input-group-text bg-transparent border-0">
                                    <i class="bi bi-search fs-5"></i>
                                </span>
                                <input type="text" class="form-control border-0 fs-5" id="searchModalInput"
                                       placeholder="Поиск по всему..." autofocus>
                                <button class="btn btn-close" data-bs-dismiss="modal" aria-label="Закрыть поиск"></button>
                            </div>
                        </div>
                        <div class="modal-body pt-0" id="searchModalResults">
                            <div class="text-center text-muted py-4">
                                <i class="bi bi-search display-4 opacity-25"></i>
                                <p class="mt-2">Начни вводить для поиска</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalElement = document.getElementById('searchModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        modalElement.addEventListener('hidden.bs.modal', () => {
            this.searchRequestId++;
            container.remove();
            document.body.style.overflow = '';
        });

        let searchTimeout;
        const input = document.getElementById('searchModalInput');
        input.addEventListener('input', (event) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.search(event.target.value), 300);
        });
        input.focus();
    }

    async search(query) {
        const resultsContainer = document.getElementById('searchModalResults');
        const userId = window.app.currentUser?.uid;
        const requestId = ++this.searchRequestId;
        if (!resultsContainer || !userId) return;

        if (!query.trim()) {
            resultsContainer.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-search display-4 opacity-25"></i>
                    <p class="mt-2">Начни вводить для поиска</p>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>';

        let results;
        try {
            results = await this.searchService.searchAll(userId, query);
        } catch (error) {
            console.error('Ошибка поиска по коллекциям:', error);
            if (requestId === this.searchRequestId && window.app.currentUser?.uid === userId && resultsContainer.isConnected) {
                resultsContainer.innerHTML = '<div class="alert alert-warning" role="status">Не удалось выполнить поиск. Попробуй ещё раз.</div>';
            }
            return;
        }

        if (requestId !== this.searchRequestId || window.app.currentUser?.uid !== userId ||
            !resultsContainer.isConnected || !document.getElementById('searchModal')) return;

        if (!Array.isArray(results) || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-emoji-frown fs-3"></i>
                    <p class="mt-2">Ничего не найдено</p>
                </div>
            `;
            return;
        }

        resultsContainer.innerHTML = results.map(result => this.createResultItem(result)).join('');

        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const link = item.dataset.link;
                const modalElement = document.getElementById('searchModal');
                bootstrap.Modal.getInstance(modalElement)?.hide();
                if (link) window.app.router.navigate(link.replace(/^#/, ''));
            });
        });
    }

    createResultItem(result) {
        const r = result && typeof result === 'object' ? result : {};
        const color = SEARCH_COLORS[r.color] || SEARCH_COLORS.primary;
        const icon = SEARCH_ICONS.has(r.icon) ? r.icon : 'bi-search';
        const link = safeInternalRoute(r.link, SEARCH_ROUTES);

        return `
            <div class="search-result-item p-3 border-bottom" data-link="${escapeHTML(link)}" style="cursor: pointer;">
                <div class="d-flex align-items-center gap-3">
                    <div class="search-type-badge" style="background: ${color}20; color: ${color};">
                        <i class="bi ${icon}"></i>
                    </div>
                    <div class="flex-grow-1 min-width-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="fw-bold mb-0 text-truncate">${escapeHTML(r.title || 'Без названия')}</h6>
                            <small class="badge bg-light text-dark">${escapeHTML(r.typeName || '')}</small>
                        </div>
                        <p class="text-muted small mb-0 text-truncate">
                            ${escapeHTML(r.description || r.location || '')}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}
