import { TravelService } from '../../services/travel.service.js';
import { escapeHTML } from '../../core/escape-html.js';
import { safeAvatarURL } from '../../core/safe-avatar-url.js';
import { APP_CONFIG } from '../../config/constants.js';

export class TravelsModule {
    constructor() {
        this.travelService = new TravelService();
        this.currentFilter = { type: 'all', status: 'all' };
        this.requestId = 0;
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        const requestId = ++this.requestId;
        mainContent.innerHTML = `<div data-collection-request="travels-${requestId}">${window.app.ui.createLoader()}</div>`;

        try {
            const travels = await this.travelService.getTravels(userId, this.currentFilter, { throwOnError: true });

            if (requestId !== this.requestId || window.app.currentUser?.uid !== userId ||
                !mainContent.isConnected || !mainContent.querySelector('[data-collection-request="travels-' + requestId + '"]')) return;

            mainContent.innerHTML = this.getTemplate(travels);
            this.attachEventListeners();
        } catch (error) {
            console.error('Не удалось загрузить коллекцию путешествий:', error);
            if (requestId !== this.requestId || window.app.currentUser?.uid !== userId ||
                !mainContent.isConnected || !mainContent.querySelector('[data-collection-request="travels-' + requestId + '"]')) return;

            mainContent.innerHTML = `<section class="atlas-empty" role="alert">
                <h2>Не удалось загрузить путешествия</h2>
                <p>Проверь подключение к интернету и попробуй ещё раз.</p>
                <button class="btn btn-premium" type="button" data-retry-travels>Повторить</button>
            </section>`;
            mainContent.querySelector('[data-retry-travels]')?.addEventListener('click', () => this.render());
        }
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
                                    <option value="${escapeHTML(String(type.id))}" ${activeType === type.id ? 'selected' : ''}>${escapeHTML(String(type.label))}</option>
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
        const hasFilter = this.currentFilter.status !== 'all' || this.currentFilter.type !== 'all';
        if (hasFilter) return `
            <div class="col-12"><section class="atlas-empty atlas-empty--travel" aria-label="Нет результатов по фильтрам">
                <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-funnel"></i></div>
                <h3>По этим фильтрам пока ничего нет</h3>
                <p>Попробуй выбрать другой статус или категорию — твои записи никуда не исчезли.</p>
            </section></div>
        `;
        return `
            <div class="col-12">
                <section class="atlas-empty atlas-empty--travel" aria-labelledby="travel-empty-title">
                    <div class="atlas-empty-art" aria-hidden="true"><span class="atlas-empty-orbit"></span><i class="bi bi-compass"></i><span class="atlas-empty-spark atlas-empty-spark--one">✦</span><span class="atlas-empty-spark atlas-empty-spark--two">✧</span></div>
                    <span class="atlas-empty-kicker">Карта приключений</span>
                    <h3 id="travel-empty-title">Твой следующий маршрут ещё впереди</h3>
                    <p>Сохраняй места, куда мечтаешь попасть, и собирай историю своих открытий.</p>
                    <button type="button" class="btn btn-premium atlas-empty-action" id="emptyAddTravelBtn"><i class="bi bi-plus-lg me-2"></i>Добавить путешествие</button>
                </section>
            </div>
        `;
    }

