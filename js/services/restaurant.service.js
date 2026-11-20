import { auth, db } from '../config/firebase.js';
import { isAuthenticatedOwner, isValidFirestoreDocumentId } from '../core/owner-access-policy.js';
import { 
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class RestaurantService {
    constructor() {
        this.db = db;
    }

    async getRestaurants(userId, filters = {}, { throwOnError = false } = {}) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) { if (throwOnError) throw new Error('Недостаточно прав.'); return []; }
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
            if (throwOnError) throw error;
            return [];
        }
    }

    async addRestaurant(userId, data) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) return { success: false, error: 'Недостаточно прав.' };
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
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid) || !isValidFirestoreDocumentId(restaurantId)) return { success: false, error: 'Недостаточно прав или неверный идентификатор.' };
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
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid) || !isValidFirestoreDocumentId(restaurantId)) return { success: false, error: 'Недостаточно прав или неверный идентификатор.' };
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
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid) || !isValidFirestoreDocumentId(restaurantId)) return null;
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
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) return;
        try {
            const restaurants = await this.getRestaurants(userId, {}, { throwOnError: true });
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