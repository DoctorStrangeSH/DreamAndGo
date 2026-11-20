import { db } from '../config/firebase.js';
import { getLevelFromXP, normalizeXP } from '../core/level-policy.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Конфигурация уровней
export const LEVEL_CONFIG = {
    XP_PER_ACTION: {
        add_travel: 50,
        add_restaurant: 30,
        add_movie: 20,
        add_book: 25,
        add_dream: 15,
        complete_dream: 100,
        add_review: 10,
        add_friend: 40,
        send_message: 1,
        daily_login: 5
    },
    
    // Pure, bounded policy lives in core/level-policy.js.
};

export class LevelService {
    constructor() {
        this.db = db;
    }

    // Client-side XP mutation is intentionally disabled. Rewards are granted
    // only by server triggers after verified Firestore events.
    async addXP() {
        return null;
    }

    async getUserLevel(userId) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            if (!userDoc.exists()) return { level: 1, xp: 0, progress: 0 };
            
            const xp = normalizeXP(userDoc.data().stats?.xp ?? 0);
            return {
                xp: xp,
                ...getLevelFromXP(xp)
            };
        } catch (error) {
            return { level: 1, xp: 0, progress: 0 };
        }
    }

    getLevelInfo(level) {
        return {
            level: level,
            xpNeeded: LEVEL_CONFIG.getXPForLevel(level),
            title: this.getLevelTitle(level),
            color: this.getLevelColor(level),
            icon: this.getLevelIcon(level)
        };
    }

    getLevelTitle(level) {
        const titles = {
            1: 'Новичок', 5: 'Путник', 10: 'Исследователь',
            15: 'Авантюрист', 20: 'Мечтатель', 25: 'Творец',
            30: 'Мастер', 40: 'Легенда', 50: 'Бог'
        };
        
        let title = 'Новичок';
        for (const [lvl, t] of Object.entries(titles)) {
            if (level >= parseInt(lvl)) title = t;
        }
        return title;
    }

    getLevelColor(level) {
        if (level < 5) return '#6C5CE7';
        if (level < 10) return '#00B894';
        if (level < 20) return '#FDCB6E';
        if (level < 30) return '#E17055';
        if (level < 40) return '#FF6B6B';
        return '#FFD93D';
    }

    getLevelIcon(level) {
        if (level < 5) return 'bi-star';
        if (level < 10) return 'bi-star-half';
        if (level < 20) return 'bi-star-fill';
        if (level < 30) return 'bi-gem';
        if (level < 40) return 'bi-diamond';
        return 'bi-diamond-fill';
    }
}