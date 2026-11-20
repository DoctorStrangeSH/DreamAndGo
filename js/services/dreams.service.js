import { auth, db } from '../config/firebase.js';
import { isAuthenticatedOwner, isValidFirestoreDocumentId } from '../core/owner-access-policy.js';
import { validateDreamInput } from '../core/dream-input-policy.js';
import { 
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class DreamsService {
    constructor() {
        this.db = db;
    }

    async getDreams(userId, filters = {}, { throwOnError = false } = {}) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) {
            if (throwOnError) throw new Error('Недостаточно прав для доступа к мечтам.');
            return [];
        }
        const validStatuses = new Set(['all', 'dreaming', 'in_progress', 'completed']);
        const validCategories = new Set(['all', '', 'Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое']);
        if (!validStatuses.has(filters.status || 'all') || !validCategories.has(filters.category || 'all')) {
            if (throwOnError) throw new Error('Некорректные фильтры мечт.');
            return [];
        }
        try {
            const dreamsRef = collection(this.db, 'users', userId, 'dreams');
            let q = query(dreamsRef, orderBy('createdAt', 'desc'));

            if (filters.status && filters.status !== 'all') {
                q = query(q, where('status', '==', filters.status));
            }
            if (filters.category && filters.category !== 'all') {
                q = query(q, where('category', '==', filters.category));
            }

            const snapshot = await getDocs(q);
            const dreams = [];

            snapshot.forEach(doc => {
                if (doc.id !== '_init') {
                    const data = doc.data();
                    dreams.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date(),
                        deadline: data.deadline || null
                    });
                }
            });

            return dreams;
        } catch (error) {
            console.error('Ошибка загрузки мечт:', error);
            if (throwOnError) throw error;
            return [];
        }
    }

    async addDream(userId, data) {
        if (!this.isOwner(userId)) return { success: false, error: 'Недостаточно прав.' };
        try {
            const safeData = validateDreamInput(data);
            const dreamsRef = collection(this.db, 'users', userId, 'dreams');
            const newDream = {
                ...safeData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                isPublic: false
            };

            const docRef = await addDoc(dreamsRef, newDream);
            await this.updateUserStats(userId);

            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Ошибка добавления мечты:', error);
            return { success: false, error: error.message };
        }
    }

    async updateDream(userId, dreamId, updates) {
        if (!this.isOwner(userId) || !isValidFirestoreDocumentId(dreamId)) {
            return { success: false, error: 'Недостаточно прав или неверный идентификатор.' };
        }
        try {
            const dreamRef = doc(this.db, 'users', userId, 'dreams', dreamId);
            const existing = await getDoc(dreamRef);
            if (!existing.exists()) return { success: false, error: 'Мечта не найдена.' };
            const current = existing.data();
            const editable = {
                title: current.title,
                category: current.category,
                status: current.status,
                description: current.description,
                progress: current.progress,
                deadline: current.deadline,
                steps: current.steps
            };
            const safeData = validateDreamInput({ ...editable, ...updates });
            await updateDoc(dreamRef, {
                ...safeData,
                updatedAt: serverTimestamp()
            });
            await this.updateUserStats(userId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка обновления мечты:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteDream(userId, dreamId) {
        if (!this.isOwner(userId) || !this.isValidDocumentId(dreamId)) {
            return { success: false, error: 'Недостаточно прав или неверный идентификатор.' };
        }
        try {
            const dreamRef = doc(this.db, 'users', userId, 'dreams', dreamId);
            await deleteDoc(dreamRef);
            await this.updateUserStats(userId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления мечты:', error);
            return { success: false, error: error.message };
        }
    }

    async getDream(userId, dreamId) {
        if (!this.isOwner(userId) || !this.isValidDocumentId(dreamId)) return null;
        try {
            const dreamRef = doc(this.db, 'users', userId, 'dreams', dreamId);
            const dreamDoc = await getDoc(dreamRef);
            if (dreamDoc.exists()) {
                return { id: dreamDoc.id, ...dreamDoc.data() };
            }
            return null;
        } catch (error) {
            console.error('Ошибка загрузки мечты:', error);
            return null;
        }
    }

    async updateUserStats(userId) {
        if (!this.isOwner(userId)) return;
        try {
            const dreams = await this.getDreams(userId, {}, { throwOnError: true });
            const dreaming = dreams.filter(d => d.status === 'dreaming').length;
            const inProgress = dreams.filter(d => d.status === 'in_progress').length;
            const completed = dreams.filter(d => d.status === 'completed').length;

            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, {
                'stats.dreams': dreams.length,
                'stats.dreamsCompleted': completed,
                'stats.dreamsInProgress': inProgress
            });
        } catch (error) {
            console.error('Ошибка обновления статистики:', error);
        }
    }
}