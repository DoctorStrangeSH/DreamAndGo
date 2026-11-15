import { BookService } from '../../services/book.service.js';
import { escapeHTML } from '../../core/escape-html.js';

export class BooksModule {
    constructor() {
        this.bookService = new BookService();
        this.currentFilter = { status: 'all', genre: 'all', rating: 0 };
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = window.app.ui.createLoader();

        const books = await this.bookService.getBooks(userId, this.currentFilter);

        mainContent.innerHTML = this.getTemplate(books);
        this.attachEventListeners();
    }

    getTemplate(books) {
        const genres = ['all', 'Фантастика', 'Детектив', 'Роман', 'Биография', 'История', 'Психология', 'Бизнес', 'Наука', 'Философия', 'Другое'];
        const activeGenre = this.currentFilter.genre || 'all';
        const activeStatus = this.currentFilter.status || 'all';

        return `
            <div class="fade-in-up">
                <div class="page-header mb-4">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="fw-bold mb-0">
                                <i class="bi bi-book text-danger me-2"></i>Книги
                            </h2>
                            <p class="text-muted mb-0">
                                ${books.length} ${this.pluralize(books.length, 'книга', 'книги', 'книг')}
                            </p>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-premium" id="addBookBtn">
                                <i class="bi bi-plus-lg me-1"></i>Добавить
                            </button>
                        </div>
                    </div>
                </div>

                <div class="filter-bar mb-4">
                    <div class="row g-2">
                        <div class="col-auto">
                            <select class="form-select form-select-sm" id="genreFilter" style="min-width: 130px;">
                                ${genres.map(g => `
                                    <option value="${escapeHTML(g)}" ${activeGenre === g ? 'selected' : ''}>
                                        ${escapeHTML(g === 'all' ? 'Все жанры' : g)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="col-auto">
                            <div class="btn-group btn-group-sm" id="statusFilters">
                                <button class="btn btn-outline-secondary ${activeStatus === 'all' ? 'active' : ''}" data-filter="all">
                                    Все
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'read' ? 'active' : ''}" data-filter="read">
                                    <i class="bi bi-check-circle me-1"></i>Прочитано
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'reading' ? 'active' : ''}" data-filter="reading">
                                    <i class="bi bi-book-half me-1"></i>Читаю
                                </button>
                                <button class="btn btn-outline-secondary ${activeStatus === 'want_to_read' ? 'active' : ''}" data-filter="want_to_read">
                                    <i class="bi bi-bookmark me-1"></i>Хочу
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="booksGrid" class="row g-3">
                    ${books.length === 0 ? this.getEmptyState() : books.map((b, i) => this.createCard(b, i)).join('')}
                </div>

