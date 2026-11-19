import { DreamsService } from '../../services/dreams.service.js';
import { escapeHTML } from '../../core/escape-html.js';

export class DreamsModule {
    constructor() {
        this.dreamsService = new DreamsService();
        this.currentFilter = { status: 'all', category: 'all' };
        this.searchQuery = '';
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = window.app.ui.createLoader();

        try {
            const dreams = await this.dreamsService.getDreams(userId, this.currentFilter, { throwOnError: true });
            if (window.app.currentUser?.uid !== userId) return;
            mainContent.innerHTML = this.getTemplate(dreams);
            this.attachEventListeners();
        } catch (error) {
            console.error('Не удалось загрузить мечты:', error);
            if (window.app.currentUser?.uid !== userId) return;
            mainContent.innerHTML = `
                <section class="container py-5 text-center" role="alert" aria-labelledby="dreams-load-error">
                    <i class="bi bi-wifi-off display-5 text-warning" aria-hidden="true"></i>
                    <h2 class="h4 mt-3" id="dreams-load-error">Не удалось загрузить мечты</h2>
                    <p class="text-muted">Проверь подключение и попробуй снова. Твои записи не удалены.</p>
                    <button type="button" class="btn btn-premium" id="retryDreamsLoad">Повторить</button>
                </section>`;
            mainContent.querySelector('#retryDreamsLoad')?.addEventListener('click', () => this.render());
        }
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
                        <div class="col-12 col-md">
                            <label class="visually-hidden" for="dreamSearch">Найти мечту</label>
                            <input type="search" class="form-control form-control-sm" id="dreamSearch"
                                   placeholder="Поиск по мечтам…" autocomplete="off"
                                   value="${escapeHTML(this.searchQuery)}">
                        </div>
                    </div>
                </div>

                <p class="text-muted small mb-3" id="dreamSearchCount" role="status" aria-live="polite"></p>

                <div id="dreamsGrid" class="row g-3">
                    ${dreams.length === 0 ? this.getEmptyState() : dreams.map((d, i) => this.createCard(d, i)).join('')}
                </div>
                <div id="dreamSearchEmpty" class="atlas-empty atlas-empty--dream" hidden>
                    <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-search"></i></div>
                    <h3>Ничего не нашлось</h3>
                    <p>Попробуй другое слово или очисти строку поиска.</p>
                </div>

                <div id="dreamModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        const hasFilter = this.currentFilter.status !== 'all' || this.currentFilter.category !== 'all';
        if (hasFilter) return `
            <div class="col-12"><section class="atlas-empty atlas-empty--dream" aria-label="Нет результатов по фильтрам">
                <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-funnel"></i></div>
                <h3>По этим фильтрам пока ничего нет</h3>
                <p>Попробуй выбрать другой статус или категорию — твои записи никуда не исчезли.</p>
            </section></div>
        `;
        return `
            <div class="col-12">
                <section class="atlas-empty atlas-empty--dream" aria-labelledby="dream-empty-title">
                    <div class="atlas-empty-art" aria-hidden="true"><span class="atlas-empty-orbit"></span><i class="bi bi-stars"></i><span class="atlas-empty-spark atlas-empty-spark--one">✦</span><span class="atlas-empty-spark atlas-empty-spark--two">✧</span></div>
                    <span class="atlas-empty-kicker">Начало большой истории</span>
                    <h3 id="dream-empty-title">У каждой мечты есть первый шаг</h3>
                    <p>Запиши то, что вдохновляет. Маленькая идея сегодня может стать большим событием завтра.</p>
                    <button type="button" class="btn btn-premium atlas-empty-action" id="emptyAddDreamBtn"><i class="bi bi-plus-lg me-2"></i>Записать мечту</button>
                </section>
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
        const progress = Math.max(0, Math.min(100, Number(dream.progress) || 0));
        const safeSteps = Array.isArray(dream.steps) ? dream.steps : [];

        return `
            <div class="col-12 col-md-6 col-lg-4 fade-in-up" data-dream-card
                 data-search="${escapeHTML([dream.title, dream.description, dream.category].filter(Boolean).join(' ').toLocaleLowerCase())}"
                 style="animation-delay: ${index * 0.06}s">
                <div class="card-premium h-100 dream-card p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <span class="badge bg-${status.color} bg-opacity-10 text-${status.color}">${status.badge}</span>
                        <div class="dream-card-actions">
                            <button class="btn btn-sm btn-outline-secondary rounded-circle me-1 edit-btn" aria-label="Редактировать запись" title="Редактировать" data-id="${escapeHTML(dream.id)}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger rounded-circle delete-btn" aria-label="Удалить запись" title="Удалить" data-id="${escapeHTML(dream.id)}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <h6 class="fw-bold mb-1">${escapeHTML(dream.title || 'Без названия')}</h6>
                    ${dream.category
                ? `<span class="badge bg-light text-dark me-1"><i class="bi bi-tag me-1"></i>${escapeHTML(dream.category)}</span>`
                : ''
            }
                    ${dream.description
                ? `<p class="text-muted small mt-2 mb-2">${escapeHTML(String(dream.description).substring(0, 100))}...</p>`
                : ''
            }
                    ${dream.status !== 'completed'
                ? `<div class="mb-2">
                            <div class="d-flex justify-content-between small">
                                <span>Прогресс</span>
                                <span>${progress}%</span>
                            </div>
                            <div class="progress" style="height: 5px;">
                                <div class="progress-bar bg-${status.color}" style="width: ${progress}%"></div>
                            </div>
                        </div>`
                : ''
            }
                    ${dream.deadline
                ? `<small class="text-muted d-block"><i class="bi bi-calendar me-1"></i>${escapeHTML(this.formatDate(dream.deadline))}</small>`
                : ''
            }
                    ${safeSteps.length
                ? `<small class="text-muted d-block mt-1">
                            <i class="bi bi-list-check me-1"></i>${safeSteps.filter(s => s.done).length}/${safeSteps.length} шагов
                        </small>`
                : ''
            }
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const searchInput = document.getElementById('dreamSearch');
        searchInput?.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            this.applySearch();
        });
        this.applySearch();
        document.getElementById('addDreamBtn')?.addEventListener('click', () => this.showModal(null));
        document.getElementById('emptyAddDreamBtn')?.addEventListener('click', () => this.showModal(null));

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.disabled || !confirm('Удалить эту мечту?')) return;
                btn.disabled = true;
                btn.setAttribute('aria-busy', 'true');
                try {
                    const result = await this.dreamsService.deleteDream(window.app.currentUser.uid, btn.dataset.id);
                    if (!result?.success) {
                        window.app.ui.showToast('Не удалось удалить мечту. Попробуй ещё раз.', 'error');
                        return;
                    }
                    window.app.ui.showToast('Мечта удалена', 'info');
                    await this.render();
                    window.app.refreshUserData();
                } catch (error) {
                    console.error('Ошибка удаления мечты:', error);
                    window.app.ui.showToast('Не удалось удалить мечту. Проверь подключение.', 'error');
                } finally {
                    if (btn.isConnected) {
                        btn.disabled = false;
                        btn.removeAttribute('aria-busy');
                    }
                }
            });
        });

        document.querySelectorAll('#statusFilters [data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter.status = e.currentTarget.dataset.filter;
                this.render();
            });
        });

        document.getElementById('categoryFilter')?.addEventListener('change', (e) => {
            this.currentFilter.category = e.target.value;
            this.render();
        });
    }

    applySearch() {
        const query = this.searchQuery.trim().toLocaleLowerCase();
        const cards = [...document.querySelectorAll('#dreamsGrid [data-dream-card]')];
        let matches = 0;
        for (const card of cards) {
            const visible = !query || card.dataset.search.includes(query);
            card.hidden = !visible;
            if (visible) matches++;
        }
        const empty = document.getElementById('dreamSearchEmpty');
        if (empty) empty.hidden = !query || matches > 0 || cards.length === 0;
        const count = document.getElementById('dreamSearchCount');
        if (count) count.textContent = query && cards.length
            ? `Найдено: ${matches} из ${cards.length}`
            : '';
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
        const steps = Array.isArray(dream?.steps) ? dream.steps : [{ text: '', done: false }, { text: '', done: false }];
        const progress = Math.max(0, Math.min(100, Number(dream?.progress) || 0));

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
                                               value="${escapeHTML(dream?.title || '')}" placeholder="О чём ты мечтаешь?" required>
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
                                                   min="0" max="100" value="${progress}"
                                                   id="progressSlider" style="flex: 1;">
                                            <span class="badge bg-primary" id="progressValue">${progress}%</span>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Срок</label>
                                        <input type="date" class="form-control" name="deadline"
                                               value="${escapeHTML(dream?.deadline || '')}">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Описание</label>
                                        <textarea class="form-control" name="description" rows="3"
                                                  placeholder="Опиши свою мечту...">${escapeHTML(dream?.description || '')}</textarea>
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
                                                           value="${escapeHTML(step.text || '')}" placeholder="Шаг ${i + 1}">
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

        document.getElementById('saveDreamBtn').addEventListener('click', async (event) => {
            const saveButton = event.currentTarget;
            if (saveButton.disabled) return;
            const form = document.getElementById('dreamForm');
            if (!form) return;
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

            saveButton.disabled = true;
            saveButton.setAttribute('aria-busy', 'true');
            try {
                const result = isEdit
                    ? await this.dreamsService.updateDream(userId, dreamId, data)
                    : await this.dreamsService.addDream(userId, data);

                if (!result?.success) {
                    window.app.ui.showToast('Ошибка сохранения. Попробуй ещё раз.', 'error');
                    return;
                }

                modal.hide();
                window.app.onUserAction('add_dream');
                window.app.ui.showToast(
                    isEdit ? 'Мечта обновлена! ⭐' : 'Мечта добавлена! ✨',
                    'success'
                );
                setTimeout(async () => {
                    await this.render();
                }, 300);
            } catch (error) {
                console.error('Ошибка сохранения мечты:', error);
                window.app.ui.showToast('Не удалось сохранить мечту. Проверь подключение.', 'error');
            } finally {
                if (saveButton.isConnected) {
                    saveButton.disabled = false;
                    saveButton.removeAttribute('aria-busy');
                }
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
