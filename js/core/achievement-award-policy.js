export function calculateAchievementAwards(stats = {}, storedAchievements = [], catalog = {}, awardedAt = new Date().toISOString()) {
    const safeStats = Object.fromEntries(
        Object.entries(stats || {}).map(([key, value]) => [
            key,
            Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0
        ])
    );
    const byId = new Map();
    if (Array.isArray(storedAchievements)) {
        for (const item of storedAchievements) {
            if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string') continue;
            const level = Number.isInteger(item.level) && item.level > 0 ? item.level : 1;
            const normalized = { ...item, level };
            const previous = byId.get(item.id);
            if (!previous || normalized.level > previous.level) byId.set(item.id, normalized);
        }
    }
    const next = [...byId.values()].map(item => ({ ...item }));
    const awarded = [];

    for (const [key, achievement] of Object.entries(catalog)) {
        if (!achievement || typeof achievement !== 'object') continue;
        const existingIndex = next.findIndex(item => item.id === key);
        const currentLevel = existingIndex >= 0 ? next[existingIndex].level : 0;

        if (typeof achievement.condition === 'function' && !achievement.condition(safeStats)) continue;

        let levelData = null;
        let awardedLevel = currentLevel + 1;
        if (Array.isArray(achievement.levels) && achievement.levels.length > 0) {
            levelData = achievement.levels.find(level => level.level === awardedLevel);
            if (!levelData || (typeof levelData.condition === 'function' && !levelData.condition(safeStats))) continue;
        } else {
            if (currentLevel > 0) continue;
            levelData = achievement;
            awardedLevel = 1;
        }

        const result = {
            id: key,
            icon: achievement.icon || '',
            emoji: achievement.emoji || '',
            title: levelData.title || achievement.title || key,
            description: levelData.description || achievement.description || '',
            level: awardedLevel,
            category: achievement.category || 'special',
            awardedAt
        };
        awarded.push(result);
        if (existingIndex >= 0) next[existingIndex] = result;
        else next.push(result);
    }

    return { newAchievements: awarded, updatedAchievements: next };
}