                <div id="bookModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        const hasFilter = this.currentFilter.status !== 'all' || this.currentFilter.genre !== 'all';
        if (hasFilter) return `
            <div class="col-12"><section class="atlas-empty atlas-empty--book" aria-label="Нет результатов по фильтрам">
                <div class="atlas-empty-art" aria-hidden="true"><i class="bi bi-funnel"></i></div>
                <h3>По этим фильтрам пока ничего нет</h3>
                <p>Попробуй выбрать другой статус или категорию — твои записи никуда не исчезли.</p>
            </section></div>
        `;
        return `
            <div class="col-12">
                <section class="atlas-empty atlas-empty--book" aria-labelledby="book-empty-title">
                    <div class="atlas-empty-art" aria-hidden="true"><span class="atlas-empty-orbit"></span><i class="bi bi-book-half"></i><span class="atlas-empty-spark atlas-empty-spark--one">✦</span><span class="atlas-empty-spark atlas-empty-spark--two">✧</span></div>
                    <span class="atlas-empty-kicker">Твоя библиотека</span>
                    <h3 id="book-empty-title">Время открыть новую страницу</h3>
                    <p>Собери любимые истории и книги, которые хочется прочитать однажды.</p>
                    <button type="button" class="btn btn-premium atlas-empty-action" id="emptyAddBookBtn"><i class="bi bi-plus-lg me-2"></i>Добавить книгу</button>
                </section>
            </div>
        `;
    }

    createCard(book, index) {
        const statuses = {
            read: { badge: 'Прочитана', color: 'success' },
            reading: { badge: 'Читаю', color: 'primary' },
            want_to_read: { badge: 'Хочу прочитать', color: 'warning' }
        };
        const status = Object.hasOwn(statuses, book.status) ? statuses[book.status] : statuses.want_to_read;
        const totalPages = Number(book.totalPages);
        const currentPage = Number(book.currentPage);
        const safeTotalPages = Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 0;
        const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0
            ? Math.min(safeTotalPages, Math.floor(currentPage)) : 0;
        const progress = safeTotalPages ? Math.round((safeCurrentPage / safeTotalPages) * 100) : 0;
        const rating = Number(book.userRating);
        const safeRating = Number.isFinite(rating) && rating > 0 ? Math.min(10, Math.max(0, rating)) : 0;

        return `
            <div class="col-12 col-md-6 col-lg-4 fade-in-up" style="animation-delay: ${Math.min(index, 12) * 0.06}s">
                <div class="card-premium h-100 book-card p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <span class="badge bg-${status.color} bg-opacity-10 text-${status.color}">${status.badge}</span>
                        <div class="book-card-actions">
                            <button class="btn btn-sm btn-outline-secondary rounded-circle me-1 edit-btn" aria-label="Редактировать запись" title="Редактировать" data-id="${escapeHTML(String(book.id))}">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger rounded-circle delete-btn" aria-label="Удалить запись" title="Удалить" data-id="${escapeHTML(String(book.id))}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <h6 class="fw-bold mb-1">${escapeHTML(String(book.title || 'Без названия'))}</h6>
                    <p class="text-muted small mb-2">${escapeHTML(String(book.author || 'Автор не указан'))}</p>
                    ${Array.isArray(book.genres) && book.genres.length
                ? `<div class="mb-2">${book.genres.map(g => `<span class="badge bg-light text-dark me-1">${escapeHTML(String(g))}</span>`).join('')}</div>`
                : ''
            }
                    ${book.status === 'reading' && progress > 0
                ? `<div class="mb-2">
                            <div class="d-flex justify-content-between small">
                                <span>${safeCurrentPage}/${safeTotalPages} стр.</span>
                                <span>${progress}%</span>
                            </div>
                            <div class="progress" style="height: 4px;">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                            </div>
                        </div>`
                : ''
            }
                    <div class="d-flex justify-content-between align-items-center">
                        ${safeRating
                ? `<span class="badge bg-primary">${safeRating}/10</span>`
                : '<span></span>'
            }
                        <small class="text-muted">${this.formatDate(book.createdAt)}</small>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.getElementById('addBookBtn')?.addEventListener('click', () => this.showModal(null));
        document.getElementById('emptyAddBookBtn')?.addEventListener('click', () => this.showModal(null));

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Удалить эту книгу?')) {
                    await this.bookService.deleteBook(window.app.currentUser.uid, btn.dataset.id);
                    window.app.ui.showToast('Книга удалена', 'info');
                    this.render();
                    window.app.refreshUserData();
                }
            });
        });

        document.querySelectorAll('#statusFilters [data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter.status = e.currentTarget.dataset.filter;
                this.render();
            });
        });

        document.getElementById('genreFilter')?.addEventListener('change', (e) => {
            this.currentFilter.genre = e.target.value;
            this.render();
        });
    }

    async showModal(bookId) {
        document.getElementById('bookModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const userId = window.app.currentUser.uid;
        const book = bookId ? await this.bookService.getBook(userId, bookId) : null;
        const isEdit = !!book;
        const genres = ['Фантастика', 'Детектив', 'Роман', 'Биография', 'История', 'Психология', 'Бизнес', 'Наука', 'Философия', 'Другое'];

        const container = document.createElement('div');
        container.id = 'bookModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="bookModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-plus-circle'} text-danger me-2"></i>
                                ${isEdit ? 'Редактировать книгу' : 'Новая книга'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="bookForm">
                                <div class="row g-3">
                                    <div class="col-md-8">
                                        <label class="form-label fw-semibold small">Название *</label>
                                        <input type="text" class="form-control" name="title"
                                               value="${escapeHTML(String(book?.title || ''))}" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Автор *</label>
                                        <input type="text" class="form-control" name="author"
                                               value="${escapeHTML(String(book?.author || ''))}" required>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Статус</label>
                                        <select class="form-select" name="status">
                                            <option value="want_to_read" ${book?.status === 'want_to_read' ? 'selected' : ''}>Хочу прочитать</option>
                                            <option value="reading" ${book?.status === 'reading' ? 'selected' : ''}>Читаю</option>
                                            <option value="read" ${book?.status === 'read' ? 'selected' : ''}>Прочитана</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Жанры</label>
                                        <select class="form-select" name="genres" multiple size="3">
                                            ${genres.map(g => `
                                                <option value="${escapeHTML(g)}" ${book?.genres?.includes(g) ? 'selected' : ''}>${escapeHTML(g)}</option>
                                            `).join('')}
                                        </select>
                                        <small class="text-muted">Ctrl+клик для нескольких</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Год издания</label>
                                        <input type="number" class="form-control" name="year"
                                               value="${escapeHTML(String(book?.year || ''))}" min="1000" max="2099">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Всего страниц</label>
                                        <input type="number" class="form-control" name="totalPages"
                                               value="${escapeHTML(String(book?.totalPages || ''))}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Прочитано</label>
                                        <input type="number" class="form-control" name="currentPage"
                                               value="${escapeHTML(String(book?.currentPage || ''))}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label fw-semibold small">Моя оценка</label>
                                        <div class="d-flex align-items-center gap-2 pt-2">
                                            <input type="range" class="form-range" name="userRating"
                                                   min="0" max="10" value="${Number.isFinite(Number(book?.userRating)) ? Math.min(10, Math.max(0, Number(book.userRating))) : 0}"
                                                   id="ratingSlider" style="flex: 1;">
                                            <span class="badge bg-primary" id="ratingValue">${Number.isFinite(Number(book?.userRating)) ? Math.min(10, Math.max(0, Number(book.userRating))) : 0}/10</span>
                                        </div>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">Рецензия</label>
                                        <textarea class="form-control" name="review" rows="3"
                                                  placeholder="Твои мысли о книге...">${escapeHTML(String(book?.review || ''))}</textarea>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-semibold small">
                                            <i class="bi bi-chat-quote me-1"></i>Любимые цитаты
                                        </label>
                                        <textarea class="form-control" name="quotes" rows="2"
                                                  placeholder="Разделяй цитаты символом |">${escapeHTML(Array.isArray(book?.quotes) ? book.quotes.join('|') : '')}</textarea>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="button" class="btn btn-premium" id="saveBookBtn">
                                ${isEdit ? 'Сохранить' : 'Добавить книгу'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalElement = document.getElementById('bookModal');
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

        document.getElementById('saveBookBtn').addEventListener('click', async () => {
            const form = document.getElementById('bookForm');
            const formData = new FormData(form);

            const data = {
                title: formData.get('title'),
                author: formData.get('author'),
                status: formData.get('status'),
                genres: formData.getAll('genres'),
                year: parseInt(formData.get('year')) || null,
                totalPages: parseInt(formData.get('totalPages')) || 0,
                currentPage: parseInt(formData.get('currentPage')) || 0,
                userRating: parseInt(formData.get('userRating')) || 0,
                review: formData.get('review'),
                quotes: formData.get('quotes').split('|').map(q => q.trim()).filter(Boolean)
            };

            if (!data.title || !data.author) {
                window.app.ui.showToast('Введи название и автора', 'warning');
                return;
            }

            const result = isEdit
                ? await this.bookService.updateBook(userId, bookId, data)
                : await this.bookService.addBook(userId, data);

            if (result.success) {
                modal.hide();
                window.app.onUserAction('add_book');
                window.app.ui.showToast(
                    isEdit ? 'Книга обновлена! 📚' : 'Книга добавлена! 📖',
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