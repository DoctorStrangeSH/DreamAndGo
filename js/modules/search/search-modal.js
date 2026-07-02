import { SearchService } from '../../services/search.service.js';

export class SearchModal {
    constructor() {
        this.searchService = new SearchService();
    }

    show() {
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
                                <button class="btn btn-close" data-bs-dismiss="modal"></button>
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
            container.remove();
            document.body.style.overflow = '';
        });

        let searchTimeout;
        document.getElementById('searchModalInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.search(e.target.value), 300);
        });

        document.getElementById('searchModalInput').focus();
    }

    async search(query) {
        const resultsContainer = document.getElementById('searchModalResults');
        if (!resultsContainer) return;

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

        const results = await this.searchService.searchAll(window.app.currentUser.uid, query);

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-emoji-frown fs-3"></i>
                    <p class="mt-2">Ничего не найдено</p>
                </div>
            `;
            return;
        }

        const colors = {
            primary: '#6C5CE7', success: '#00B894', warning: '#FDCB6E', danger: '#E17055', info: '#74b9ff'
        };

        resultsContainer.innerHTML = results.map(r => `
            <div class="search-result-item p-3 border-bottom" data-link="${r.link}" style="cursor: pointer;">
                <div class="d-flex align-items-center gap-3">
                    <div class="search-type-badge" style="background: ${colors[r.color]}20; color: ${colors[r.color]};">
                        <i class="bi ${r.icon}"></i>
                    </div>
                    <div class="flex-grow-1 min-width-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="fw-bold mb-0 text-truncate">${r.title || 'Без названия'}</h6>
                            <small class="badge bg-light text-dark">${r.typeName}</small>
                        </div>
                        <p class="text-muted small mb-0 text-truncate">
                            ${r.description || r.location || ''}
                        </p>
                    </div>
                </div>
            </div>
        `).join('');

        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const link = item.dataset.link;
                bootstrap.Modal.getInstance(document.getElementById('searchModal')).hide();
                if (link) window.app.router.navigate(link.replace('#', ''));
            });
        });
    }
}