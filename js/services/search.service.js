import { auth, db } from '../config/firebase.js';
import { isAuthenticatedOwner } from '../core/owner-access-policy.js';
import { collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class SearchService {
    constructor() {
        this.db = db;
        this.cache = null;
        this.cacheTime = 0;
        this.cacheUserId = null;
    }

    isCurrentOwner(userId) {
        return isAuthenticatedOwner(userId, auth?.currentUser?.uid);
    }

    async searchAll(userId, query) {
        if (!this.isCurrentOwner(userId)) return [];
        const searchTerm = query.toLowerCase().trim();
        if (!searchTerm) return [];

        // Кеш изолирован по UID: результаты одного аккаунта нельзя показывать другому.
        if (this.cacheUserId !== userId) {
            this.cache = null;
            this.cacheTime = 0;
            this.cacheUserId = userId;
        }

        // Кеш на 30 секунд только для текущего аккаунта.
        if (this.cache && this.cacheUserId === userId && Date.now() - this.cacheTime < 30000) {
            return this.isCurrentOwner(userId) ? this.filterCache(searchTerm) : [];
        }

        const results = [];

        try {
            // Путешествия
            if (!this.isCurrentOwner(userId)) return [];
            const travelsSnap = await getDocs(collection(this.db, 'users', userId, 'travels'));
            if (!this.isCurrentOwner(userId)) return [];
            travelsSnap.forEach(doc => {
                if (doc.id === '_init') return;
                const data = doc.data();
                results.push({
                    id: doc.id,
                    type: 'travel',
                    typeName: 'Путешествие',
                    icon: 'bi-airplane',
                    color: 'primary',
                    title: data.title || '',
                    description: data.description || '',
                    location: data.location || '',
                    date: data.createdAt?.toDate?.() || new Date(),
                    link: '#travels'
                });
            });

            // Рестораны
            if (!this.isCurrentOwner(userId)) return [];
            const restSnap = await getDocs(collection(this.db, 'users', userId, 'restaurants'));
            if (!this.isCurrentOwner(userId)) return [];
            restSnap.forEach(doc => {
                if (doc.id === '_init') return;
                const data = doc.data();
                results.push({
                    id: doc.id,
                    type: 'restaurant',
                    typeName: 'Ресторан',
                    icon: 'bi-shop',
                    color: 'success',
                    title: data.name || '',
                    description: data.review || '',
                    location: data.address || '',
                    date: data.createdAt?.toDate?.() || new Date(),
                    link: '#food'
                });
            });

            // Фильмы
            if (!this.isCurrentOwner(userId)) return [];
            const moviesSnap = await getDocs(collection(this.db, 'users', userId, 'movies'));
            if (!this.isCurrentOwner(userId)) return [];
            moviesSnap.forEach(doc => {
                if (doc.id === '_init') return;
                const data = doc.data();
                results.push({
                    id: doc.id,
                    type: 'movie',
                    typeName: 'Фильм',
                    icon: 'bi-film',
                    color: 'warning',
                    title: data.title || '',
                    description: data.review || data.overview || '',
                    location: '',
                    date: data.createdAt?.toDate?.() || new Date(),
                    link: '#movies'
                });
            });

            // Книги
            if (!this.isCurrentOwner(userId)) return [];
            const booksSnap = await getDocs(collection(this.db, 'users', userId, 'books'));
            if (!this.isCurrentOwner(userId)) return [];
            booksSnap.forEach(doc => {
                if (doc.id === '_init') return;
                const data = doc.data();
                results.push({
                    id: doc.id,
                    type: 'book',
                    typeName: 'Книга',
                    icon: 'bi-book',
                    color: 'danger',
                    title: data.title || '',
                    description: data.review || '',
                    location: data.author || '',
                    date: data.createdAt?.toDate?.() || new Date(),
                    link: '#books'
                });
            });

            // Мечты
            if (!this.isCurrentOwner(userId)) return [];
            const dreamsSnap = await getDocs(collection(this.db, 'users', userId, 'dreams'));
            if (!this.isCurrentOwner(userId)) return [];
            dreamsSnap.forEach(doc => {
                if (doc.id === '_init') return;
                const data = doc.data();
                results.push({
                    id: doc.id,
                    type: 'dream',
                    typeName: 'Мечта',
                    icon: 'bi-star',
                    color: 'info',
                    title: data.title || '',
                    description: data.description || '',
                    location: data.category || '',
                    date: data.createdAt?.toDate?.() || new Date(),
                    link: '#dreams'
                });
            });

            if (!this.isCurrentOwner(userId)) return [];
            if (this.cacheUserId === userId) {
                this.cache = results;
                this.cacheTime = Date.now();
            }

            return this.isCurrentOwner(userId) ? this.filterCache(searchTerm) : [];
        } catch (error) {
            console.error('Ошибка поиска:', error);
            return [];
        }
    }

    filterCache(searchTerm) {
        if (!this.cache) return [];
        
        return this.cache.filter(item => {
            const title = (item.title || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const loc = (item.location || '').toLowerCase();
            const type = (item.typeName || '').toLowerCase();
            
            return title.includes(searchTerm) || 
                   desc.includes(searchTerm) || 
                   loc.includes(searchTerm) ||
                   type.includes(searchTerm);
        }).slice(0, 20);
    }
}