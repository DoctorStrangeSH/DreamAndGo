import { db } from '../config/firebase.js';
import { 
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class DreamsService {
    constructor() {
        this.db = db;
    }

    async getDreams(userId, filters = {}) {
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
            return [];
        }
    }

    async addDream(userId, data) {
        try {
            const dreamsRef = collection(this.db, 'users', userId, 'dreams');
            const newDream = {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                status: data.status || 'dreaming',
                progress: data.progress || 0,
                steps: data.steps || [],
                isPublic: data.isPublic !== false
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
        try {
            const dreamRef = doc(this.db, 'users', userId, 'dreams', dreamId);
            await updateDoc(dreamRef, {
                ...updates,
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
        try {
            const dreams = await this.getDreams(userId);
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