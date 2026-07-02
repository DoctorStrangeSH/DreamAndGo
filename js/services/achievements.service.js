import { db } from '../config/firebase.js';
import {
    doc, updateDoc, getDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Все достижения в одном месте — легко добавлять новые
export const ACHIEVEMENTS = {
    // Путешествия
    first_travel: {
        id: 'first_travel',
        icon: 'bi-airplane',
        emoji: '✈️',
        title: 'Первое путешествие',
        description: 'Добавить первое путешествие',
        category: 'travels',
        condition: (stats) => stats.travels >= 1,
        levels: [
            { level: 1, title: 'Первопроходец', description: 'Добавлено 1 путешествие', condition: (s) => s.travels >= 1 },
            { level: 2, title: 'Путешественник', description: 'Добавлено 5 путешествий', condition: (s) => s.travels >= 5 },
            { level: 3, title: 'Глобтроттер', description: 'Добавлено 15 путешествий', condition: (s) => s.travels >= 15 },
            { level: 4, title: 'Вокруг света', description: 'Добавлено 30 путешествий', condition: (s) => s.travels >= 30 }
        ]
    },

    // Кино
    first_movie: {
        id: 'first_movie',
        icon: 'bi-film',
        emoji: '🎬',
        title: 'Киноман',
        description: 'Добавить первый фильм',
        category: 'movies',
        condition: (stats) => stats.movies >= 1,
        levels: [
            { level: 1, title: 'Зритель', description: 'Добавлен 1 фильм', condition: (s) => s.movies >= 1 },
            { level: 2, title: 'Киноман', description: 'Добавлено 10 фильмов', condition: (s) => s.movies >= 10 },
            { level: 3, title: 'Кинокритик', description: 'Добавлено 50 фильмов', condition: (s) => s.movies >= 50 },
            { level: 4, title: 'Спилберг', description: 'Добавлено 100 фильмов', condition: (s) => s.movies >= 100 }
        ]
    },

    // Рестораны
    first_restaurant: {
        id: 'first_restaurant',
        icon: 'bi-shop',
        emoji: '🍽️',
        title: 'Гурман',
        description: 'Добавить первый ресторан',
        category: 'restaurants',
        condition: (stats) => stats.restaurants >= 1,
        levels: [
            { level: 1, title: 'Дегустатор', description: 'Добавлен 1 ресторан', condition: (s) => s.restaurants >= 1 },
            { level: 2, title: 'Гурман', description: 'Добавлено 10 ресторанов', condition: (s) => s.restaurants >= 10 },
            { level: 3, title: 'Ресторанный критик', description: 'Добавлено 25 ресторанов', condition: (s) => s.restaurants >= 25 }
        ]
    },

    // Книги
    first_book: {
        id: 'first_book',
        icon: 'bi-book',
        emoji: '📚',
        title: 'Читатель',
        description: 'Добавить первую книгу',
        category: 'books',
        condition: (stats) => stats.books >= 1,
        levels: [
            { level: 1, title: 'Читатель', description: 'Добавлена 1 книга', condition: (s) => s.books >= 1 },
            { level: 2, title: 'Книжный червь', description: 'Добавлено 10 книг', condition: (s) => s.books >= 10 },
            { level: 3, title: 'Библиотекарь', description: 'Добавлено 25 книг', condition: (s) => s.books >= 25 },
            { level: 4, title: 'Писатель', description: 'Добавлено 50 книг', condition: (s) => s.books >= 50 }
        ]
    },

    // Мечты
    first_dream: {
        id: 'first_dream',
        icon: 'bi-star',
        emoji: '⭐',
        title: 'Мечтатель',
        description: 'Добавить первую мечту',
        category: 'dreams',
        condition: (stats) => stats.dreams >= 1,
        levels: [
            { level: 1, title: 'Мечтатель', description: 'Добавлена 1 мечта', condition: (s) => s.dreams >= 1 },
            { level: 2, title: 'Визионер', description: 'Добавлено 5 мечт', condition: (s) => s.dreams >= 5 },
            { level: 3, title: 'Творец', description: 'Сбылось 3 мечты', condition: (s) => s.dreamsCompleted >= 3 }
        ]
    },

    // Друзья
    first_friend: {
        id: 'first_friend',
        icon: 'bi-people',
        emoji: '👥',
        title: 'Душа компании',
        description: 'Добавить первого друга',
        category: 'friends',
        condition: (stats) => stats.friends >= 1,
        levels: [
            { level: 1, title: 'Друг', description: 'Добавлен 1 друг', condition: (s) => s.friends >= 1 },
            { level: 2, title: 'Душа компании', description: 'Добавлено 5 друзей', condition: (s) => s.friends >= 5 },
            { level: 3, title: 'Социальный магнат', description: 'Добавлено 15 друзей', condition: (s) => s.friends >= 15 }
        ]
    },

    // Особые достижения
    collector: {
        id: 'collector',
        icon: 'bi-collection',
        emoji: '🏆',
        title: 'Коллекционер',
        description: 'Заполнить все категории (хотя бы по одному элементу)',
        category: 'special',
        condition: (stats) => stats.travels >= 1 && stats.restaurants >= 1 && stats.movies >= 1 && stats.books >= 1 && stats.dreams >= 1,
        levels: [{ level: 1, title: 'Коллекционер', description: 'Во всех категориях есть хотя бы 1 элемент' }]
    },

    perfect_week: {
        id: 'perfect_week',
        icon: 'bi-calendar-check',
        emoji: '📅',
        title: 'Идеальная неделя',
        description: 'Добавить 7 любых элементов за неделю',
        category: 'special',
        condition: (stats) => (stats.travels + stats.restaurants + stats.movies + stats.books + stats.dreams) >= 7,
        levels: [{ level: 1, title: 'Продуктивный', description: 'Всего добавлено 7+ элементов' }]
    }
};

export class AchievementsService {
    constructor() {
        this.db = db;
    }

    // Получить все достижения пользователя
    async getUserAchievements(userId) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            if (!userDoc.exists()) return [];

            return userDoc.data().achievements || [];
        } catch (error) {
            console.error('Ошибка загрузки достижений:', error);
            return [];
        }
    }

    // Проверить и выдать новые достижения
    async checkAndAwardAchievements(userId) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            if (!userDoc.exists()) return [];

            const userData = userDoc.data();
            const stats = userData.stats || {};
            const currentAchievements = userData.achievements || [];

            const newAchievements = [];

            for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
                const existing = currentAchievements.find(a => a.id === key);
                const currentLevel = existing ? (existing.level || 1) : 0;

                // Если есть основное условие и оно не выполнено — пропускаем
                if (achievement.condition && !achievement.condition(stats)) continue;

                // Если есть уровни — проверяем следующий
                if (achievement.levels && achievement.levels.length > 0) {
                    const nextLevel = achievement.levels.find(l => l.level === currentLevel + 1);

                    if (nextLevel && nextLevel.condition && nextLevel.condition(stats)) {
                        const awarded = {
                            id: key,
                            icon: achievement.icon,
                            emoji: achievement.emoji,
                            title: nextLevel.title,
                            description: nextLevel.description,
                            level: nextLevel.level,
                            category: achievement.category,
                            awardedAt: new Date().toISOString()
                        };

                        newAchievements.push(awarded);

                        const existingIndex = currentAchievements.findIndex(a => a.id === key);
                        if (existingIndex >= 0) {
                            currentAchievements[existingIndex] = awarded;
                        } else {
                            currentAchievements.push(awarded);
                        }
                    }
                } else if (currentLevel === 0) {
                    // Нет уровней — просто выдаём достижение
                    const awarded = {
                        id: key,
                        icon: achievement.icon,
                        emoji: achievement.emoji,
                        title: achievement.title,
                        description: achievement.description,
                        level: 1,
                        category: achievement.category,
                        awardedAt: new Date().toISOString()
                    };

                    newAchievements.push(awarded);
                    currentAchievements.push(awarded);
                }
            }

            if (newAchievements.length > 0) {
                await updateDoc(doc(this.db, 'users', userId), {
                    achievements: currentAchievements
                });
            }

            return newAchievements;
        } catch (error) {
            console.error('Ошибка проверки достижений:', error);
            return [];
        }
    }

    // Получить все возможные достижения (для отображения прогресса)
    getAllAchievements() {
        return Object.values(ACHIEVEMENTS);
    }

    // Получить прогресс по достижению
    getAchievementProgress(achievement, stats) {
        const levels = achievement.levels;
        const currentValue = stats[achievement.category] ||
            (achievement.id === 'collector' ?
                (stats.travels > 0 && stats.restaurants > 0 && stats.movies > 0 && stats.books > 0 && stats.dreams > 0 ? 1 : 0) :
                (stats.travels + stats.restaurants + stats.movies + stats.books + stats.dreams));

        const maxValue = levels[levels.length - 1]?.condition.toString().match(/\d+/)?.[0] || 1;

        return {
            current: Math.min(currentValue, parseInt(maxValue)),
            max: parseInt(maxValue),
            percentage: Math.min(100, Math.round((currentValue / parseInt(maxValue)) * 100))
        };
    }
}