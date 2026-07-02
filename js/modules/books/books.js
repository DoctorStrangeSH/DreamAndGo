import { BookService } from '../../services/book.service.js';

export class BooksModule {
    constructor() {
        this.bookService = new BookService();
        this.currentFilter = { status: 'all', genre: 'all', rating: 0 };
    }

    async render(params = {}) {
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
        const activeStatusFilter = this.currentFilter.status || 'all';
        const activeGenreFilter = this.currentFilter.genre || 'all';

        const genres = [
            'Фантастика', 'Детектив', 'Роман', 'Биография', 'История',
            'Психология', 'Бизнес', 'Наука', 'Философия', 'Поэзия', 'Другое'
        ];

        return `
            <div class="books-page fade-in-up">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h2 class="fw-bold mb-1">
                            <i class="bi bi-book text-info me-2"></i>Книги
                        </h2>
                        <p class="text-muted mb-0">
                            ${books.length} ${this.pluralize(books.length, 'книга', 'книги', 'книг')}
                        </p>
                    </div>
                    <button class="btn btn-premium" id="addBookBtn">
                        <i class="bi bi-plus-lg me-2"></i>Добавить книгу
                    </button>
                </div>

                <div class="book-filters mb-4">
                    <div class="row g-2">
                        <div class="col-12 col-md-4">
                            <div class="btn-group w-100" role="group" id="statusFilters">
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'all' ? 'active' : ''}" data-filter="all">
                                    <i class="bi bi-grid me-1"></i>Все
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'read' ? 'active' : ''}" data-filter="read">
                                    <i class="bi bi-check-circle me-1"></i>Прочитано
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'reading' ? 'active' : ''}" data-filter="reading">
                                    <i class="bi bi-book-half me-1"></i>Читаю
                                </button>
                                <button class="btn btn-outline-primary ${activeStatusFilter === 'want_to_read' ? 'active' : ''}" data-filter="want_to_read">
                                    <i class="bi bi-bookmark me-1"></i>Хочу
                                </button>
                            </div>
                        </div>
                        <div class="col-6 col-md-4">
                            <select class="form-select" id="genreFilter">
                                <option value="all" ${activeGenreFilter === 'all' ? 'selected' : ''}>Все жанры</option>
                                ${genres.map(g => `
                                    <option value="${g}" ${activeGenreFilter === g ? 'selected' : ''}>${g}</option>
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

                <div id="booksGrid" class="row g-4">
                    ${books.length === 0 ? this.getEmptyState() : books.map((b, i) => this.createBookCard(b, i)).join('')}
                </div>

                <div id="bookModalContainer"></div>
            </div>
        `;
    }

    getEmptyState() {
        return `
            <div class="col-12">
                ${window.app.ui.createEmptyState({
                    icon: 'bi-book',
                    title: 'Нет книг',
                    description: 'Добавь свою первую книгу и начни читать!',
                    action: ''
                })}
            </div>
        `;
    }

    createBookCard(book, index) {
        const statuses = {
            'read': { badge: 'Прочитана', color: 'success' },
            'reading': { badge: 'Читаю', color: 'primary' },
            'want_to_read': { badge: 'Хочу прочитать', color: 'warning' }
        };
        const status = statuses[book.status] || statuses['want_to_read'];

        const pagesInfo = book.totalPages ? `${book.currentPage || 0}/${book.totalPages} стр.` : '';
        const readingProgress = book.totalPages && book.currentPage
            ? Math.round((book.currentPage / book.totalPages) * 100)
            : 0;

        return `
            <div class="col-12 col-md-6 col-lg-4 book-card fade-in-up" style="animation-delay: ${index * 0.1}s">
                <div class="card-premium h-100">
                    <div class="p-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <span class="badge bg-${status.color}">${status.badge}</span>
                            <div class="book-card-actions">
                                <button class="btn btn-sm btn-outline-primary rounded-circle me-1 edit-book-btn" data-id="${book.id}">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger rounded-circle delete-book-btn" data-id="${book.id}">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>

                        <h5 class="fw-bold mb-1">${book.title || 'Без названия'}</h5>
                        <p class="text-muted small mb-2">${book.author || 'Автор не указан'}</p>

                        ${book.genres?.length ? `
                            <div class="mb-2">
                                ${book.genres.map(g => `<span class="badge bg-light text-dark me-1">${g}</span>`).join('')}
                            </div>
                        ` : ''}

                        ${book.status === 'reading' && readingProgress > 0 ? `
                            <div class="mb-2">
                                <div class="d-flex justify-content-between small mb-1">
                                    <span class="text-muted">${pagesInfo}</span>
                                    <span class="fw-bold">${readingProgress}%</span>
                                </div>
                                <div class="progress" style="height: 4px;">
                                    <div class="progress-bar" style="width: ${readingProgress}%"></div>
                                </div>
                            </div>
                        ` : ''}

                        <div class="d-flex justify-content-between align-items-center">
                            ${book.userRating ? `
                                <span class="badge px-2 py-1" style="background: var(--primary);">
                                    <i class="bi bi-star-fill me-1" style="font-size: 0.65rem;"></i>
                                    ${book.userRating}/10
                                </span>
                            ` : '<span></span>'}
                            <small class="text-muted">${this.formatDate(book.createdAt)}</small>
                        </div>

                        ${book.review ? `
                            <p class="text-muted small mt-2 mb-0">${this.truncate(book.review, 80)}</p>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        document.getElementById('addBookBtn')?.addEventListener('click', () => this.showBookModal(null));

        document.querySelectorAll('.edit-book-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showBookModal(btn.dataset.id);
            });
        });

        document.querySelectorAll('.delete-book-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Удалить эту книгу?')) {
                    const result = await this.bookService.deleteBook(window.app.currentUser.uid, btn.dataset.id);
                    if (result.success) {
                        window.app.ui.showToast('Книга удалена', 'info');
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

        document.getElementById('genreFilter')?.addEventListener('change', (e) => {
            this.currentFilter.genre = e.target.value;
            this.render();
        });

        document.getElementById('ratingFilter')?.addEventListener('change', (e) => {
            this.currentFilter.rating = parseInt(e.target.value);
            this.render();
        });
    }

    async showBookModal(bookId) {
        document.getElementById('bookModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const userId = window.app.currentUser.uid;
        const book = bookId ? await this.bookService.getBook(userId, bookId) : null;
        const isEdit = !!book;

        const genres = [
            'Фантастика', 'Детектив', 'Роман', 'Биография', 'История',
            'Психология', 'Бизнес', 'Наука', 'Философия', 'Поэзия', 'Другое'
        ];

        const modalContainer = document.createElement('div');
        modalContainer.id = 'bookModalContainer';
        document.body.appendChild(modalContainer);

        modalContainer.innerHTML = `
            <div class="modal fade" id="bookModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header border-0">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-plus-circle'} text-info me-2"></i>
                                ${isEdit ? 'Редактировать книгу' : 'Новая книга'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="bookForm">
                                <div class="row mb-3">
                                    <div class="col-8">
                                        <label class="form-label fw-semibold">Название *</label>
                                        <input type="text" class="form-control" name="title" 
                                               value="${book?.title || ''}" placeholder="Название книги" required>
                                    </div>
                                    <div class="col-4">
                                        <label class="form-label fw-semibold">Автор *</label>
                                        <input type="text" class="form-control" name="author" 
                                               value="${book?.author || ''}" placeholder="Автор" required>
                                    </div>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-4">
                                        <label class="form-label fw-semibold">Статус</label>
                                        <select class="form-select" name="status">
                                            <option value="want_to_read" ${book?.status === 'want_to_read' ? 'selected' : ''}>Хочу прочитать</option>
                                            <option value="reading" ${book?.status === 'reading' ? 'selected' : ''}>Читаю</option>
                                            <option value="read" ${book?.status === 'read' ? 'selected' : ''}>Прочитана</option>
                                        </select>
                                    </div>
                                    <div class="col-4">
                                        <label class="form-label fw-semibold">Жанры</label>
                                        <select class="form-select" name="genres" multiple size="3">
                                            ${genres.map(g => `
                                                <option value="${g}" ${book?.genres?.includes(g) ? 'selected' : ''}>${g}</option>
                                            `).join('')}
                                        </select>
                                        <small class="text-muted">Зажми Ctrl для выбора нескольких</small>
                                    </div>
                                    <div class="col-4">
                                        <label class="form-label fw-semibold">Год издания</label>
                                        <input type="number" class="form-control" name="year" 
                                               value="${book?.year || ''}" placeholder="2024" min="1000" max="2099">
                                    </div>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-4">
                                        <label class="form-label fw-semibold">Всего страниц</label>
                                        <input type="number" class="form-control" name="totalPages" 
                                               value="${book?.totalPages || ''}" placeholder="0">
                                    </div>
                                    <div class="col-4">
                                        <label class="form-label fw-semibold">Прочитано</label>
                                        <input type="number" class="form-control" name="currentPage" 
                                               value="${book?.currentPage || ''}" placeholder="0">
                                    </div>
                                    <div class="col-4">
                                        <label class="form-label fw-semibold">Моя оценка</label>
                                        <div class="d-flex align-items-center gap-2 pt-2">
                                            <input type="range" class="form-range" name="userRating" 
                                                   min="0" max="10" value="${book?.userRating || 0}" 
                                                   style="flex: 1;" id="ratingSlider">
                                            <span class="badge px-2 py-1" id="ratingValue" 
                                                  style="background: var(--primary); min-width: 40px;">
                                                ${book?.userRating || 0}/10
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Рецензия</label>
                                    <textarea class="form-control" name="review" rows="3" 
                                              placeholder="Твои мысли о книге...">${book?.review || ''}</textarea>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">
                                        <i class="bi bi-chat-quote me-1"></i>Любимые цитаты
                                    </label>
                                    <div id="quotesContainer">
                                        ${book?.quotes?.length ? book.quotes.map((q, i) => `
                                            <div class="input-group mb-2 quote-row">
                                                <input type="text" class="form-control" value="${q}" placeholder="Цитата из книги...">
                                                <button type="button" class="btn btn-outline-danger btn-sm remove-quote-btn">
                                                    <i class="bi bi-x"></i>
                                                </button>
                                            </div>
                                        `).join('') : `
                                            <div class="input-group mb-2 quote-row">
                                                <input type="text" class="form-control" placeholder="Цитата из книги...">
                                                <button type="button" class="btn btn-outline-danger btn-sm remove-quote-btn">
                                                    <i class="bi bi-x"></i>
                                                </button>
                                            </div>
                                        `}
                                    </div>
                                    <button type="button" class="btn btn-outline-primary btn-sm" id="addQuoteBtn">
                                        <i class="bi bi-plus me-1"></i>Добавить цитату
                                    </button>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label fw-semibold">Заметки</label>
                                    <textarea class="form-control" name="notes" rows="2" 
                                              placeholder="Личные заметки...">${book?.notes || ''}</textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer border-0">
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
            modalContainer.remove();
            document.body.style.overflow = '';
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        });

        // Слайдер
        const ratingSlider = document.getElementById('ratingSlider');
        const ratingValue = document.getElementById('ratingValue');
        if (ratingSlider && ratingValue) {
            ratingSlider.addEventListener('input', () => {
                ratingValue.textContent = ratingSlider.value + '/10';
            });
        }

        // Добавление цитаты
        document.getElementById('addQuoteBtn')?.addEventListener('click', () => {
            const container = document.getElementById('quotesContainer');
            const row = document.createElement('div');
            row.className = 'input-group mb-2 quote-row';
            row.innerHTML = `
                <input type="text" class="form-control" placeholder="Цитата из книги...">
                <button type="button" class="btn btn-outline-danger btn-sm remove-quote-btn">
                    <i class="bi bi-x"></i>
                </button>
            `;
            container.appendChild(row);
            row.querySelector('.remove-quote-btn').addEventListener('click', () => row.remove());
        });

        document.querySelectorAll('.remove-quote-btn').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.quote-row').remove());
        });

        // Сохранение
        document.getElementById('saveBookBtn').addEventListener('click', async () => {
            const form = document.getElementById('bookForm');
            const formData = new FormData(form);

            const genres = formData.getAll('genres');
            const quotes = [];
            document.querySelectorAll('.quote-row input').forEach(input => {
                if (input.value.trim()) quotes.push(input.value.trim());
            });

            const data = {
                title: formData.get('title'),
                author: formData.get('author'),
                status: formData.get('status'),
                genres: genres,
                year: parseInt(formData.get('year')) || null,
                totalPages: parseInt(formData.get('totalPages')) || 0,
                currentPage: parseInt(formData.get('currentPage')) || 0,
                userRating: parseInt(formData.get('userRating')) || 0,
                review: formData.get('review'),
                quotes: quotes,
                notes: formData.get('notes')
            };

            if (!data.title || !data.author) {
                window.app.ui.showToast('Введи название и автора', 'warning');
                return;
            }

            const userId = window.app.currentUser.uid;
            let result;

            if (isEdit) {
                result = await this.bookService.updateBook(userId, bookId, data);
            } else {
                result = await this.bookService.addBook(userId, data);
            }

            if (result.success) {
                modal.hide();
                window.app.ui.showToast(
                    isEdit ? 'Книга обновлена! 📚' : 'Книга добавлена! 📖',
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