import { RestaurantService } from '../../services/restaurant.service.js';
import { APP_CONFIG } from '../../config/constants.js';

export class RestaurantsModule {
    constructor() {
        this.restaurantService = new RestaurantService();
        this.currentFilter = { cuisine: 'all', status: 'all', rating: 0 };
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = window.app.ui.createLoader();

        const restaurants = await this.restaurantService.getRestaurants(userId, this.currentFilter);

        mainContent.innerHTML = this.getTemplate(restaurants);
        this.attachEventListeners();
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
                                    <option value="${c}" ${activeCuisine === c ? 'selected' : ''}>
                                        ${c === 'all' ? 'Все кухни' : c}
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
                    </div>
                </div>

                <div id="restaurantsGrid" class="row g-3">
                    ${restaurants.length === 0 ? this.getEmptyState() : restaurants.map((r, i) => this.createCard(r, i)).join('')}
                </div>

                <div id="restaurantModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        return `
            <div class="col-12 text-center py-5">
                <i class="bi bi-shop display-1 text-muted opacity-25"></i>
                <h5 class="mt-3 text-muted">Нет ресторанов</h5>
                <p class="text-muted small">Добавь свой первый ресторан</p>
            </div>
        `;
    }

    createCard(restaurant, index) {
        const statusBadge = restaurant.status === 'visited'
            ? '<span class="badge bg-success bg-opacity-10 text-success">✓ Посетил</span>'
            : '<span class="badge bg-warning bg-opacity-10 text-warning">☆ Хочу</span>';

        return `
            <div class="col-12 col-md-6 col-lg-4 fade-in-up" style="animation-delay: ${index * 0.06}s">
                <div class="card-premium h-100 restaurant-card">
                    <div class="restaurant-card-header">
                        ${restaurant.photos && restaurant.photos[0]
                ? `<img src="${restaurant.photos[0]}" class="restaurant-photo" alt="${restaurant.name}">`
                : `<div class="restaurant-placeholder">
                                <i class="bi bi-shop display-4 text-white opacity-25"></i>
                            </div>`
            }
                        <div class="position-absolute top-0 start-0 p-2">${statusBadge}</div>
                        <div class="restaurant-card-actions">
                            <button class="btn btn-light btn-sm rounded-circle me-1 edit-btn" data-id="${restaurant.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-light btn-sm rounded-circle delete-btn" data-id="${restaurant.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-3">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <h6 class="fw-bold mb-0">${restaurant.name || 'Без названия'}</h6>
                            ${restaurant.userRating
                ? `<span class="badge" style="background: var(--primary);">${restaurant.userRating}/10</span>`
                : ''
            }
                        </div>
                        <p class="text-muted small mb-2">
                            <i class="bi bi-egg-fried me-1"></i>${restaurant.cuisine || 'Кухня не указана'}
                            ${restaurant.address
                ? `<span class="mx-1">·</span><i class="bi bi-geo-alt me-1"></i>${restaurant.address}`
                : ''
            }
                        </p>
                        ${restaurant.review
                ? `<p class="text-muted small mb-2">${restaurant.review.substring(0, 100)}...</p>`
                : ''
            }
                        ${restaurant.favoriteDishes && restaurant.favoriteDishes.length
                ? `<p class="small mb-0">
                                <i class="bi bi-heart me-1 text-danger"></i>${restaurant.favoriteDishes.slice(0, 2).join(', ')}
                            </p>`
                : ''
            }
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
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
                if (confirm('Удалить ресторан?')) {
                    await this.restaurantService.deleteRestaurant(window.app.currentUser.uid, btn.dataset.id);
                    window.app.ui.showToast('Ресторан удалён', 'info');
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

        document.getElementById('cuisineFilter')?.addEventListener('change', (e) => {
            this.currentFilter.cuisine = e.target.value;
            this.render();
        });
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
                                        <label class="form-label fw-semibold small">Название *</label>
                                        <input type="text" class="form-control" name="name"
                                               value="${restaurant?.name || ''}" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Кухня</label>
                                        <select class="form-select" name="cuisine">
                                            <option value="">Выбери кухню</option>
                                            ${APP_CONFIG.CUISINE_TYPES.map(c => `
                                                <option value="${c}" ${restaurant?.cuisine === c ? 'selected' : ''}>${c}</option>
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
                                    <div class="col-md-6">
                                        <label class="form-label fw-semibold small">Адрес</label>
                                        <input type="text" class="form-control" name="address"
                                               value="${restaurant?.address || ''}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Дата посещения</label>
                                        <input type="date" class="form-control" name="visitDate"
                                               value="${restaurant?.visitDate || ''}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Средний чек</label>
                                        <input type="number" class="form-control" name="avgBill"
                                               value="${restaurant?.avgBill || ''}" placeholder="₽">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Моя оценка</label>
                                        <div class="d-flex align-items-center gap-2 pt-2">
                                            <input type="range" class="form-range" name="userRating"
                                                   min="0" max="10" value="${restaurant?.userRating || 0}"
                                                   id="ratingSlider" style="flex: 1;">
                                            <span class="badge bg-primary" id="ratingValue">
                                                ${restaurant?.userRating || 0}/10
                                            </span>
                                        </div>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Любимые блюда</label>
                                        <input type="text" class="form-control" name="favoriteDishes"
                                               value="${restaurant?.favoriteDishes?.join(', ') || ''}"
                                               placeholder="Через запятую: паста, пицца, тирамису">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Рецензия</label>
                                        <textarea class="form-control" name="review" rows="3"
                                                  placeholder="Твои впечатления...">${restaurant?.review || ''}</textarea>
                                    </div>
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

        document.getElementById('saveRestaurantBtn').addEventListener('click', async () => {
            const form = document.getElementById('restaurantForm');
            const formData = new FormData(form);

            const data = {
                name: formData.get('name'),
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
                window.app.ui.showToast('Введи название ресторана', 'warning');
                return;
            }

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
                window.app.ui.showToast('Ошибка сохранения', 'error');
            }
        });
    }

    pluralize(count, one, two, five) {
        if (count % 10 === 1 && count % 100 !== 11) return one;
        if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return two;
        return five;
    }
}