import { DreamsService } from '../../services/dreams.service.js';

export class DreamsModule {
    constructor() {
        this.dreamsService = new DreamsService();
        this.currentFilter = { status: 'all', category: 'all' };
    }

    async render() {
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
        const categories = ['all', 'Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое'];
        const activeStatus = this.currentFilter.status || 'all';
        const activeCategory = this.currentFilter.category || 'all';

        return `
            <div class="fade-in-up">
                <div class="page-header mb-4">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="fw-bold mb-0">
                                <i class="bi bi-star text-warning me-2"></i>Мечты
                            </h2>
                            <p class="text-muted mb-0">
                                ${dreams.length} ${this.pluralize(dreams.length, 'мечта', 'мечты', 'мечт')}
                            </p>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-premium" id="addDreamBtn">
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
                                <button class="btn btn-outline-secondary ${activeStatus === 'dreaming' ? 'active' : ''}" data-filter="dreaming">
                                    <i class="bi bi-cloud-moon me-1"></i>Мечтаю
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'in_progress' ? 'active' : ''}" data-filter="in_progress">
                                    <i class="bi bi-rocket me-1"></i>В процессе
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'completed' ? 'active' : ''}" data-filter="completed">
                                    <i class="bi bi-check-circle me-1"></i>Сбылось
                                </button>
                            </div>
                        </div>
                        <div class="col-auto">
                            <select class="form-select form-select-sm" id="categoryFilter" style="min-width: 130px;">
                                ${categories.map(c => `
                                    <option value="${c}" ${activeCategory === c ? 'selected' : ''}>
                                        ${c === 'all' ? 'Все категории' : c}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <div id="dreamsGrid" class="row g-3">
                    ${dreams.length === 0 ? this.getEmptyState() : dreams.map((d, i) => this.createCard(d, i)).join('')}
                </div>

                <div id="dreamModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        return `
            <div class="col-12 text-center py-5">
                <i class="bi bi-star display-1 text-muted opacity-25"></i>
                <h5 class="mt-3 text-muted">Нет мечт</h5>
                <p class="text-muted small">Запиши свою первую мечту</p>
            </div>
        `;
    }

    createCard(dream, index) {
        const statuses = {
            dreaming: { badge: 'Мечтаю', color: 'secondary' },
            in_progress: { badge: 'В процессе', color: 'primary' },
            completed: { badge: 'Сбылось!', color: 'success' }
        };
        const status = statuses[dream.status] || statuses.dreaming;

        return `
            <div class="col-12 col-md-6 col-lg-4 fade-in-up" style="animation-delay: ${index * 0.06}s">
                <div class="card-premium h-100 dream-card p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <span class="badge bg-${status.color} bg-opacity-10 text-${status.color}">${status.badge}</span>
                        <div class="dream-card-actions">
                            <button class="btn btn-sm btn-outline-secondary rounded-circle me-1 edit-btn" data-id="${dream.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger rounded-circle delete-btn" data-id="${dream.id}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <h6 class="fw-bold mb-1">${dream.title || 'Без названия'}</h6>
                    ${dream.category
                ? `<span class="badge bg-light text-dark me-1"><i class="bi bi-tag me-1"></i>${dream.category}</span>`
                : ''
            }
                    ${dream.description
                ? `<p class="text-muted small mt-2 mb-2">${dream.description.substring(0, 100)}...</p>`
                : ''
            }
                    ${dream.status !== 'completed'
                ? `<div class="mb-2">
                            <div class="d-flex justify-content-between small">
                                <span>Прогресс</span>
                                <span>${dream.progress || 0}%</span>
                            </div>
                            <div class="progress" style="height: 5px;">
                                <div class="progress-bar bg-${status.color}" style="width: ${dream.progress || 0}%"></div>
                            </div>
                        </div>`
                : ''
            }
                    ${dream.deadline
                ? `<small class="text-muted d-block"><i class="bi bi-calendar me-1"></i>${this.formatDate(dream.deadline)}</small>`
                : ''
            }
                    ${dream.steps && dream.steps.length
                ? `<small class="text-muted d-block mt-1">
                            <i class="bi bi-list-check me-1"></i>${dream.steps.filter(s => s.done).length}/${dream.steps.length} шагов
                        </small>`
                : ''
            }
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.getElementById('addDreamBtn')?.addEventListener('click', () => this.showModal(null));

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Удалить эту мечту?')) {
                    await this.dreamsService.deleteDream(window.app.currentUser.uid, btn.dataset.id);
                    window.app.ui.showToast('Мечта удалена', 'info');
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

        document.getElementById('categoryFilter')?.addEventListener('change', (e) => {
            this.currentFilter.category = e.target.value;
            this.render();
        });
    }