    createCard(travel, index) {
        const typeInfo = APP_CONFIG.TRAVEL_TYPES.find(t => t.id === travel.type)
            || { icon: 'bi-geo-alt', label: 'Другое' };

        const photoURL = safeAvatarURL(Array.isArray(travel.photos) ? travel.photos[0] : '');
        const rawRating = Number(travel.rating);
        const safeRating = Number.isFinite(rawRating) && rawRating > 0 ? Math.min(10, Math.max(0, rawRating)) : 0;

        const statusBadge = travel.status === 'visited'
            ? '<span class="badge bg-success bg-opacity-10 text-success">✓ Посетил</span>'
            : '<span class="badge bg-warning bg-opacity-10 text-warning">☆ Планирую</span>';

        return `
            <div class="col-12 col-md-6 col-lg-4 fade-in-up" style="animation-delay: ${Math.min(index, 12) * 0.06}s">
                <div class="card-premium h-100 travel-card">
                    <div class="restaurant-card-header">
                        ${photoURL
                ? `<img src="${escapeHTML(photoURL)}" class="restaurant-photo" alt="${escapeHTML(String(travel.title || 'Путешествие'))}" loading="lazy">`
                : `<div class="restaurant-placeholder">
                                <i class="bi ${typeInfo.icon} display-4 text-white opacity-25"></i>
                            </div>`
            }
                        <div class="position-absolute top-0 start-0 p-2">${statusBadge}</div>
                        <div class="restaurant-card-actions">
                            <button class="btn btn-light btn-sm rounded-circle me-1 edit-btn" aria-label="Редактировать запись" title="Редактировать" data-id="${escapeHTML(travel.id)}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-light btn-sm rounded-circle delete-btn" aria-label="Удалить запись" title="Удалить" data-id="${escapeHTML(travel.id)}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-3">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <h6 class="fw-bold mb-0">${escapeHTML(travel.title || 'Без названия')}</h6>
                            ${safeRating
                ? `<span class="badge" style="background: var(--primary);">${safeRating}/10</span>`
                : ''
            }
                        </div>
                        <p class="text-muted small mb-2">
                            <i class="bi ${typeInfo.icon} text-primary me-1"></i>${escapeHTML(typeInfo.label)}
                            ${travel.location
                ? `<span class="mx-1">·</span><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHTML(travel.location)}`
                : ''
            }
                        </p>
                        ${travel.description
                ? `<p class="text-muted small mb-2">${escapeHTML(String(travel.description).substring(0, 100))}${String(travel.description).length > 100 ? '…' : ''}</p>`
                : ''
            }
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">
                                <i class="bi bi-wallet2 me-1"></i>
                                ${escapeHTML(travel.budget?.planned || 0)} ${escapeHTML(travel.budget?.currency || 'RUB')}
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
        document.getElementById('emptyAddTravelBtn')?.addEventListener('click', () => this.showModal(null));

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.disabled || !confirm('Удалить это путешествие?')) return;
                btn.disabled = true;
                try {
                    const result = await this.travelService.deleteTravel(window.app.currentUser.uid, btn.dataset.id);
                    if (!result?.success) throw new Error('Удаление не выполнено');
                    window.app.ui.showToast('Путешествие удалено', 'info');
                    await this.render();
                    window.app.refreshUserData();
                } catch (error) {
                    console.error('Не удалось удалить путешествие:', error);
                    window.app.ui.showToast('Не удалось удалить запись. Попробуй снова.', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        });

        document.querySelectorAll('#statusFilters [data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter.status = e.currentTarget.dataset.filter;
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
                                        <label for="travelPrimaryField" class="form-label fw-semibold small">Название *</label>
                                        <input type="text" class="form-control" id="travelPrimaryField" name="title"
                                               value="${escapeHTML(String(travel?.title || ''))}" placeholder="Например: Париж, Франция" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Тип</label>
                                        <select class="form-select" name="type">
                                            ${APP_CONFIG.TRAVEL_TYPES.map(type => `
                                                <option value="${escapeHTML(String(type.id))}" ${travel?.type === type.id ? 'selected' : ''}>${escapeHTML(String(type.label))}</option>
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
                                    <div class="col-12 atlas-form-extras"><details class="atlas-form-details" ${isEdit ? 'open' : ''}>
                                        <summary>Маршрут, бюджет и впечатления</summary>
                                        <div class="row g-3 mt-1">
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Местоположение</label>
                                        <input type="text" class="form-control" name="location"
                                               value="${escapeHTML(String(travel?.location || ''))}" placeholder="Страна, город">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Оценка</label>
                                        <div class="d-flex align-items-center gap-2 pt-2">
                                            <input type="range" class="form-range" name="rating"
                                                   min="0" max="10" value="${Number.isFinite(Number(travel?.rating)) ? Math.min(10, Math.max(0, Number(travel.rating))) : 0}"
                                                   id="ratingSlider" style="flex: 1;">
                                            <span class="badge bg-primary" id="ratingValue">${Number.isFinite(Number(travel?.rating)) ? Math.min(10, Math.max(0, Number(travel.rating))) : 0}/10</span>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Бюджет (план)</label>
                                        <input type="number" class="form-control" name="budgetPlanned"
                                               value="${escapeHTML(String(travel?.budget?.planned || ''))}" placeholder="0">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Потрачено</label>
                                        <input type="number" class="form-control" name="budgetSpent"
                                               value="${escapeHTML(String(travel?.budget?.spent || ''))}" placeholder="0">
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
                                                  placeholder="Опиши свои впечатления или планы...">${escapeHTML(String(travel?.description || ''))}</textarea>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">
                                            <i class="bi bi-journal-text me-1"></i>Заметки / Дневник
                                        </label>
                                        <textarea class="form-control" name="notes" rows="2"
                                                  placeholder="Личные заметки...">${escapeHTML(String(travel?.notes || ''))}</textarea>
                                    </div>
                                        </div>
                                    </details></div>
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
        modalElement.addEventListener('shown.bs.modal', () => {
            modalElement.querySelector('#travelPrimaryField')?.focus();
        }, { once: true });
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

        document.getElementById('saveTravelBtn').addEventListener('click', async (event) => {
            const saveButton = event.currentTarget;
            if (saveButton.disabled) return;
            const form = document.getElementById('travelForm');
            if (!form.reportValidity()) return;
            const formData = new FormData(form);

            const data = {
                title: String(formData.get('title') || '').trim(),
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
                form.querySelector('#travelPrimaryField')?.focus();
                window.app.ui.showToast('Введи название путешествия', 'warning');
                return;
            }

            saveButton.disabled = true;
            saveButton.setAttribute('aria-busy', 'true');
            try {
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
                window.app.ui.showToast('Не удалось сохранить путешествие. Попробуй снова.', 'error');
            }
            } catch (error) {
                console.error('Ошибка сохранения путешествие:', error);
                window.app.ui.showToast('Не удалось сохранить путешествие. Попробуй снова.', 'error');
            } finally {
                saveButton.disabled = false;
                saveButton.removeAttribute('aria-busy');
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