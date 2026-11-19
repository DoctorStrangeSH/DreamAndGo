import { RestaurantService } from '../../services/restaurant.service.js';
import { APP_CONFIG } from '../../config/constants.js';
import { escapeHTML } from '../../core/escape-html.js';
import { safeAvatarURL } from '../../core/safe-avatar-url.js';

export class RestaurantsModule {
    constructor() {
        this.restaurantService = new RestaurantService();
        this.currentFilter = { cuisine: 'all', status: 'all', rating: 0 };
        this.requestId = 0;
        this.searchQuery = '';
        this.sortOrder = 'recent';
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        const requestId = ++this.requestId;
        mainContent.innerHTML = `<div data-collection-request="restaurants-${requestId}">${window.app.ui.createLoader()}</div>`;

        try {
            const restaurants = await this.restaurantService.getRestaurants(userId, this.currentFilter, { throwOnError: true });

            if (requestId !== this.requestId || window.app.currentUser?.uid !== userId ||
                !mainContent.isConnected || !mainContent.querySelector('[data-collection-request="restaurants-' + requestId + '"]')) return;

            mainContent.innerHTML = this.getTemplate(restaurants);
            this.attachEventListeners();
        } catch (error) {
            console.error('Не удалось загрузить коллекцию ресторанов:', error);
            if (requestId !== this.requestId || window.app.currentUser?.uid !== userId ||
                !mainContent.isConnected || !mainContent.querySelector('[data-collection-request="restaurants-' + requestId + '"]')) return;

            mainContent.innerHTML = `<section class="atlas-empty" role="alert">
                <h2>Не удалось загрузить рестораны</h2>
                <p>Проверь подключение к интернету и попробуй ещё раз.</p>
                <button class="btn btn-premium" type="button" data-retry-restaurants>Повторить</button>
            </section>`;
            mainContent.querySelector('[data-retry-restaurants]')?.addEventListener('click', () => this.render());
        }
    }

    getTemplate(restaurants) {
        const activeCuisine = this.currentFilter.cuisine || 'all';
        const activeStatus = this.currentFilter.status || 'all';
        const cuisines = ['all', ...APP_CONFIG.CUISINE_TYPES];

        return `
            <div class="fade-in-up">
                <div class="page-header mb-4">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="fw-bold mb-0">
                                <i class="bi bi-shop text-success me-2"></i>Рестораны
                            </h2>
                            <p class="text-muted mb-0">
                                ${restaurants.length} ${this.pluralize(restaurants.length, 'ресторан', 'ресторана', 'ресторанов')}
                            </p>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-premium" id="addRestaurantBtn">
                                <i class="bi bi-plus-lg me-1"></i>Добавить
                            </button>
                        </div>
                    </div>
                </div>

                <div class="filter-bar mb-4">
                    <div class="row g-2">
                        <div class="col-auto">
                            <select class="form-select form-select-sm" id="cuisineFilter" style="min-width: 140px;">
                                ${cuisines.map(c => `
                                    <option value="${escapeHTML(c)}" ${activeCuisine === c ? 'selected' : ''}>
                                        ${escapeHTML(c === 'all' ? 'Все кухни' : c)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="col-auto">
                            <div class="btn-group btn-group-sm" id="statusFilters">
                                <button class="btn btn-outline-secondary ${activeStatus === 'all' ? 'active' : ''}" data-filter="all">
                                    Все
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'visited' ? 'active' : ''}" data-filter="visited">
                                    <i class="bi bi-check-circle me-1"></i>Посетил
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'want_to_visit' ? 'active' : ''}" data-filter="want_to_visit">
                                    <i class="bi bi-bookmark me-1"></i>Хочу
                                </button>
                            </div>
                        </div>
                        <div class="col-12 col-md">
                            <label class="visually-hidden" for="restaurantSearch">Найти ресторан</label>
                            <input type="search" class="form-control form-control-sm" id="restaurantSearch"
                                   placeholder="Название, кухня или адрес…" autocomplete="off"
                                   value="${escapeHTML(this.searchQuery)}">
                        </div>
                        <div class="col-12 col-sm-auto">
                            <label class="visually-hidden" for="restaurantSort">Сортировка ресторанов</label>
                            <select class="form-select form-select-sm" id="restaurantSort">
                                <option value="recent" ${this.sortOrder === 'recent' ? 'selected' : ''}>Сначала новые</option>
                                <option value="name" ${this.sortOrder === 'name' ? 'selected' : ''}>По названию</option>
                                <option value="rating" ${this.sortOrder === 'rating' ? 'selected' : ''}>По оценке</option>
                            </select>
                        </div>
                    </div>
                </div>

