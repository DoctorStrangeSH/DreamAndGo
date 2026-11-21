import { auth, db } from '../config/firebase.js';
import { isAuthenticatedOwner, isValidFirestoreDocumentId } from '../core/owner-access-policy.js';
import { refreshUserStats } from './profile-stats.service.js';
import { validateRestaurantInput } from '../core/collection-input-policy.js';
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
        let safeData;
        try { safeData = validateRestaurantInput(data); }
        catch (error) { return { success: false, error: error.message }; }
        try {
            const restaurantsRef = collection(this.db, 'users', userId, 'restaurants');
            const newRestaurant = {
                ...safeData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                notes: '',
            };

            const docRef = await addDoc(restaurantsRef, newRestaurant);

            // Statistics are derived data. A refresh failure must not report
            // an already committed restaurant create as failed.
            try {
                await this.updateUserStatsBestEffort(userId);
            } catch (statsError) {
                console.warn('Ресторан сохранён, но статистика не обновилась:', statsError);
            }

            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Ошибка добавления ресторана:', error);
            return { success: false, error: error.message };
        }
    }

    async updateRestaurant(userId, restaurantId, updates) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid) || !isValidFirestoreDocumentId(restaurantId)) return { success: false, error: 'Недостаточно прав или неверный идентификатор.' };
        let safeUpdates;
        try { safeUpdates = validateRestaurantInput(updates, { partial: true }); }
        catch (error) { return { success: false, error: error.message }; }
        try {
            const restaurantRef = doc(this.db, 'users', userId, 'restaurants', restaurantId);
            await updateDoc(restaurantRef, {
                ...safeUpdates,
                updatedAt: serverTimestamp()
            });

            // Preserve the committed restaurant update result if the
            // secondary statistics refresh fails.
            try {
                await this.updateUserStatsBestEffort(userId);
            } catch (statsError) {
                console.warn('Ресторан обновлён, но статистика не обновилась:', statsError);
            }

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
            await this.updateUserStatsBestEffort(userId);
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

    async updateUserStatsBestEffort(userId) {
        try {
            await this.updateUserStats(userId);
        } catch (statsError) {
            console.warn('Основная операция сохранена, но статистика не обновилась:', statsError);
        }
    }

    async updateUserStats(userId) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) return;
        await refreshUserStats(userId);
    }
}