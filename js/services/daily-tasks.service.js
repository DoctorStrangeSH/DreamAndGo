import { auth, functions } from '../config/firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

export class DailyTasksService {
    async getTodayTasks(userId) {
        const uid = auth?.currentUser?.uid;
        if (!uid || uid !== userId || !functions) return null;
        try {
            const callable = httpsCallable(functions, 'getDailyTasksV2');
            const response = await callable({});
            if (auth?.currentUser?.uid !== uid) return null;
            return response.data || null;
        } catch (error) {
            console.error('Не удалось загрузить ежедневные задания:', error);
            return null;
        }
    }

    // Progress is updated only by trusted Firestore event triggers.
    async updateTaskProgress() {
        return null;
    }

    async claimTaskReward(userId, taskId) {
        const uid = auth?.currentUser?.uid;
        if (!uid || uid !== userId || !functions) return null;
        try {
            const callable = httpsCallable(functions, 'claimDailyTaskRewardV2');
            const response = await callable({ taskId });
            return auth?.currentUser?.uid === uid ? response.data : null;
        } catch (error) {
            console.error('Не удалось получить награду задания:', error);
            throw error;
        }
    }

    async claimBonusReward(userId) {
        const uid = auth?.currentUser?.uid;
        if (!uid || uid !== userId || !functions) return null;
        try {
            const callable = httpsCallable(functions, 'claimDailyTaskBonusV2');
            const response = await callable({});
            return auth?.currentUser?.uid === uid ? response.data : null;
        } catch (error) {
            console.error('Не удалось получить бонус ежедневных заданий:', error);
            throw error;
        }
    }

    getTimeUntilReset() {
        const now = new Date();
        const nextUtcMidnight = Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
        );
        const diff = Math.max(0, nextUtcMidnight - now.getTime());
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        return `${hours}ч ${minutes}м`;
    }
}
