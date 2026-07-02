import { TravelService } from '../../services/travel.service.js';
import { APP_CONFIG } from '../../config/constants.js';

export class TravelsModule {
    constructor() {
        this.travelService = new TravelService();
        this.currentFilter = { type: 'all', status: 'all' };
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = window.app.ui.createLoader();

        const travels = await this.travelService.getTravels(userId, this.currentFilter);

        mainContent.innerHTML = this.getTemplate(travels);
        this.attachEventListeners();
    }

    getTemplate(travels) {
        const activeStatus = this.currentFilter.status || 'all';
        const activeType = this.currentFilter.type || 'all';

        return `
            <div class="fade-in-up">
                <div class="page-header mb-4">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="fw-bold mb-0">
                                <i class="bi bi-airplane text-primary me-2"></i>Путешествия
                            </h2>
                            <p class="text-muted mb-0">
                                ${travels.length} ${this.pluralize(travels.length, 'путешествие', 'путешествия', 'путешествий')}
                            </p>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-premium" id="addTravelBtn">
                                <i class="bi bi-plus-lg me-1"></i>Добавить
                            </button>
                        </div>
                    </div>
                </div>

                <div class="filter-bar mb-4">
                    <div class="row g-2">
                        <div class="col-auto">
                            <div class="btn-group btn-group-sm" id="statusFilters">
                                <button class="btn btn-outline-secondary ${activeStatus === 'all' ? 'active' : ''}" data-filter="all">
                                    Все
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'planned' ? 'active' : ''}" data-filter="planned">
                                    <i class="bi bi-calendar-heart me-1"></i>Планирую
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'visited' ? 'active' : ''}" data-filter="visited">
                                    <i class="bi bi-check-circle me-1"></i>Посетил
                                </button>
                            </div>
                        </div>
                        <div class="col-auto">
                            <select class="form-select form-select-sm" id="typeFilter" style="min-width: 130px;">
                                <option value="all" ${activeType === 'all' ? 'selected' : ''}>Все типы</option>
                                ${APP_CONFIG.TRAVEL_TYPES.map(type => `
                                    <option value="${type.id}" ${activeType === type.id ? 'selected' : ''}>${type.label}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <div id="travelsGrid" class="row g-3">
                    ${travels.length === 0 ? this.getEmptyState() : travels.map((t, i) => this.createCard(t, i)).join('')}
                </div>

                <div id="travelModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        return `
            <div class="col-12 text-center py-5">
                <i class="bi bi-airplane display-1 text-muted opacity-25"></i>
                <h5 class="mt-3 text-muted">Нет путешествий</h5>
                <p class="text-muted small">Добавь своё первое путешествие и начни исследовать мир!</p>
            </div>
        `;
    }

    createCard(travel, index) {
        const typeInfo = APP_CONFIG.TRAVEL_TYPES.find(t => t.id === travel.type)
            || { icon: 'bi-geo-alt', label: 'Другое' };

        const statusBadge = travel.status === 'visited'
            ? '<span class="badge bg-success bg-opacity-10 text-success">✓ Посетил</span>'
            : '<span class="badge bg-warning bg-opacity-10 text-warning">☆ Планирую</span>';

        return `
            <div class="col-12 col-md-6 col-lg-4 fade-in-up" style="animation-delay: ${index * 0.06}s">
                <div class="card-premium h-100 travel-card">
                    <div class="restaurant-card-header">
                        ${travel.photos && travel.photos[0]
                ? `<img src="${travel.photos[0]}" class="restaurant-photo" alt="${travel.title}">`
                : `<div class="restaurant-placeholder">
                                <i class="bi ${typeInfo.icon} display-4 text-white opacity-25"></i>
                            </div>`
            }
                        <div class="position-absolute top-0 start-0 p-2">${statusBadge}</div>
                        <div class="restaurant-card-actions">
                            <button class="btn btn-light btn-sm rounded-circle me-1 edit-btn" data-id="${travel.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-light btn-sm rounded-circle delete-btn" data-id="${travel.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-3">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <h6 class="fw-bold mb-0">${travel.title || 'Без названия'}</h6>
                            ${travel.rating
                ? `<span class="badge" style="background: var(--primary);">${travel.rating}/10</span>`
                : ''
            }
                        </div>
                        <p class="text-muted small mb-2">
                            <i class="bi ${typeInfo.icon} text-primary me-1"></i>${typeInfo.label}
                            ${travel.location
                ? `<span class="mx-1">·</span><i class="bi bi-geo-alt text-danger me-1"></i>${travel.location}`
                : ''
            }
                        </p>
                        ${travel.description
                ? `<p class="text-muted small mb-2">${travel.description.substring(0, 100)}...</p>`
                : ''
            }
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">
                                <i class="bi bi-wallet2 me-1"></i>
                                ${travel.budget?.planned || 0} ${travel.budget?.currency || 'RUB'}
                            </small>
                            <small class="text-muted">${this.formatDate(travel.createdAt)}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.getElementById('addTravelBtn')?.addEventListener('click', () => this.showModal(null));

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Удалить это путешествие?')) {
                    await this.travelService.deleteTravel(window.app.currentUser.uid, btn.dataset.id);
                    window.app.ui.showToast('Путешествие удалено', 'info');
                    this.render();
                    window.app.refreshUserData();
                }
            });
        });

        document.querySelectorAll('#statusFilters [data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter.status = e.target.dataset.filter;
                this.render();
            });
        });

        document.getElementById('typeFilter')?.addEventListener('change', (e) => {
            this.currentFilter.type = e.target.value;
            this.render();
        });
    }

    async showModal(travelId) {
        document.getElementById('travelModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const userId = window.app.currentUser.uid;
        const travel = travelId ? await this.travelService.getTravel(userId, travelId) : null;
        const isEdit = !!travel;

        const container = document.createElement('div');
        container.id = 'travelModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="travelModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-plus-circle'} text-primary me-2"></i>
                                ${isEdit ? 'Редактировать путешествие' : 'Новое путешествие'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="travelForm">
                                <div class="row g-3">
                                    <div class="col-md-8">
                                        <label class="form-label fw-semibold small">Название *</label>
                                        <input type="text" class="form-control" name="title"
                                               value="${travel?.title || ''}" placeholder="Например: Париж, Франция" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Тип</label>
                                        <select class="form-select" name="type">
                                            ${APP_CONFIG.TRAVEL_TYPES.map(type => `
                                                <option value="${type.id}" ${travel?.type === type.id ? 'selected' : ''}>${type.label}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Статус</label>
                                        <select class="form-select" name="status">
                                            <option value="planned" ${travel?.status === 'planned' ? 'selected' : ''}>Планирую</option>
                                            <option value="visited" ${travel?.status === 'visited' ? 'selected' : ''}>Посетил</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Местоположение</label>
                                        <input type="text" class="form-control" name="location"
                                               value="${travel?.location || ''}" placeholder="Страна, город">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Оценка</label>
                                        <div class="d-flex align-items-center gap-2 pt-2">
                                            <input type="range" class="form-range" name="rating"
                                                   min="0" max="10" value="${travel?.rating || 0}"
                                                   id="ratingSlider" style="flex: 1;">
                                            <span class="badge bg-primary" id="ratingValue">${travel?.rating || 0}/10</span>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Бюджет (план)</label>
                                        <input type="number" class="form-control" name="budgetPlanned"
                                               value="${travel?.budget?.planned || ''}" placeholder="0">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Потрачено</label>
                                        <input type="number" class="form-control" name="budgetSpent"
                                               value="${travel?.budget?.spent || ''}" placeholder="0">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Валюта</label>
                                        <select class="form-select" name="currency">
                                            <option value="RUB" ${travel?.budget?.currency === 'RUB' ? 'selected' : ''}>₽ RUB</option>
                                            <option value="USD" ${travel?.budget?.currency === 'USD' ? 'selected' : ''}>$ USD</option>
                                            <option value="EUR" ${travel?.budget?.currency === 'EUR' ? 'selected' : ''}>€ EUR</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Описание</label>
                                        <textarea class="form-control" name="description" rows="3"
                                                  placeholder="Опиши свои впечатления или планы...">${travel?.description || ''}</textarea>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">
                                            <i class="bi bi-journal-text me-1"></i>Заметки / Дневник
                                        </label>
                                        <textarea class="form-control" name="notes" rows="2"
                                                  placeholder="Личные заметки...">${travel?.notes || ''}</textarea>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="button" class="btn btn-premium" id="saveTravelBtn">
                                ${isEdit ? 'Сохранить' : 'Добавить'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalElement = document.getElementById('travelModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        modalElement.addEventListener('hidden.bs.modal', () => {
            container.remove();
            document.body.style.overflow = '';
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        });

        const ratingSlider = document.getElementById('ratingSlider');
        const ratingValue = document.getElementById('ratingValue');
        if (ratingSlider && ratingValue) {
            ratingSlider.addEventListener('input', () => {
                ratingValue.textContent = ratingSlider.value + '/10';
            });
        }

        document.getElementById('saveTravelBtn').addEventListener('click', async () => {
            const form = document.getElementById('travelForm');
            const formData = new FormData(form);

            const data = {
                title: formData.get('title'),
                type: formData.get('type'),
                status: formData.get('status'),
                location: formData.get('location'),
                description: formData.get('description'),
                budget: {
                    planned: parseInt(formData.get('budgetPlanned')) || 0,
                    spent: parseInt(formData.get('budgetSpent')) || 0,
                    currency: formData.get('currency')
                },
                rating: parseInt(formData.get('rating')) || 0,
                notes: formData.get('notes'),
                photos: travel?.photos || []
            };

            if (!data.title) {
                window.app.ui.showToast('Введи название путешествия', 'warning');
                return;
            }

            const result = isEdit
                ? await this.travelService.updateTravel(userId, travelId, data)
                : await this.travelService.addTravel(userId, data);

            if (result.success) {
                modal.hide();
                window.app.onUserAction('add_travel');
                window.app.ui.showToast(
                    isEdit ? 'Путешествие обновлено! ✈️' : 'Путешествие добавлено! 🎉',
                    'success'
                );
                setTimeout(async () => {
                    await this.render();
                }, 300);
            } else {
                window.app.ui.showToast('Ошибка сохранения', 'error');
            }
        });
    }

    pluralize(count, one, two, five) {
        if (count % 10 === 1 && count % 100 !== 11) return one;
        if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return two;
        return five;
    }

    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }
}