import { db } from '../config/firebase.js';
import { 
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class BookService {
    constructor() {
        this.db = db;
    }

    async getBooks(userId, filters = {}) {
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

            if (filters.genre && filters.genre !== 'all') {
                return books.filter(b => b.genres?.includes(filters.genre));
            }

            if (filters.rating && filters.rating > 0) {
                return books.filter(b => b.userRating >= filters.rating);
            }

            return books;
        } catch (error) {
            console.error('Ошибка загрузки книг:', error);
            return [];
        }
    }

    async addBook(userId, data) {
        try {
            const booksRef = collection(this.db, 'users', userId, 'books');
            const newBook = {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                userRating: data.userRating || 0,
                review: data.review || '',
                notes: data.notes || '',
                quotes: data.quotes || [],
                isPublic: data.isPublic !== false
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
        try {
            const bookRef = doc(this.db, 'users', userId, 'books', bookId);
            await updateDoc(bookRef, {
                ...updates,
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
        try {
            const books = await this.getBooks(userId);
            const reading = books.filter(b => b.status === 'reading').length;
            const read = books.filter(b => b.status === 'read').length;
            const wantToRead = books.filter(b => b.status === 'want_to_read').length;

            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, {
                'stats.books': books.length,
                'stats.booksRead': read,
                'stats.booksReading': reading,
                'stats.booksWantToRead': wantToRead
            });
        } catch (error) {
            console.error('Ошибка обновления статистики:', error);
        }
    }
}