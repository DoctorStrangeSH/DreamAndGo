import { db } from '../config/firebase.js';
import { APP_CONFIG } from '../config/constants.js';
import { 
    collection,
    doc,
    addDoc,
    getDocs,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp,
    where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class MovieService {
    constructor() {
        this.db = db;
        this.workerUrl = APP_CONFIG.CLOUDFLARE_WORKER_URL;
        this.cache = new Map();
    }

    async searchMovies(query, page = 1) {
        try {
            const cacheKey = `search_${query}_${page}`;
            
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < 300000) {
                    return cached.data;
                }
            }

            const endpoint = `/proxy/search/movie?query=${encodeURIComponent(query)}&language=ru-RU&page=${page}`;
            const data = await this.fetchFromWorker(endpoint);
            
            if (!data || data.error) {
                throw new Error(data?.error || 'No data');
            }

            const movies = data.results.map(movie => ({
                id: movie.id,
                title: movie.title,
                originalTitle: movie.original_title,
                overview: movie.overview,
                poster: movie.poster_path ? `${this.workerUrl}/image/t/p/w500${movie.poster_path}` : null,
                backdrop: movie.backdrop_path ? `${this.workerUrl}/image/t/p/w1280${movie.backdrop_path}` : null,
                rating: Math.round(movie.vote_average / 2),
                releaseDate: movie.release_date,
                genreIds: movie.genre_ids,
                popularity: movie.popularity,
                voteAverage: movie.vote_average,
                voteCount: movie.vote_count
            }));

            const result = {
                movies,
                totalPages: data.total_pages,
                totalResults: data.total_results,
                page: data.page
            };

            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Ошибка поиска фильмов:', error);
            return { movies: [], totalPages: 0, totalResults: 0, page: 1 };
        }
    }

    async getPopularMovies(page = 1) {
        try {
            const cacheKey = `popular_${page}`;
            
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < 300000) {
                    return cached.data;
                }
            }

            const endpoint = `/proxy/movie/popular?language=ru-RU&page=${page}`;
            const data = await this.fetchFromWorker(endpoint);
            
            if (!data || data.error) {
                throw new Error(data?.error || 'No data');
            }

            const movies = data.results.map(movie => ({
                id: movie.id,
                title: movie.title,
                originalTitle: movie.original_title,
                overview: movie.overview,
                poster: movie.poster_path ? `${this.workerUrl}/image/t/p/w500${movie.poster_path}` : null,
                backdrop: movie.backdrop_path ? `${this.workerUrl}/image/t/p/w1280${movie.backdrop_path}` : null,
                rating: Math.round(movie.vote_average / 2),
                releaseDate: movie.release_date,
                genreIds: movie.genre_ids,
                popularity: movie.popularity,
                voteAverage: movie.vote_average
            }));

            const result = {
                movies,
                totalPages: data.total_pages,
                page: data.page
            };

            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            console.error('Ошибка загрузки популярных фильмов:', error);
            return { movies: [], totalPages: 0, page: 1 };
        }
    }

    async getMovieDetails(movieId) {
        try {
            const endpoint = `/proxy/movie/${movieId}?language=ru-RU`;
            const data = await this.fetchFromWorker(endpoint);
            
            if (!data || data.error) {
                throw new Error(data?.error || 'No data');
            }

            return {
                id: data.id,
                title: data.title,
                originalTitle: data.original_title,
                overview: data.overview,
                poster: data.poster_path ? `${this.workerUrl}/image/t/p/w500${data.poster_path}` : null,
                backdrop: data.backdrop_path ? `${this.workerUrl}/image/t/p/w1280${data.backdrop_path}` : null,
                rating: Math.round(data.vote_average / 2),
                releaseDate: data.release_date,
                genres: data.genres || [],
                runtime: data.runtime,
                budget: data.budget,
                revenue: data.revenue,
                tagline: data.tagline,
                status: data.status,
                voteAverage: data.vote_average,
                voteCount: data.vote_count,
                productionCountries: data.production_countries || []
            };
        } catch (error) {
            console.error('Ошибка загрузки деталей фильма:', error);
            return null;
        }
    }

    async fetchFromWorker(endpoint) {
        const url = `${this.workerUrl}${endpoint}`;
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeout);
            
            if (error.name === 'AbortError') {
                throw new Error('Сервер не отвечает');
            }
            
            throw error;
        }
    }

    async getUserMovies(userId, filters = {}) {
        try {
            const moviesRef = collection(this.db, 'users', userId, 'movies');
            let q = query(moviesRef, orderBy('createdAt', 'desc'));
            
            if (filters.status && filters.status !== 'all') {
                q = query(q, where('status', '==', filters.status));
            }
            
            const snapshot = await getDocs(q);
            const movies = [];
            
            snapshot.forEach(doc => {
                if (doc.id !== '_init') {
                    const data = doc.data();
                    movies.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date()
                    });
                }
            });
            
            if (filters.genre && filters.genre !== 'all') {
                return movies.filter(m => m.genreIds?.includes(parseInt(filters.genre)));
            }
            
            return movies;
        } catch (error) {
            console.error('Ошибка загрузки фильмов пользователя:', error);
            return [];
        }
    }

    async addMovie(userId, movieData) {
        try {
            const moviesRef = collection(this.db, 'users', userId, 'movies');
            
            const newMovie = {
                ...movieData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                status: movieData.status || 'to_watch',
                userRating: movieData.userRating || 0,
                review: movieData.review || '',
                notes: movieData.notes || ''
            };
            
            const docRef = await addDoc(moviesRef, newMovie);
            await this.updateUserStats(userId);
            
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Ошибка добавления фильма:', error);
            return { success: false, error: error.message };
        }
    }

    async updateMovie(userId, movieId, updates) {
        try {
            const movieRef = doc(this.db, 'users', userId, 'movies', movieId);
            await updateDoc(movieRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            
            return { success: true };
        } catch (error) {
            console.error('Ошибка обновления фильма:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteMovie(userId, movieId) {
        try {
            const movieRef = doc(this.db, 'users', userId, 'movies', movieId);
            await deleteDoc(movieRef);
            await this.updateUserStats(userId);
            
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления фильма:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUserStats(userId) {
        try {
            const movies = await this.getUserMovies(userId);
            const watched = movies.filter(m => m.status === 'watched').length;
            const toWatch = movies.filter(m => m.status === 'to_watch').length;
            
            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, {
                'stats.movies': movies.length,
                'stats.moviesWatched': watched,
                'stats.moviesToWatch': toWatch
            });
        } catch (error) {
            console.error('Ошибка обновления статистики:', error);
        }
    }

    clearCache() {
        this.cache.clear();
    }
}