import { auth, db } from '../config/firebase.js';
import { normalizeUsername, isValidUsername } from '../core/username.js';
import { findPublicProfileByUsername, getPublicProfilesByIds } from './public-profile-callable.service.js';
import { refreshUserStats } from './profile-stats.service.js';
import { isValidFriendPair, isCurrentFriendActor } from '../core/friend-action-policy.js';
import { mutateFriendship } from './friendship-callable.service.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

function isCurrentUser(userId) {
    return isCurrentFriendActor(userId, auth?.currentUser?.uid);
}

export class FriendsService {
    constructor() {
        this.db = db;
    }

    async getUserByUsername(username) {
        const normalized = normalizeUsername(username);
        if (!isValidUsername(normalized)) return null;

        try {
            return await findPublicProfileByUsername(normalized);
        } catch (error) {
            console.error('Ошибка поиска пользователя:', error);
            throw new Error('Не удалось выполнить поиск. Проверь подключение к интернету и повтори попытку.');
        }
    }

    async runFriendshipMutation(userId, friendId, action, label) {
        if (!isCurrentUser(userId) || !isValidFriendPair(userId, friendId)) {
            return { success: false, error: 'Некорректные данные для операции с друзьями.' };
        }
        try {
            await mutateFriendship(action, friendId);
            return { success: true };
        } catch (error) {
            console.error(`Ошибка операции с друзьями (${action}):`, error);
            return {
                success: false,
                error: error?.message || label || 'Не удалось выполнить операцию. Попробуй ещё раз.'
            };
        }
    }

    async sendFriendRequest(fromUserId, toUserId) {
        return this.runFriendshipMutation(fromUserId, toUserId, 'send', 'Не удалось отправить заявку.');
    }

    async acceptFriendRequest(userId, friendId) {
        const result = await this.runFriendshipMutation(userId, friendId, 'accept', 'Не удалось принять заявку.');
        if (result.success) await this.updateFriendsCount(userId);
        return result;
    }

    async rejectFriendRequest(userId, friendId) {
        return this.runFriendshipMutation(userId, friendId, 'reject', 'Не удалось отклонить заявку.');
    }

    async cancelFriendRequest(userId, friendId) {
        return this.runFriendshipMutation(userId, friendId, 'cancel', 'Не удалось отменить заявку.');
    }

    async removeFriend(userId, friendId) {
        const result = await this.runFriendshipMutation(userId, friendId, 'remove', 'Не удалось удалить друга.');
        if (result.success) await this.updateFriendsCount(userId);
        return result;
    }

    async getFriends(userId) {
        if (!isCurrentUser(userId)) return [];
        try {
            const recordsRef = collection(this.db, 'users', userId, 'friends');
            const snapshot = await getDocs(recordsRef);
            const records = snapshot.docs.filter(item => item.id !== '_init');
            const profiles = await getPublicProfilesByIds(records.map(item => item.id));
            const byId = new Map(profiles.map(profile => [profile.uid, profile]));
            return records.flatMap(item => {
                const profile = byId.get(item.id);
                return profile ? [{
                    uid: item.id,
                    ...profile,
                    addedAt: item.data().addedAt?.toDate?.() || new Date()
                }] : [];
            });
        } catch (error) {
            console.error('Ошибка загрузки друзей:', error);
            return [];
        }
    }

    async getFriendRequests(userId) {
        if (!isCurrentUser(userId)) return [];
        try {
            const recordsRef = collection(this.db, 'users', userId, 'friendRequests');
            const snapshot = await getDocs(recordsRef);
            const records = snapshot.docs.filter(item => item.id !== '_init');
            const profiles = await getPublicProfilesByIds(records.map(item => item.id));
            const byId = new Map(profiles.map(profile => [profile.uid, profile]));
            return records.flatMap(item => {
                const profile = byId.get(item.id);
                return profile ? [{
                    uid: item.id,
                    ...profile,
                    createdAt: item.data().createdAt?.toDate?.() || new Date()
                }] : [];
            });
        } catch (error) {
            console.error('Ошибка загрузки заявок:', error);
            return [];
        }
    }

    async getSentRequests(userId) {
        if (!isCurrentUser(userId)) return [];
        try {
            const recordsRef = collection(this.db, 'users', userId, 'sentRequests');
            const snapshot = await getDocs(recordsRef);
            const records = snapshot.docs.filter(item => item.id !== '_init');
            const profiles = await getPublicProfilesByIds(records.map(item => item.id));
            const byId = new Map(profiles.map(profile => [profile.uid, profile]));
            return records.flatMap(item => {
                const profile = byId.get(item.id);
                return profile ? [{
                    uid: item.id,
                    ...profile,
                    createdAt: item.data().createdAt?.toDate?.() || new Date()
                }] : [];
            });
        } catch (error) {
            console.error('Ошибка загрузки отправленных заявок:', error);
            return [];
        }
    }

    async getUserProfile(uid) {
        try {
            const profiles = await getPublicProfilesByIds([uid]);
            return profiles[0] || null;
        } catch (error) {
            console.error('Не удалось загрузить публичный профиль:', error);
            return null;
        }
    }

    async updateFriendsCount(userId) {
        if (!isCurrentUser(userId)) return;
        await refreshUserStats(userId);
    }
}