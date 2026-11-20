import { ACHIEVEMENTS } from '../core/achievement-catalog.js';
import { auth, db } from '../config/firebase.js';
import { isAuthenticatedOwner } from '../core/owner-access-policy.js';
import {
    doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Все достижения в одном месте — легко добавлять новые
export class AchievementsService {
    constructor() {
        this.db = db;
    }

    // Получить все достижения пользователя
    async getUserAchievements(userId, { throwOnError = false } = {}) {
        if (!isAuthenticatedOwner(userId, auth?.currentUser?.uid)) {
            if (throwOnError) throw new Error('Недостаточно прав для доступа к достижениям.');
            return [];
        }
        try {
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            if (!userDoc.exists()) return [];
            const achievements = userDoc.data().achievements;
            return Array.isArray(achievements) ? achievements : [];
        } catch (error) {
            console.error('Ошибка загрузки достижений:', error);
            if (throwOnError) throw error;
            return [];
        }
    }

    // Awards are now calculated and persisted by trusted server transactions.
    // Kept as a compatibility shim; browser code cannot write achievements.
    async checkAndAwardAchievements() {
        return [];
    }

    // Получить все возможные достижения (для отображения прогресса)
    getAllAchievements() {
        return Object.values(ACHIEVEMENTS);
    }

    // Получить прогресс по достижению
    getAchievementProgress(achievement, stats = {}) {
        const safeCount = key => {
            const value = Number(stats?.[key] ?? 0);
            return Number.isFinite(value) && value > 0 ? value : 0;
        };
        const levels = Array.isArray(achievement?.levels) ? achievement.levels : [];
        const lastDescription = String(levels[levels.length - 1]?.description || achievement?.description || '');
        const maxValue = achievement?.id === 'collector' ? 5 :
            Math.max(1, Number(lastDescription.match(/\d+/)?.[0]) || 1);

        let currentValue;
        if (achievement?.id === 'collector') {
            currentValue = ['travels', 'restaurants', 'movies', 'books', 'dreams']
                .filter(key => safeCount(key) > 0).length;
        } else if (achievement?.id === 'perfect_week') {
            currentValue = ['travels', 'restaurants', 'movies', 'books', 'dreams']
                .reduce((total, key) => total + safeCount(key), 0);
        } else if (achievement?.id === 'first_dream') {
            currentValue = safeCount('dreamsCompleted');
        } else {
            currentValue = safeCount(achievement?.category);
        }

        const current = Math.min(currentValue, maxValue);
        return {
            current,
            max: maxValue,
            percentage: Math.min(100, Math.round((current / maxValue) * 100))
        };
    }
}
