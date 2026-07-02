import { RestaurantService } from '../../services/restaurant.service.js';
import { APP_CONFIG } from '../../config/constants.js';

export class RestaurantsModule {
    constructor() {
        this.restaurantService = new RestaurantService();
        this.currentFilter = { cuisine: 'all', status: 'all', rating: 0 };
    }

    async render(params = {}) {
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
        const activeStatusFilter = this.currentFilter.status || 'all';
        const activeCuisineFilter = this.currentFilter.cuisine || 'all';

        return `
            <div class="restaurants-page fade-in-up">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h2 class="fw-bold mb-1">
                            <i class="bi bi-shop text-primary me-2"></i>Рестораны
                        </h2>
                        <p class="text-muted mb-0">
                            ${restaurants.length} ${this.pluralize(restaurants.length, 'ресторан', 'ресторана', 'ресторанов')}
                        </p>
                    </div>
                    <button class="btn btn-premium" id="addRestaurantBtn">
                        <i class="bi bi-plus-lg me-2"></i>Добавить ресторан
                    </button>
                </div>

                <div class="restaurant-filters mb-4">
                    <div class="row g-2">
                        <div class="col-12 col-md-4">
                            <div class="btn-group w-100" role="group" id="statusFilters">
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'all' ? 'active' : ''}" data-filter="all">
                                    <i class="bi bi-grid me-1"></i>Все
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'visited' ? 'active' : ''}" data-filter="visited">
                                    <i class="bi bi-check-circle me-1"></i>Посетил
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'want_to_visit' ? 'active' : ''}" data-filter="want_to_visit">
                                    <i class="bi bi-bookmark me-1"></i>Хочу
                                </button>
                            </div>
                        </div>
                        <div class="col-6 col-md-4">
                            <select class="form-select" id="cuisineFilter">
                                <option value="all" ${activeCuisineFilter === 'all' ? 'selected' : ''}>Все кухни</option>
                                ${APP_CONFIG.CUISINE_TYPES.map(cuisine => `
                                    <option value="${cuisine}" ${activeCuisineFilter === cuisine ? 'selected' : ''}>${cuisine}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="col-6 col-md-4">
                            <select class="form-select" id="ratingFilter">
                                <option value="0">Любая оценка</option>
                                <option value="5">⭐ 5+</option>
                                <option value="7">⭐ 7+</option>
                                <option value="8">⭐ 8+</option>
                                <option value="9">⭐ 9+</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div id="restaurantsGrid" class="row g-4">
                    ${restaurants.length === 0 ? this.getEmptyState() : restaurants.map((r, i) => this.createRestaurantCard(r, i)).join('')}
                </div>

                <div id="restaurantModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        return `
            <div class="col-12">
                ${window.app.ui.createEmptyState({
                    icon: 'bi-shop',
                    title: 'Нет ресторанов',
                    description: 'Добавь свой первый ресторан и делись впечатлениями!',
                    action: ''
                })}
            </div>
        `;
    }

    createRestaurantCard(restaurant, index) {
        const statusBadge = restaurant.status === 'visited'
            ? '<span class="badge bg-success">Посетил</span>'
            : '<span class="badge bg-warning text-dark">Хочу посетить</span>';

        return `
            <div class="col-12 col-md-6 col-lg-4 restaurant-card fade-in-up" style="animation-delay: ${index * 0.1}s">
                <div class="card-premium h-100">
                    <div class="restaurant-card-header">
                        ${restaurant.photos?.[0]
                            ? `<img src="${restaurant.photos[0]}" alt="${restaurant.name}" class="restaurant-photo">`
                            : `<div class="restaurant-placeholder">
                                <i class="bi bi-shop display-4 text-white opacity-50"></i>
                            </div>`
                        }
                        <div class="restaurant-card-badges">
                            ${statusBadge}
                        </div>
                        <div class="restaurant-card-actions">
                            <button class="btn btn-light btn-sm rounded-circle me-1 edit-restaurant-btn" data-id="${restaurant.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-light btn-sm rounded-circle delete-restaurant-btn" data-id="${restaurant.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="p-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="fw-bold mb-0">${restaurant.name || 'Без названия'}</h5>
                            ${restaurant.userRating ? `
                                <span class="badge px-2 py-1" style="background: var(--primary);">
                                    <i class="bi bi-star-fill me-1" style="font-size: 0.65rem;"></i>
                                    ${restaurant.userRating}/10
                                </span>
                            ` : ''}
                        </div>
                        <div class="mb-2">
                            <i class="bi bi-egg-fried text-primary me-1"></i>
                            <small class="text-muted">${restaurant.cuisine || 'Кухня не указана'}</small>
                            ${restaurant.address ? `
                                <span class="mx-1">•</span>
                                <i class="bi bi-geo-alt text-danger me-1"></i>
                                <small class="text-muted">${restaurant.address}</small>
                            ` : ''}
                        </div>
                        ${restaurant.review ? `
                            <p class="text-muted small mb-3">${this.truncate(restaurant.review, 100)}</p>
                        ` : ''}
                        ${restaurant.favoriteDishes?.length ? `
                            <div class="mb-2">
                                <small class="text-muted">
                                    <i class="bi bi-heart me-1"></i>
                                    ${restaurant.favoriteDishes.slice(0, 3).join(', ')}
                                </small>
                            </div>
                        ` : ''}
                        <small class="text-muted">${this.formatDate(restaurant.visitDate || restaurant.createdAt)}</small>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.getElementById('addRestaurantBtn')?.addEventListener('click', () => this.showRestaurantModal(null));

        document.querySelectorAll('.edit-restaurant-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showRestaurantModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-restaurant-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Удалить ресторан?')) {
                    const result = await this.restaurantService.deleteRestaurant(window.app.currentUser.uid, btn.dataset.id);
                    if (result.success) {
                        window.app.ui.showToast('Ресторан удалён', 'info');
                        await this.render();
                        window.app.refreshUserData();
                    }
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

        document.getElementById('ratingFilter')?.addEventListener('change', (e) => {
            this.currentFilter.rating = parseInt(e.target.value);
            this.render();
        });
    }