                <p class="text-muted small mb-3" id="restaurantSearchCount" role="status" aria-live="polite"></p>

                <div id="restaurantsGrid" class="row g-3">
                    ${restaurants.length === 0 ? this.getEmptyState() : restaurants.map((r, i) => this.createCard(r, i)).join('')}
                </div>
                <div id="restaurantSearchEmpty" class="atlas-empty atlas-empty--restaurant" hidden>
                    <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-search"></i></div>
                    <h3>Заведение не найдено</h3>
                    <p>Попробуй другое название, кухню или очисти поиск.</p>
                </div>

                <div id="restaurantModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        return `
            <div class="col-12">
                <section class="atlas-empty atlas-empty--restaurant">
                    <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-cup-hot"></i></div>
                    <h3>Впереди много вкусных открытий</h3>
                    <p>Добавь любимое заведение или место, куда давно хочется заглянуть.</p>
                </section>
            </div>
        `;
    }

    createCard(restaurant, index) {
        const statusBadge = restaurant.status === 'visited'
            ? '<span class="badge bg-success bg-opacity-10 text-success">✓ Посетил</span>'
            : '<span class="badge bg-warning bg-opacity-10 text-warning">☆ Хочу</span>';

        const imageURL = safeAvatarURL(restaurant.photos?.[0]);
        const rating = Number(restaurant.userRating);
        const safeRating = Number.isFinite(rating) && rating > 0 ? Math.min(10, Math.max(0, rating)) : 0;

        return `
            <div class="col-12 col-md-6 col-lg-4 fade-in-up" data-restaurant-card
                 data-search="${escapeHTML([restaurant.name, restaurant.cuisine, restaurant.address, restaurant.review].filter(Boolean).join(' ').toLocaleLowerCase())}"
                 data-name="${escapeHTML(String(restaurant.name || '').toLocaleLowerCase())}"
                 data-rating="${safeRating}" data-original-index="${index}"
                 style="animation-delay: ${Math.min(index, 12) * 0.06}s">
                <div class="card-premium h-100 restaurant-card">
                    <div class="restaurant-card-header">
                        ${imageURL
                ? `<img src="${escapeHTML(imageURL)}" class="restaurant-photo" alt="${escapeHTML(String(restaurant.name || 'Ресторан'))}" loading="lazy">`
                : `<div class="restaurant-placeholder">
                                <i class="bi bi-shop display-4 text-white opacity-25"></i>
                            </div>`
            }
                        <div class="position-absolute top-0 start-0 p-2">${statusBadge}</div>
                        <div class="restaurant-card-actions">
                            <button type="button" class="btn btn-light btn-sm rounded-circle me-1 edit-btn" aria-label="Редактировать ресторан" data-id="${escapeHTML(String(restaurant.id))}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button type="button" class="btn btn-light btn-sm rounded-circle delete-btn" aria-label="Удалить ресторан" data-id="${escapeHTML(String(restaurant.id))}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-3">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <h6 class="fw-bold mb-0">${escapeHTML(String(restaurant.name || 'Без названия'))}</h6>
                            ${safeRating
                ? `<span class="badge" style="background: var(--primary);">${safeRating}/10</span>`
                : ''
            }
                        </div>
                        <p class="text-muted small mb-2">
                            <i class="bi bi-egg-fried me-1"></i>${escapeHTML(String(restaurant.cuisine || 'Кухня не указана'))}
                            ${restaurant.address
                ? `<span class="mx-1">·</span><i class="bi bi-geo-alt me-1"></i>${escapeHTML(String(restaurant.address))}`
                : ''
            }
                        </p>
                        ${restaurant.review
                ? `<p class="text-muted small mb-2">${escapeHTML(String(restaurant.review).substring(0, 100))}...</p>`
                : ''
            }
                        ${restaurant.favoriteDishes && restaurant.favoriteDishes.length
                ? `<p class="small mb-0">
                                <i class="bi bi-heart me-1 text-danger"></i>${escapeHTML(restaurant.favoriteDishes.slice(0, 2).join(', '))}
                            </p>`
                : ''
            }
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const searchInput = document.getElementById('restaurantSearch');
        searchInput?.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            this.applySearchAndSort();
        });
        document.getElementById('restaurantSort')?.addEventListener('change', (event) => {
            this.sortOrder = event.target.value;
            this.applySearchAndSort();
        });
        this.applySearchAndSort();
        document.getElementById('addRestaurantBtn')?.addEventListener('click', () => this.showModal(null));

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.disabled || !confirm('Удалить ресторан?')) return;
                btn.disabled = true;
                try {
                    const result = await this.restaurantService.deleteRestaurant(window.app.currentUser.uid, btn.dataset.id);
                    if (!result?.success) throw new Error('Удаление не выполнено');
                    window.app.ui.showToast('Ресторан удалён', 'info');
                    await this.render();
                    window.app.refreshUserData();
                } catch (error) {
                    console.error('Не удалось удалить ресторан:', error);
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

        document.getElementById('cuisineFilter')?.addEventListener('change', (e) => {
            this.currentFilter.cuisine = e.target.value;
            this.render();
        });
    }

    applySearchAndSort() {
        const query = this.searchQuery.trim().toLocaleLowerCase();
        const grid = document.getElementById('restaurantsGrid');
        if (!grid) return;
        const cards = [...grid.querySelectorAll('[data-restaurant-card]')];
        const sorted = [...cards].sort((a, b) => {
            if (this.sortOrder === 'name') return a.dataset.name.localeCompare(b.dataset.name, 'ru') || Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
            if (this.sortOrder === 'rating') return Number(b.dataset.rating) - Number(a.dataset.rating) || Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
            return Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
        });
        for (const card of sorted) grid.appendChild(card);
        let matches = 0;
        for (const card of cards) {
            const visible = !query || card.dataset.search.includes(query);
            card.hidden = !visible;
            if (visible) matches++;
        }
        const empty = document.getElementById('restaurantSearchEmpty');
        if (empty) empty.hidden = !query || matches > 0 || cards.length === 0;
        const count = document.getElementById('restaurantSearchCount');
        if (count) count.textContent = query && cards.length ? `Найдено: ${matches} из ${cards.length}` : '';
    }

    async showModal(restaurantId) {
        document.getElementById('restaurantModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const userId = window.app.currentUser.uid;
        const restaurant = restaurantId
            ? await this.restaurantService.getRestaurant(userId, restaurantId)
            : null;
        const isEdit = !!restaurant;

        const container = document.createElement('div');
        container.id = 'restaurantModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="restaurantModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-plus-circle'} text-success me-2"></i>
                                ${isEdit ? 'Редактировать ресторан' : 'Новый ресторан'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="restaurantForm">
                                <div class="row g-3">
                                    <div class="col-md-8">
                                        <label for="restaurantPrimaryField" class="form-label fw-semibold small">Название *</label>
                                        <input type="text" class="form-control" id="restaurantPrimaryField" name="name"
                                               value="${escapeHTML(String(restaurant?.name || ''))}" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Кухня</label>
                                        <select class="form-select" name="cuisine">
                                            <option value="">Выбери кухню</option>
                                            ${APP_CONFIG.CUISINE_TYPES.map(c => `
                                                <option value="${escapeHTML(c)}" ${restaurant?.cuisine === c ? 'selected' : ''}>${escapeHTML(c)}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-semibold small">Статус</label>
                                        <select class="form-select" name="status">
                                            <option value="want_to_visit" ${restaurant?.status === 'want_to_visit' ? 'selected' : ''}>
                                                Хочу посетить
                                            </option>
                                            <option value="visited" ${restaurant?.status === 'visited' ? 'selected' : ''}>
                                                Посетил
                                            </option>
                                        </select>
                                    </div>
                                    <div class="col-12 atlas-form-extras"><details class="atlas-form-details" ${isEdit ? 'open' : ''}>
                                        <summary>Адрес, посещение и впечатления</summary>
                                        <div class="row g-3 mt-1">
                                    <div class="col-md-6">
                                        <label class="form-label fw-semibold small">Адрес</label>
                                        <input type="text" class="form-control" name="address"
                                               value="${escapeHTML(String(restaurant?.address || ''))}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Дата посещения</label>
                                        <input type="date" class="form-control" name="visitDate"
                                               value="${escapeHTML(String(restaurant?.visitDate || ''))}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Средний чек</label>
                                        <input type="number" class="form-control" name="avgBill"
                                               value="${escapeHTML(String(restaurant?.avgBill || ''))}" placeholder="₽">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Моя оценка</label>
                                        <div class="d-flex align-items-center gap-2 pt-2">
                                            <input type="range" class="form-range" name="userRating"
                                                   min="0" max="10" value="${Number.isFinite(Number(restaurant?.userRating)) ? Math.min(10, Math.max(0, Number(restaurant.userRating))) : 0}"
                                                   id="ratingSlider" style="flex: 1;">
                                            <span class="badge bg-primary" id="ratingValue">
                                                ${Number.isFinite(Number(restaurant?.userRating)) ? Math.min(10, Math.max(0, Number(restaurant.userRating))) : 0}/10
                                            </span>
                                        </div>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Любимые блюда</label>
                                        <input type="text" class="form-control" name="favoriteDishes"
                                               value="${escapeHTML(Array.isArray(restaurant?.favoriteDishes) ? restaurant.favoriteDishes.join(', ') : '')}"
                                               placeholder="Через запятую: паста, пицца, тирамису">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Рецензия</label>
                                        <textarea class="form-control" name="review" rows="3"
                                                  placeholder="Твои впечатления...">${escapeHTML(String(restaurant?.review || ''))}</textarea>
                                    </div>
                                        </div>
                                    </details></div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="button" class="btn btn-premium" id="saveRestaurantBtn">
                                ${isEdit ? 'Сохранить' : 'Добавить'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalElement = document.getElementById('restaurantModal');
        const modal = new bootstrap.Modal(modalElement);
        modalElement.addEventListener('shown.bs.modal', () => {
            modalElement.querySelector('#restaurantPrimaryField')?.focus();
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

        document.getElementById('saveRestaurantBtn').addEventListener('click', async (event) => {
            const saveButton = event.currentTarget;
            if (saveButton.disabled) return;
            const form = document.getElementById('restaurantForm');
            if (!form.reportValidity()) return;
            const formData = new FormData(form);

            const data = {
                name: String(formData.get('name') || '').trim(),
                cuisine: formData.get('cuisine'),
                status: formData.get('status'),
                address: formData.get('address'),
                visitDate: formData.get('visitDate'),
                avgBill: parseInt(formData.get('avgBill')) || 0,
                userRating: parseInt(formData.get('userRating')) || 0,
                favoriteDishes: formData.get('favoriteDishes')
                    .split(',')
                    .map(d => d.trim())
                    .filter(Boolean),
                review: formData.get('review'),
                photos: restaurant?.photos || []
            };

            if (!data.name) {
                form.querySelector('#restaurantPrimaryField')?.focus();
                window.app.ui.showToast('Введи название ресторана', 'warning');
                return;
            }

            saveButton.disabled = true;
            saveButton.setAttribute('aria-busy', 'true');
            try {
            const result = isEdit
                ? await this.restaurantService.updateRestaurant(userId, restaurantId, data)
                : await this.restaurantService.addRestaurant(userId, data);

            if (result.success) {
                modal.hide();
                window.app.onUserAction('add_restaurant');
                window.app.ui.showToast(
                    isEdit ? 'Ресторан обновлён! 🍽️' : 'Ресторан добавлен! 🎉',
                    'success'
                );
                setTimeout(async () => {
                    await this.render();
                }, 300);
            } else {
                window.app.ui.showToast('Не удалось сохранить ресторан. Попробуй снова.', 'error');
            }
            } catch (error) {
                console.error('Ошибка сохранения ресторан:', error);
                window.app.ui.showToast('Не удалось сохранить ресторан. Попробуй снова.', 'error');
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
}
