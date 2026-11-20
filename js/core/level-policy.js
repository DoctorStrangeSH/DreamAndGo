/**
 * Bounded, deterministic XP-to-level calculation.
 * Profile data is untrusted and must never control an unbounded loop.
 */
export function normalizeXP(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(parsed)));
}

export function getLevelFromXP(value) {
    const xp = normalizeXP(value);
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 50 + 1)));
    const totalXP = 50 * (level * level - 1);
    const currentLevelXP = level * 100 + 50;
    const progressXP = Math.max(0, xp - totalXP);

    return {
        level,
        currentLevelXP,
        totalXPForLevel: progressXP,
        progress: Math.min(100, Math.max(0, Math.round(progressXP / currentLevelXP * 100)))
    };
}
