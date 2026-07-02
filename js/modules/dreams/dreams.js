import { DreamsService } from '../../services/dreams.service.js';

export class DreamsModule {
    constructor() {
        this.dreamsService = new DreamsService();
        this.currentFilter = { status: 'all', category: 'all' };
    }

    async render(params = {}) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = window.app.ui.createLoader();

        const dreams = await this.dreamsService.getDreams(userId, this.currentFilter);

        mainContent.innerHTML = this.getTemplate(dreams);
        this.attachEventListeners();
    }

    getTemplate(dreams) {
        const activeStatusFilter = this.currentFilter.status || 'all';
        const activeCategoryFilter = this.currentFilter.category || 'all';

        const categories = ['Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое'];

        return `
            <div class="dreams-page fade-in-up">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h2 class="fw-bold mb-1">
                            <i class="bi bi-star text-warning me-2"></i>Мечты
                        </h2>
                        <p class="text-muted mb-0">
                            ${dreams.length} ${this.pluralize(dreams.length, 'мечта', 'мечты', 'мечт')}
                        </p>
                    </div>
                    <button class="btn btn-premium" id="addDreamBtn">
                        <i class="bi bi-plus-lg me-2"></i>Добавить мечту
                    </button>
                </div>

                <div class="dream-filters mb-4">
                    <div class="row g-2">
                        <div class="col-12 col-md-5">
                            <div class="btn-group w-100" role="group" id="statusFilters">
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'all' ? 'active' : ''}" data-filter="all">
                                    <i class="bi bi-grid me-1"></i>Все
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'dreaming' ? 'active' : ''}" data-filter="dreaming">
                                    <i class="bi bi-cloud-moon me-1"></i>Мечтаю
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'in_progress' ? 'active' : ''}" data-filter="in_progress">
                                    <i class="bi bi-rocket me-1"></i>В процессе
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'completed' ? 'active' : ''}" data-filter="completed">
                                    <i class="bi bi-check-circle me-1"></i>Сбылось
                                </button>
                            </div>
                        </div>
                        <div class="col-12 col-md-4">
                            <select class="form-select" id="categoryFilter">
                                <option value="all" ${activeCategoryFilter === 'all' ? 'selected' : ''}>Все категории</option>
                                ${categories.map(c => `
                                    <option value="${c}" ${activeCategoryFilter === c ? 'selected' : ''}>${c}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="col-12 col-md-3">
                            <div class="form-check form-switch pt-2">
                                <input class="form-check-input" type="checkbox" id="showCompleted">
                                <label class="form-check-label" for="showCompleted">Показать сбывшиеся</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="dreamsGrid" class="row g-4">
                    ${dreams.length === 0 ? this.getEmptyState() : dreams.map((d, i) => this.createDreamCard(d, i)).join('')}
                </div>

                <div id="dreamModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        return `
            <div class="col-12">
                ${window.app.ui.createEmptyState({
                    icon: 'bi-star',
                    title: 'Нет мечт',
                    description: 'Запиши свою первую мечту и начни путь к ней!',
                    action: ''
                })}
            </div>
        `;
    }

    createDreamCard(dream, index) {
        const statuses = {
            'dreaming': { badge: 'Мечтаю', color: 'secondary', icon: 'bi-cloud-moon' },
            'in_progress': { badge: 'В процессе', color: 'primary', icon: 'bi-rocket' },
            'completed': { badge: 'Сбылось!', color: 'success', icon: 'bi-check-circle' }
        };
        const status = statuses[dream.status] || statuses['dreaming'];

        return `
            <div class="col-12 col-md-6 col-lg-4 dream-card fade-in-up" style="animation-delay: ${index * 0.1}s">
                <div class="card-premium h-100">
                    <div class="p-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <span class="badge bg-${status.color}">${status.badge}</span>
                            <div class="dream-card-actions">
                                <button class="btn btn-sm btn-outline-primary rounded-circle me-1 edit-dream-btn" data-id="${dream.id}">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger rounded-circle delete-dream-btn" data-id="${dream.id}">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>

                        <h5 class="fw-bold mb-1">${dream.title || 'Без названия'}</h5>
                        
                        ${dream.category ? `
                            <span class="badge bg-light text-dark me-1">
                                <i class="bi bi-tag me-1"></i>${dream.category}
                            </span>
                        ` : ''}

                        ${dream.description ? `
                            <p class="text-muted small mt-2 mb-3">${this.truncate(dream.description, 120)}</p>
                        ` : ''}

                        ${dream.status !== 'completed' ? `
                            <div class="mb-2">
                                <div class="d-flex justify-content-between small mb-1">
                                    <span class="text-muted">Прогресс</span>
                                    <span class="fw-bold">${dream.progress || 0}%</span>
                                </div>
                                <div class="progress" style="height: 6px;">
                                    <div class="progress-bar bg-${status.color}" style="width: ${dream.progress || 0}%"></div>
                                </div>
                            </div>
                        ` : ''}

                        ${dream.deadline ? `
                            <div class="mt-2">
                                <small class="text-muted">
                                    <i class="bi bi-calendar me-1"></i>
                                    ${this.formatDate(dream.deadline)}
                                </small>
                            </div>
                        ` : ''}

                        ${dream.steps?.length ? `
                            <div class="mt-2">
                                <small class="text-muted">
                                    <i class="bi bi-list-check me-1"></i>
                                    ${dream.steps.filter(s => s.done).length}/${dream.steps.length} шагов
                                </small>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.getElementById('addDreamBtn')?.addEventListener('click', () => this.showDreamModal(null));

        document.querySelectorAll('.edit-dream-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDreamModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-dream-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Удалить эту мечту?')) {
                    const result = await this.dreamsService.deleteDream(window.app.currentUser.uid, btn.dataset.id);
                    if (result.success) {
                        window.app.ui.showToast('Мечта удалена', 'info');
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

        document.getElementById('categoryFilter')?.addEventListener('change', (e) => {
            this.currentFilter.category = e.target.value;
            this.render();
        });
    }

    async showDreamModal(dreamId) {
        document.getElementById('dreamModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const userId = window.app.currentUser.uid;
        const dream = dreamId ? await this.dreamsService.getDream(userId, dreamId) : null;
        const isEdit = !!dream;

        const categories = ['Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое'];

        const steps = dream?.steps || [{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }];

        const modalContainer = document.createElement('div');
        modalContainer.id = 'dreamModalContainer';
        document.body.appendChild(modalContainer);

        modalContainer.innerHTML = `
            <div class="modal fade" id="dreamModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header border-0">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-star'} text-warning me-2"></i>
                                ${isEdit ? 'Редактировать мечту' : 'Новая мечта'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="dreamForm">
                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Название мечты *</label>
                                    <input type="text" class="form-control" name="title" 
                                           value="${dream?.title || ''}" placeholder="О чём ты мечтаешь?" required>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Категория</label>
                                        <select class="form-select" name="category">
                                            <option value="">Выбери категорию</option>
                                            ${categories.map(c => `
                                                <option value="${c}" ${dream?.category === c ? 'selected' : ''}>${c}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Статус</label>
                                        <select class="form-select" name="status">
                                            <option value="dreaming" ${dream?.status === 'dreaming' ? 'selected' : ''}>Мечтаю</option>
                                            <option value="in_progress" ${dream?.status === 'in_progress' ? 'selected' : ''}>В процессе</option>
                                            <option value="completed" ${dream?.status === 'completed' ? 'selected' : ''}>Сбылось!</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Описание</label>
                                    <textarea class="form-control" name="description" rows="3" 
                                              placeholder="Опиши свою мечту подробнее...">${dream?.description || ''}</textarea>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Прогресс (%)</label>
                                        <input type="range" class="form-range" name="progress" 
                                               min="0" max="100" value="${dream?.progress || 0}" id="progressSlider">
                                        <div class="text-center">
                                            <span class="badge bg-primary" id="progressValue">${dream?.progress || 0}%</span>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label fw-semibold">Дата завершения</label>
                                        <input type="date" class="form-control" name="deadline" 
                                               value="${dream?.deadline || ''}">
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">
                                        <i class="bi bi-list-check me-1"></i>Шаги к мечте
                                    </label>
                                    <div id="stepsContainer">
                                        ${steps.map((step, i) => `
                                            <div class="input-group mb-2 step-row">
                                                <span class="input-group-text">
                                                    <input type="checkbox" ${step.done ? 'checked' : ''} class="step-done">
                                                </span>
                                                <input type="text" class="form-control step-text" 
                                                       value="${step.text || ''}" placeholder="Шаг ${i + 1}">
                                                <button type="button" class="btn btn-outline-danger btn-sm remove-step-btn">
                                                    <i class="bi bi-x"></i>
                                                </button>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <button type="button" class="btn btn-outline-primary btn-sm" id="addStepBtn">
                                        <i class="bi bi-plus me-1"></i>Добавить шаг
                                    </button>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer border-0">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="button" class="btn btn-premium" id="saveDreamBtn">
                                ${isEdit ? 'Сохранить' : 'Добавить мечту'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalElement = document.getElementById('dreamModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        modalElement.addEventListener('hidden.bs.modal', () => {
            modalContainer.remove();
            document.body.style.overflow = '';
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        });

        // Слайдер прогресса
        const progressSlider = document.getElementById('progressSlider');
        const progressValue = document.getElementById('progressValue');
        if (progressSlider && progressValue) {
            progressSlider.addEventListener('input', () => {
                progressValue.textContent = progressSlider.value + '%';
            });
        }

        // Добавление шага
        document.getElementById('addStepBtn')?.addEventListener('click', () => {
            const stepsContainer = document.getElementById('stepsContainer');
            const row = document.createElement('div');
            row.className = 'input-group mb-2 step-row';
            row.innerHTML = `
                <span class="input-group-text">
                    <input type="checkbox" class="step-done">
                </span>
                <input type="text" class="form-control step-text" placeholder="Новый шаг">
                <button type="button" class="btn btn-outline-danger btn-sm remove-step-btn">
                    <i class="bi bi-x"></i>
                </button>
            `;
            stepsContainer.appendChild(row);
            row.querySelector('.remove-step-btn').addEventListener('click', () => row.remove());
        });

        // Удаление шага
        document.querySelectorAll('.remove-step-btn').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.step-row').remove());
        });

        // Сохранение
        document.getElementById('saveDreamBtn').addEventListener('click', async () => {
            const form = document.getElementById('dreamForm');
            const formData = new FormData(form);

            const steps = [];
            document.querySelectorAll('.step-row').forEach(row => {
                const text = row.querySelector('.step-text').value.trim();
                const done = row.querySelector('.step-done').checked;
                if (text) steps.push({ text, done });
            });

            const data = {
                title: formData.get('title'),
                category: formData.get('category'),
                status: formData.get('status'),
                description: formData.get('description'),
                progress: parseInt(formData.get('progress')) || 0,
                deadline: formData.get('deadline') || null,
                steps: steps
            };

            if (!data.title) {
                window.app.ui.showToast('Введи название мечты', 'warning');
                return;
            }

            const userId = window.app.currentUser.uid;
            let result;

            if (isEdit) {
                result = await this.dreamsService.updateDream(userId, dreamId, data);
            } else {
                result = await this.dreamsService.addDream(userId, data);
            }

            if (result.success) {
                modal.hide();
                window.app.ui.showToast(
                    isEdit ? 'Мечта обновлена! ⭐' : 'Мечта добавлена! ✨',
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