    async showModal(dreamId) {
        document.getElementById('dreamModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const userId = window.app.currentUser.uid;
        const dream = dreamId ? await this.dreamsService.getDream(userId, dreamId) : null;
        const isEdit = !!dream;
        const categories = ['Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое'];
        const steps = dream?.steps || [{ text: '', done: false }, { text: '', done: false }];

        const container = document.createElement('div');
        container.id = 'dreamModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="dreamModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-star'} text-warning me-2"></i>
                                ${isEdit ? 'Редактировать мечту' : 'Новая мечта'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="dreamForm">
                                <div class="row g-3">
                                    <div class="col-md-8">
                                        <label class="form-label fw-semibold small">Название мечты *</label>
                                        <input type="text" class="form-control" name="title"
                                               value="${dream?.title || ''}" placeholder="О чём ты мечтаешь?" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Категория</label>
                                        <select class="form-select" name="category">
                                            <option value="">Выбери категорию</option>
                                            ${categories.map(c => `
                                                <option value="${c}" ${dream?.category === c ? 'selected' : ''}>${c}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Статус</label>
                                        <select class="form-select" name="status">
                                            <option value="dreaming" ${dream?.status === 'dreaming' ? 'selected' : ''}>Мечтаю</option>
                                            <option value="in_progress" ${dream?.status === 'in_progress' ? 'selected' : ''}>В процессе</option>
                                            <option value="completed" ${dream?.status === 'completed' ? 'selected' : ''}>Сбылось!</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Прогресс</label>
                                        <div class="d-flex align-items-center gap-2 pt-2">
                                            <input type="range" class="form-range" name="progress"
                                                   min="0" max="100" value="${dream?.progress || 0}"
                                                   id="progressSlider" style="flex: 1;">
                                            <span class="badge bg-primary" id="progressValue">${dream?.progress || 0}%</span>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Срок</label>
                                        <input type="date" class="form-control" name="deadline"
                                               value="${dream?.deadline || ''}">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Описание</label>
                                        <textarea class="form-control" name="description" rows="3"
                                                  placeholder="Опиши свою мечту...">${dream?.description || ''}</textarea>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">
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
                                                    <button type="button" class="btn btn-outline-danger btn-sm remove-step">
                                                        <i class="bi bi-x"></i>
                                                    </button>
                                                </div>
                                            `).join('')}
                                        </div>
                                        <button type="button" class="btn btn-outline-primary btn-sm" id="addStepBtn">
                                            <i class="bi bi-plus me-1"></i>Добавить шаг
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
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
            container.remove();
            document.body.style.overflow = '';
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        });

        const progressSlider = document.getElementById('progressSlider');
        const progressValue = document.getElementById('progressValue');
        if (progressSlider && progressValue) {
            progressSlider.addEventListener('input', () => {
                progressValue.textContent = progressSlider.value + '%';
            });
        }

        document.getElementById('addStepBtn')?.addEventListener('click', () => {
            const stepsContainer = document.getElementById('stepsContainer');
            const row = document.createElement('div');
            row.className = 'input-group mb-2 step-row';
            row.innerHTML = `
                <span class="input-group-text"><input type="checkbox" class="step-done"></span>
                <input type="text" class="form-control step-text" placeholder="Новый шаг">
                <button type="button" class="btn btn-outline-danger btn-sm remove-step"><i class="bi bi-x"></i></button>
            `;
            stepsContainer.appendChild(row);
            row.querySelector('.remove-step').addEventListener('click', () => row.remove());
        });

        document.querySelectorAll('.remove-step').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.step-row').remove());
        });

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

            const result = isEdit
                ? await this.dreamsService.updateDream(userId, dreamId, data)
                : await this.dreamsService.addDream(userId, data);

            if (result.success) {
                modal.hide();
                window.app.onUserAction('add_dream');
                window.app.ui.showToast(
                    isEdit ? 'Мечта обновлена! ⭐' : 'Мечта добавлена! ✨',
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