import { auth, db } from '../config/firebase.js';
import { isAuthenticatedOwner, isValidFirestoreDocumentId } from '../core/owner-access-policy.js';
import { refreshUserStats } from './profile-stats.service.js';
import { validateBookInput } from '../core/collection-input-policy.js';
import { 
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class BookService {
    constructor() {
        this.db = db;
    }

    async getBooks(userId, filters = {}, { throwOnError = false } = {}) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) { if (throwOnError) throw new Error('Недостаточно прав.'); return []; }
        try {
            const booksRef = collection(this.db, 'users', userId, 'books');
            let q = query(booksRef, orderBy('createdAt', 'desc'));

            if (filters.status && filters.status !== 'all') {
                q = query(q, where('status', '==', filters.status));
            }

            const snapshot = await getDocs(q);
            const books = [];

            snapshot.forEach(doc => {
                if (doc.id !== '_init') {
                    const data = doc.data();
                    books.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date()
                    });
                }
            });

            // Apply genre and rating together, not as mutually exclusive filters.
            let filteredBooks = books;
            if (filters.genre && filters.genre !== 'all') {
                filteredBooks = filteredBooks.filter(b => b.genres?.includes(filters.genre));
            }

            if (filters.rating && filters.rating > 0) {
                filteredBooks = filteredBooks.filter(b => b.userRating >= filters.rating);
            }

            return filteredBooks;
        } catch (error) {
            console.error('Ошибка загрузки книг:', error);
            if (throwOnError) throw error;
            return [];
        }
    }

    async addBook(userId, data) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) return { success: false, error: 'Недостаточно прав.' };
        let safeData;
        try { safeData = validateBookInput(data); }
        catch (error) { return { success: false, error: error.message }; }
        try {
            const booksRef = collection(this.db, 'users', userId, 'books');
            const newBook = {
                ...safeData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                notes: '',
                isPublic: true
            };

            const docRef = await addDoc(booksRef, newBook);
            await this.updateUserStats(userId);

            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Ошибка добавления книги:', error);
            return { success: false, error: error.message };
        }
    }

    async updateBook(userId, bookId, updates) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid) || !isValidFirestoreDocumentId(bookId)) return { success: false, error: 'Недостаточно прав или неверный идентификатор.' };
        let safeUpdates;
        try { safeUpdates = validateBookInput(updates, { partial: true }); }
        catch (error) { return { success: false, error: error.message }; }
        try {
            const bookRef = doc(this.db, 'users', userId, 'books', bookId);
            await updateDoc(bookRef, {
                ...safeUpdates,
                updatedAt: serverTimestamp()
            });
            await this.updateUserStats(userId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка обновления книги:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteBook(userId, bookId) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid) || !isValidFirestoreDocumentId(bookId)) return { success: false, error: 'Недостаточно прав или неверный идентификатор.' };
        try {
            const bookRef = doc(this.db, 'users', userId, 'books', bookId);
            await deleteDoc(bookRef);
            await this.updateUserStats(userId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления книги:', error);
            return { success: false, error: error.message };
        }
    }

    async getBook(userId, bookId) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid) || !isValidFirestoreDocumentId(bookId)) return null;
        try {
            const bookRef = doc(this.db, 'users', userId, 'books', bookId);
            const bookDoc = await getDoc(bookRef);
            if (bookDoc.exists()) {
                return { id: bookDoc.id, ...bookDoc.data() };
            }
            return null;
        } catch (error) {
            console.error('Ошибка загрузки книги:', error);
            return null;
        }
    }

    async updateUserStats(userId) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) return;
        await refreshUserStats(userId);
    }
}