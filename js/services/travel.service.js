import { db } from '../config/firebase.js';
import { 
    collection,
    doc,
    addDoc,
    getDocs,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class TravelService {
    constructor() {
        this.db = db;
        this.cache = new Map();
    }

    async getTravels(userId, filters = {}) {
        try {
            const cacheKey = `travels_${userId}_${JSON.stringify(filters)}`;
            
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < 30000) {
                    return cached.data;
                }
            }
            
            const travelsRef = collection(this.db, 'users', userId, 'travels');
            let q = query(travelsRef, orderBy('createdAt', 'desc'));
            
            if (filters.status && filters.status !== 'all') {
                q = query(q, where('status', '==', filters.status));
            }
            
            const snapshot = await getDocs(q);
            let travels = [];
            
            snapshot.forEach(doc => {
                if (doc.id !== '_init') {
                    const data = doc.data();
                    travels.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date(),
                        updatedAt: data.updatedAt?.toDate?.() || null
                    });
                }
            });
            
            // Фильтрация по типу на клиенте (если нужно)
            if (filters.type && filters.type !== 'all') {
                travels = travels.filter(t => t.type === filters.type);
            }
            
            this.cache.set(cacheKey, {
                data: travels,
                timestamp: Date.now()
            });
            
            return travels;
        } catch (error) {
            console.error('Ошибка загрузки путешествий:', error);
            return [];
        }
    }

    async addTravel(userId, travelData) {
        try {
            const travelsRef = collection(this.db, 'users', userId, 'travels');
            
            const newTravel = {
                ...travelData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                photos: travelData.photos || [],
                budget: travelData.budget || { spent: 0, planned: 0, currency: 'RUB' },
                rating: travelData.rating || 0,
                notes: travelData.notes || '',
                isPublic: travelData.isPublic !== false
            };
            
            const docRef = await addDoc(travelsRef, newTravel);
            
            // Очищаем кеш
            this.clearCache(userId);
            
            // Обновляем статистику
            await this.updateUserStats(userId);
            
            // Получаем созданный документ для возврата
            const createdDoc = await getDoc(docRef);
            
            return { 
                success: true, 
                id: docRef.id,
                travel: {
                    id: docRef.id,
                    ...createdDoc.data(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            };
        } catch (error) {
            console.error('Ошибка добавления путешествия:', error);
            return { success: false, error: error.message };
        }
    }

    async updateTravel(userId, travelId, updates) {
        try {
            const travelRef = doc(this.db, 'users', userId, 'travels', travelId);
            
            await updateDoc(travelRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            
            this.clearCache(userId);
            
            return { success: true };
        } catch (error) {
            console.error('Ошибка обновления путешествия:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteTravel(userId, travelId) {
        try {
            const travelRef = doc(this.db, 'users', userId, 'travels', travelId);
            await deleteDoc(travelRef);
            
            this.clearCache(userId);
            await this.updateUserStats(userId);
            
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления путешествия:', error);
            return { success: false, error: error.message };
        }
    }

    async getTravel(userId, travelId) {
        try {
            const travelRef = doc(this.db, 'users', userId, 'travels', travelId);
            const travelDoc = await getDoc(travelRef);
            
            if (travelDoc.exists()) {
                const data = travelDoc.data();
                return {
                    id: travelDoc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate?.() || new Date(),
                    updatedAt: data.updatedAt?.toDate?.() || null
                };
            }
            return null;
        } catch (error) {
            console.error('Ошибка загрузки путешествия:', error);
            return null;
        }
    }

    async updateUserStats(userId) {
        try {
            const allTravels = await this.getTravels(userId);
            const planned = allTravels.filter(t => t.status === 'planned').length;
            const visited = allTravels.filter(t => t.status === 'visited').length;
            
            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, {
                'stats.travels': allTravels.length,
                'stats.travelsPlanned': planned,
                'stats.travelsVisited': visited
            });
        } catch (error) {
            console.error('Ошибка обновления статистики:', error);
        }
    }

    clearCache(userId) {
        for (const key of this.cache.keys()) {
            if (key.includes(userId)) {
                this.cache.delete(key);
            }
        }
    }
}