    async showRestaurantModal(restaurantId) {
        document.getElementById('restaurantModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const userId = window.app.currentUser.uid;
        const restaurant = restaurantId ? await this.restaurantService.getRestaurant(userId, restaurantId) : null;
        const isEdit = !!restaurant;

        const modalContainer = document.createElement('div');
        modalContainer.id = 'restaurantModalContainer';
        document.body.appendChild(modalContainer);

        modalContainer.innerHTML = `
            <div class="modal fade" id="restaurantModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header border-0">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-plus-circle'} text-primary me-2"></i>
                                ${isEdit ? 'Редактировать' : 'Новый ресторан'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="restaurantForm">
                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Название *</label>
                                    <input type="text" class="form-control" name="name" 
                                           value="${restaurant?.name || ''}" placeholder="Название ресторана" required>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Кухня</label>
                                        <select class="form-select" name="cuisine">
                                            <option value="">Выбери кухню</option>
                                            ${APP_CONFIG.CUISINE_TYPES.map(c => `
                                                <option value="${c}" ${restaurant?.cuisine === c ? 'selected' : ''}>${c}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Статус</label>
                                        <select class="form-select" name="status">
                                            <option value="want_to_visit" ${restaurant?.status === 'want_to_visit' ? 'selected' : ''}>Хочу посетить</option>
                                            <option value="visited" ${restaurant?.status === 'visited' ? 'selected' : ''}>Посетил</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Адрес</label>
                                    <input type="text" class="form-control" name="address" 
                                           value="${restaurant?.address || ''}" placeholder="Город, улица">
                                </div>

                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Дата посещения</label>
                                        <input type="date" class="form-control" name="visitDate" 
                                               value="${restaurant?.visitDate || ''}">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Средний чек</label>
                                        <input type="number" class="form-control" name="avgBill" 
                                               value="${restaurant?.avgBill || ''}" placeholder="₽">
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Моя оценка</label>
                                    <div class="d-flex align-items-center gap-3">
                                        <input type="range" class="form-range" name="userRating" 
                                               min="0" max="10" value="${restaurant?.userRating || 0}" 
                                               style="flex: 1;" id="ratingSlider">
                                        <span class="badge px-3 py-2 fs-6" id="ratingValue" 
                                              style="background: var(--primary); min-width: 50px;">
                                            ${restaurant?.userRating || 0}/10
                                        </span>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Любимые блюда</label>
                                    <input type="text" class="form-control" name="favoriteDishes" 
                                           value="${restaurant?.favoriteDishes?.join(', ') || ''}" 
                                           placeholder="Через запятую: паста, пицца, тирамису">
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Рецензия</label>
                                    <textarea class="form-control" name="review" rows="3" 
                                              placeholder="Твои впечатления...">${restaurant?.review || ''}</textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer border-0">
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
            modalContainer.remove();
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
                favoriteDishes: formData.get('favoriteDishes').split(',').map(d => d.trim()).filter(Boolean),
                review: formData.get('review'),
                photos: restaurant?.photos || []
            };

            if (!data.name) {
                window.app.ui.showToast('Введи название ресторана', 'warning');
                return;
            }

            const userId = window.app.currentUser.uid;
            let result;

            if (isEdit) {
                result = await this.restaurantService.updateRestaurant(userId, restaurantId, data);
            } else {
                result = await this.restaurantService.addRestaurant(userId, data);
            }

            if (result.success) {
                modal.hide();
                window.app.ui.showToast(
                    isEdit ? 'Ресторан обновлён! 🍽️' : 'Ресторан добавлен! 🎉',
                    'success'
                );
                setTimeout(async () => {
                    await this.render();
                    window.app.refreshUserData();
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

    truncate(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }
}