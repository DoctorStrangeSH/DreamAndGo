import { db } from '../config/firebase.js';
import { 
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class RestaurantService {
    constructor() {
        this.db = db;
    }

    async getRestaurants(userId, filters = {}) {
        try {
            const restaurantsRef = collection(this.db, 'users', userId, 'restaurants');
            let q = query(restaurantsRef, orderBy('createdAt', 'desc'));

            if (filters.cuisine && filters.cuisine !== 'all') {
                q = query(q, where('cuisine', '==', filters.cuisine));
            }
            if (filters.status && filters.status !== 'all') {
                q = query(q, where('status', '==', filters.status));
            }

            const snapshot = await getDocs(q);
            const restaurants = [];

            snapshot.forEach(doc => {
                if (doc.id !== '_init') {
                    const data = doc.data();
                    restaurants.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date()
                    });
                }
            });

            if (filters.rating && filters.rating > 0) {
                return restaurants.filter(r => r.userRating >= filters.rating);
            }

            return restaurants;
        } catch (error) {
            console.error('Ошибка загрузки ресторанов:', error);
            return [];
        }
    }

    async addRestaurant(userId, data) {
        try {
            const restaurantsRef = collection(this.db, 'users', userId, 'restaurants');
            const newRestaurant = {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                photos: data.photos || [],
                userRating: data.userRating || 0,
                visitDate: data.visitDate || null,
                notes: data.notes || '',
                favoriteDishes: data.favoriteDishes || [],
                isPublic: data.isPublic !== false
            };

            const docRef = await addDoc(restaurantsRef, newRestaurant);
            await this.updateUserStats(userId);

            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Ошибка добавления ресторана:', error);
            return { success: false, error: error.message };
        }
    }

    async updateRestaurant(userId, restaurantId, updates) {
        try {
            const restaurantRef = doc(this.db, 'users', userId, 'restaurants', restaurantId);
            await updateDoc(restaurantRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            await this.updateUserStats(userId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка обновления ресторана:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteRestaurant(userId, restaurantId) {
        try {
            const restaurantRef = doc(this.db, 'users', userId, 'restaurants', restaurantId);
            await deleteDoc(restaurantRef);
            await this.updateUserStats(userId);
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления ресторана:', error);
            return { success: false, error: error.message };
        }
    }

    async getRestaurant(userId, restaurantId) {
        try {
            const restaurantRef = doc(this.db, 'users', userId, 'restaurants', restaurantId);
            const restaurantDoc = await getDoc(restaurantRef);
            if (restaurantDoc.exists()) {
                return { id: restaurantDoc.id, ...restaurantDoc.data() };
            }
            return null;
        } catch (error) {
            console.error('Ошибка загрузки ресторана:', error);
            return null;
        }
    }

    async updateUserStats(userId) {
        try {
            const restaurants = await this.getRestaurants(userId);
            const visited = restaurants.filter(r => r.status === 'visited').length;
            const wantToVisit = restaurants.filter(r => r.status === 'want_to_visit').length;

            const userRef = doc(this.db, 'users', userId);
            await updateDoc(userRef, {
                'stats.restaurants': restaurants.length,
                'stats.restaurantsVisited': visited,
                'stats.restaurantsWantToVisit': wantToVisit
            });
        } catch (error) {
            console.error('Ошибка обновления статистики:', error);
        }
    }
}