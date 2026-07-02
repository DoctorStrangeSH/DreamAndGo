import { MovieService } from '../../services/movie.service.js';
import { APP_CONFIG } from '../../config/constants.js';

export class MoviesModule {
    constructor() {
        this.movieService = new MovieService();
        this.currentTab = 'my';
        this.currentFilter = { status: 'all', genre: 'all' };
        this.searchQuery = '';
        this.searchPage = 1;
        this.popularPage = 1;
        this.myMoviesPage = 1;
        this.requestId = 0;
        this.ITEMS_PER_PAGE = 12;
    }

    async render() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;

        const userId = window.app.currentUser?.uid;
        if (!userId) return;

        mainContent.innerHTML = this.getTemplate();
        this.attachEventListeners();
        await this.loadMyMovies();
    }

    getTemplate() {
        return `
            <div class="fade-in-up">
                <div class="page-header mb-4">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="fw-bold mb-0">
                                <i class="bi bi-film text-warning me-2"></i>Кино и сериалы
                            </h2>
                            <p class="text-muted mb-0">Твоя коллекция фильмов</p>
                        </div>
                    </div>
                </div>

                <ul class="nav nav-tabs movies-tabs mb-4">
                    <li class="nav-item">
                        <button class="nav-link active" data-tab="my">
                            <i class="bi bi-collection me-1"></i>Мои фильмы
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="popular">
                            <i class="bi bi-fire me-1"></i>Популярное
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" data-tab="search">
                            <i class="bi bi-search me-1"></i>Поиск
                        </button>
                    </li>
                </ul>

                <div id="searchSection" class="mb-4" style="display: none;">
                    <div class="input-group">
                        <span class="input-group-text"><i class="bi bi-search"></i></span>
                        <input type="text" class="form-control" id="searchInput" placeholder="Название фильма...">
                        <button class="btn btn-premium" id="searchBtn">Найти</button>
                    </div>
                </div>

                <div id="filtersSection" class="mb-4">
                    <div class="row g-2">
                        <div class="col-12 col-md-6">
                            <div class="btn-group btn-group-sm" id="statusFilters">
                                <button class="btn btn-outline-secondary active" data-filter="all">Все</button>
                                <button class="btn btn-outline-secondary" data-filter="watched">
                                    <i class="bi bi-eye me-1"></i>Просмотрено
                                </button>
                                <button class="btn btn-outline-secondary" data-filter="to_watch">
                                    <i class="bi bi-bookmark me-1"></i>Посмотреть
                                </button>
                            </div>
                        </div>
                        <div class="col-12 col-md-3">
                            <select class="form-select form-select-sm" id="genreFilter">
                                <option value="all">Все жанры</option>
                                ${Object.entries(APP_CONFIG.MOVIE_GENRES).map(([id, name]) => `
                                    <option value="${id}">${name}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <div id="moviesGrid" class="row g-3"></div>
                <div id="movieModalContainer"></div>
            </div>
        `;
    }

    async loadMyMovies() {
        const grid = document.getElementById('moviesGrid');
        if (!grid) return;

        const pagination = document.getElementById('pagination');
        if (pagination) pagination.remove();

        grid.innerHTML = window.app.ui.createLoader();

        const userId = window.app.currentUser.uid;
        const allMovies = await this.movieService.getUserMovies(userId, this.currentFilter);

        if (allMovies.length === 0) {
            grid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-film display-1 text-muted opacity-25"></i>
                    <h5 class="mt-3 text-muted">Нет фильмов</h5>
                    <p class="text-muted small">Добавь фильмы в коллекцию</p>
                    <button class="btn btn-premium btn-sm" id="goToSearch">
                        <i class="bi bi-search me-1"></i>Найти фильмы
                    </button>
                </div>
            `;
            document.getElementById('goToSearch')?.addEventListener('click', () => this.switchTab('search'));
            return;
        }

        const totalPages = Math.ceil(allMovies.length / this.ITEMS_PER_PAGE);

        if (totalPages > 1) {
            this.createPaginationElement();
            const start = (this.myMoviesPage - 1) * this.ITEMS_PER_PAGE;
            const pageMovies = allMovies.slice(start, start + this.ITEMS_PER_PAGE);
            grid.innerHTML = pageMovies.map((m, i) => this.createCard(m, i)).join('');
            this.renderPagination(totalPages, 'my');
        } else {
            grid.innerHTML = allMovies.map((m, i) => this.createCard(m, i)).join('');
        }

        this.attachCardListeners();
    }

    async loadPopularMovies() {
        const requestId = ++this.requestId;
        const grid = document.getElementById('moviesGrid');
        if (!grid) return;

        if (!document.getElementById('pagination')) this.createPaginationElement();

        grid.innerHTML = window.app.ui.createLoader();

        try {
            const result = await this.movieService.getPopularMovies(this.popularPage);

            if (requestId !== this.requestId || this.currentTab !== 'popular') return;

            if (result.movies.length === 0) {
                grid.innerHTML = `
                    <div class="col-12 text-center py-5">
                        <i class="bi bi-cloud-slash display-1 text-muted opacity-25"></i>
                        <h5 class="mt-3">Не удалось загрузить</h5>
                    </div>
                `;
            } else {
                grid.innerHTML = result.movies.map((m, i) => this.createCard(m, i, true)).join('');
                this.attachCardListeners();
                if (requestId === this.requestId && this.currentTab === 'popular') {
                    this.renderPagination(result.totalPages, 'popular');
                }
            }
        } catch (error) {
            if (requestId === this.requestId && this.currentTab === 'popular') {
                grid.innerHTML = `
                    <div class="col-12 text-center py-5">
                        <i class="bi bi-cloud-slash display-1 text-muted opacity-25"></i>
                        <h5 class="mt-3">Не удалось загрузить</h5>
                    </div>
                `;
            }
        }
    }

    async searchMovies() {
        const grid = document.getElementById('moviesGrid');
        if (!grid || !this.searchQuery.trim()) return;

        if (!document.getElementById('pagination')) this.createPaginationElement();

        grid.innerHTML = window.app.ui.createLoader();

        const result = await this.movieService.searchMovies(this.searchQuery, this.searchPage);

        if (this.currentTab !== 'search') return;

        if (result.movies.length === 0) {
            const pagination = document.getElementById('pagination');
            if (pagination) { pagination.style.display = 'none'; pagination.innerHTML = ''; }
            grid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-emoji-frown display-1 text-muted opacity-25"></i>
                    <h5 class="mt-3">Ничего не найдено</h5>
                </div>
            `;
        } else {
            grid.innerHTML = result.movies.map((m, i) => this.createCard(m, i, true)).join('');
            this.attachCardListeners();
            if (this.currentTab === 'search') this.renderPagination(result.totalPages, 'search');
        }
    }

    createCard(movie, index, showAddButton = false) {
        const genres = movie.genreIds
            ? movie.genreIds.slice(0, 2).map(id => APP_CONFIG.MOVIE_GENRES[id] || '').filter(Boolean)
            : [];

        const statusBadge = movie.status === 'watched'
            ? '<span class="badge bg-success bg-opacity-10 text-success">✓ Просмотрен</span>'
            : movie.status === 'to_watch'
                ? '<span class="badge bg-info bg-opacity-10 text-info">☆ Буду смотреть</span>'
                : '';

        const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : '';

        return `
            <div class="col-6 col-md-4 col-lg-3 fade-in-up" style="animation-delay: ${index * 0.04}s">
                <div class="card-premium h-100 movie-card">
                    <div class="movie-poster">
                        ${movie.poster
                ? `<img src="${movie.poster}" alt="${movie.title}" class="w-100 h-100" style="object-fit: cover;">`
                : `<div class="movie-poster-placeholder">
                                <i class="bi bi-film display-4 text-white opacity-25"></i>
                            </div>`
            }
                        <div class="movie-poster-overlay">
                            <div class="d-flex flex-column gap-1">
                                ${showAddButton
                ? `<button class="btn btn-success btn-sm add-movie-btn" data-movie-id="${movie.id}">
                                        <i class="bi bi-plus-lg"></i> Добавить
                                    </button>`
                : `<button class="btn btn-light btn-sm edit-movie-btn" data-movie-id="${movie.id}">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm delete-movie-btn" data-movie-id="${movie.id}">
                                        <i class="bi bi-trash"></i>
                                    </button>`
            }
                                <button class="btn btn-info btn-sm details-movie-btn" data-movie-id="${movie.id}">
                                    <i class="bi bi-info-circle"></i> Детали
                                </button>
                            </div>
                        </div>
                        ${statusBadge ? `<div class="movie-badge">${statusBadge}</div>` : ''}
                        <div class="movie-rating">
                            <i class="bi bi-star-fill text-warning"></i>
                            <span>${movie.voteAverage || movie.rating || '?'}</span>
                        </div>
                    </div>
                    <div class="p-2">
                        <h6 class="fw-bold mb-0 movie-title">${movie.title}</h6>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">${year}</small>
                            <small class="text-muted">${genres.join(', ')}</small>
                        </div>
                        ${movie.userRating
                ? `<div class="mt-1">
                                <span class="badge" style="background: var(--primary);">
                                    <i class="bi bi-heart-fill me-1" style="font-size: 0.6rem;"></i>${movie.userRating * 2}/10
                                </span>
                            </div>`
                : ''
            }
                    </div>
                </div>
            </div>
        `;
    }

    createPaginationElement() {
        if (document.getElementById('pagination')) return;
        const moviesContent = document.querySelector('#moviesGrid')?.parentElement;
        if (moviesContent) {
            const pagination = document.createElement('div');
            pagination.id = 'pagination';
            pagination.className = 'd-flex justify-content-center mt-3';
            pagination.style.display = 'none';
            moviesContent.appendChild(pagination);
        }
    }

    renderPagination(totalPages, type) {
        if (this.currentTab === 'my' || totalPages <= 1) {
            const pagination = document.getElementById('pagination');
            if (pagination) { pagination.style.display = 'none'; pagination.innerHTML = ''; }
            return;
        }

        const pagination = document.getElementById('pagination');
        if (!pagination) return;

        const currentPage = type === 'search' ? this.searchPage : this.popularPage;

        pagination.style.display = 'flex';
        pagination.innerHTML = `
            <nav>
                <ul class="pagination pagination-sm">
                    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                        <button class="page-link" data-page="${currentPage - 1}" data-type="${type}">
                            <i class="bi bi-chevron-left"></i>
                        </button>
                    </li>
                    ${this.getPageNumbers(currentPage, totalPages).map(page => `
                        <li class="page-item ${page === currentPage ? 'active' : ''}">
                            <button class="page-link" data-page="${page}" data-type="${type}">${page}</button>
                        </li>
                    `).join('')}
                    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                        <button class="page-link" data-page="${currentPage + 1}" data-type="${type}">
                            <i class="bi bi-chevron-right"></i>
                        </button>
                    </li>
                </ul>
            </nav>
        `;

        pagination.querySelectorAll('.page-link').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const page = parseInt(e.target.closest('.page-link').dataset.page);
                const btnType = e.target.closest('.page-link').dataset.type;

                if (btnType === 'search') { this.searchPage = page; await this.searchMovies(); }
                else { this.popularPage = page; await this.loadPopularMovies(); }
            });
        });
    }

    getPageNumbers(current, total) {
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, current - Math.floor(maxVisible / 2));
        let end = Math.min(total, start + maxVisible - 1);
        if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    }

    attachEventListeners() {
        document.querySelectorAll('.movies-tabs [data-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.movies-tabs [data-tab]').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.switchTab(e.target.dataset.tab);
            });
        });

        document.querySelectorAll('#statusFilters [data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#statusFilters [data-filter]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter.status = e.target.dataset.filter;
                this.myMoviesPage = 1;
                this.loadMyMovies();
            });
        });

        document.getElementById('genreFilter')?.addEventListener('change', (e) => {
            this.currentFilter.genre = e.target.value;
            this.myMoviesPage = 1;
            this.loadMyMovies();
        });

        document.getElementById('searchBtn')?.addEventListener('click', () => {
            this.searchQuery = document.getElementById('searchInput')?.value || '';
            this.searchPage = 1;
            this.searchMovies();
        });

        document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchQuery = e.target.value;
                this.searchPage = 1;
                this.searchMovies();
            }
        });
    }

    switchTab(tab) {
        this.currentTab = tab;
        this.requestId++;

        const pagination = document.getElementById('pagination');
        if (pagination) pagination.remove();

        document.getElementById('searchSection').style.display = tab === 'search' ? 'block' : 'none';
        document.getElementById('filtersSection').style.display = tab === 'my' ? 'block' : 'none';

        this.searchPage = 1;
        this.popularPage = 1;
        this.myMoviesPage = 1;

        if (tab === 'popular') this.loadPopularMovies();
        else if (tab === 'search') document.getElementById('moviesGrid').innerHTML = '';
        else this.loadMyMovies();
    }

    attachCardListeners() {
        document.querySelectorAll('.add-movie-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.showAddMovieModal(parseInt(btn.dataset.movieId));
            });
        });

        document.querySelectorAll('.details-movie-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.showMovieDetails(btn.dataset.movieId);
            });
        });

        document.querySelectorAll('.edit-movie-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.showEditMovieModal(btn.dataset.movieId);
            });
        });

        document.querySelectorAll('.delete-movie-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Удалить фильм?')) {
                    await this.movieService.deleteMovie(window.app.currentUser.uid, btn.dataset.movieId);
                    window.app.ui.showToast('Фильм удалён', 'info');
                    await this.loadMyMovies();
                    window.app.refreshUserData();
                }
            });
        });
    }

    async showAddMovieModal(movieId) {
        const details = await this.movieService.getMovieDetails(movieId);
        if (!details) { window.app.ui.showToast('Не удалось загрузить фильм', 'error'); return; }
        this.showMovieFormModal(details, null);
    }

    async showEditMovieModal(movieId) {
        const userId = window.app.currentUser.uid;
        const userMovies = await this.movieService.getUserMovies(userId);
        const movie = userMovies.find(m => m.id === movieId);
        if (movie) this.showMovieFormModal(movie, movieId);
    }

    showMovieFormModal(movieData, existingId) {
        document.getElementById('movieModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const isEdit = !!existingId;
        const userRating10 = (movieData.userRating || 0) * 2;

        const container = document.createElement('div');
        container.id = 'movieModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="movieModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold">
                                <i class="bi ${isEdit ? 'bi-pencil' : 'bi-plus-circle'} text-warning me-2"></i>
                                ${isEdit ? 'Редактировать фильм' : 'Добавить фильм'}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    ${movieData.poster
                ? `<img src="${movieData.poster}" alt="${movieData.title}" class="w-100 rounded">`
                : `<div class="bg-secondary rounded w-100 d-flex align-items-center justify-content-center" style="height: 300px;">
                                            <i class="bi bi-film display-1 text-white opacity-25"></i>
                                        </div>`
            }
                                </div>
                                <div class="col-md-8">
                                    <h4 class="fw-bold">${movieData.title}</h4>
                                    ${movieData.originalTitle ? `<p class="text-muted">${movieData.originalTitle}</p>` : ''}
                                    ${movieData.tagline ? `<p class="fst-italic text-muted">"${movieData.tagline}"</p>` : ''}

                                    <div class="mb-2">
                                        ${movieData.genres ? movieData.genres.map(g =>
                `<span class="badge bg-primary me-1">${g.name || g}</span>`
            ).join('') : ''}
                                    </div>

                                    ${movieData.overview ? `<p class="small text-muted">${movieData.overview.substring(0, 300)}...</p>` : ''}

                                    <form id="movieForm" class="mt-3">
                                        <div class="mb-2">
                                            <label class="form-label fw-semibold small">Статус</label>
                                            <select class="form-select form-select-sm" name="status">
                                                <option value="to_watch" ${movieData.status === 'to_watch' ? 'selected' : ''}>Буду смотреть</option>
                                                <option value="watched" ${movieData.status === 'watched' ? 'selected' : ''}>Просмотрен</option>
                                            </select>
                                        </div>
                                        <div class="mb-2">
                                            <label class="form-label fw-semibold small">Моя оценка (из 10)</label>
                                            <div class="d-flex align-items-center gap-2">
                                                <input type="range" class="form-range" name="userRating"
                                                       min="0" max="10" value="${userRating10}"
                                                       id="ratingSlider" style="flex: 1;">
                                                <span class="badge bg-primary" id="ratingValue">${userRating10}/10</span>
                                            </div>
                                        </div>
                                        <div class="mb-2">
                                            <label class="form-label fw-semibold small">Рецензия</label>
                                            <textarea class="form-control form-control-sm" name="review" rows="3"
                                                      placeholder="Твои мысли о фильме...">${movieData.review || ''}</textarea>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="button" class="btn btn-premium" id="saveMovieBtn">
                                ${isEdit ? 'Сохранить' : 'Добавить в коллекцию'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalElement = document.getElementById('movieModal');
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

        document.getElementById('saveMovieBtn').addEventListener('click', async () => {
            const form = document.getElementById('movieForm');
            const formData = new FormData(form);

            const rawRating = parseInt(formData.get('userRating')) || 0;
            const userRating = Math.round(rawRating / 2);

            const moviePayload = {
                movieId: movieData.id,
                title: movieData.title || 'Без названия',
                originalTitle: movieData.originalTitle || '',
                overview: movieData.overview || '',
                poster: movieData.poster || '',
                backdrop: movieData.backdrop || '',
                voteAverage: movieData.voteAverage || movieData.rating || 0,
                voteCount: movieData.voteCount || 0,
                rating: movieData.rating || movieData.voteAverage || 0,
                releaseDate: movieData.releaseDate || '',
                genreIds: movieData.genres ? movieData.genres.map(g => g.id || g) : (movieData.genreIds || []),
                runtime: movieData.runtime || 0,
                tagline: movieData.tagline || '',
                budget: movieData.budget || 0,
                productionCountries: movieData.productionCountries || [],
                status: formData.get('status'),
                userRating: userRating,
                review: formData.get('review')
            };

            const userId = window.app.currentUser.uid;
            const result = isEdit
                ? await this.movieService.updateMovie(userId, existingId, moviePayload)
                : await this.movieService.addMovie(userId, moviePayload);

            if (result.success) {
                modal.hide();
                window.app.onUserAction('add_movie');
                window.app.ui.showToast(
                    isEdit ? 'Фильм обновлён! 🎬' : 'Фильм добавлен! 🍿',
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

    async showMovieDetails(movieId) {
        const userId = window.app.currentUser.uid;
        const userMovies = await this.movieService.getUserMovies(userId);
        let details = userMovies.find(m => m.id === movieId);
        if (!details) details = await this.movieService.getMovieDetails(movieId);
        if (!details) return;

        document.getElementById('movieModal')?.remove();
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';

        const container = document.createElement('div');
        container.id = 'movieModalContainer';
        document.body.appendChild(container);

        container.innerHTML = `
            <div class="modal fade" id="movieModal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold">${details.title || 'Без названия'}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    ${details.poster
                ? `<img src="${details.poster}" class="w-100 rounded">`
                : '<div class="bg-secondary rounded w-100" style="height: 300px;"></div>'
            }
                                </div>
                                <div class="col-md-8">
                                    <p><strong>Оригинальное название:</strong> ${details.originalTitle || details.title || '—'}</p>
                                    <p><strong>Год:</strong> ${details.releaseDate ? details.releaseDate.split('-')[0] : '—'}</p>
                                    <p><strong>Рейтинг TMDB:</strong> ⭐ ${details.voteAverage || details.rating || '—'} / 10 (${details.voteCount || '0'} голосов)</p>
                                    <p><strong>Длительность:</strong> ${details.runtime || '—'} мин.</p>
                                    <p><strong>Жанры:</strong> ${details.genres?.map(g => g.name).join(', ') || '—'}</p>
                                    <p><strong>Слоган:</strong> ${details.tagline || '—'}</p>
                                    <p><strong>Страны:</strong> ${details.productionCountries?.map(c => c.name).join(', ') || '—'}</p>
                                    ${details.userRating ? `<p><strong>Моя оценка:</strong> ❤️ ${details.userRating * 2} / 10</p>` : ''}
                                    ${details.review ? `<p><strong>Рецензия:</strong></p><p class="fst-italic">"${details.review}"</p>` : ''}
                                    <hr>
                                    <p>${details.overview || ''}</p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modalElement = document.getElementById('movieModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        modalElement.addEventListener('hidden.bs.modal', () => {
            container.remove();
            document.body.style.overflow = '';
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        });
    }
}