import { FieldValue } from 'firebase-admin/firestore';
import { XP_REWARDS, XP_DAILY_LIMIT, XP_DAILY_ACTION_LIMIT } from '../js/core/xp-reward-policy.js';

export { XP_REWARDS, XP_DAILY_LIMIT, XP_DAILY_ACTION_LIMIT } from '../js/core/xp-reward-policy.js';

const validSegment = value => typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);

export async function awardXpForVerifiedEvent(db, {
    uid, action, sourceId, eventKey, occurredAt
}) {
    if (!validSegment(uid) || !validSegment(sourceId) ||
        !validSegment(eventKey) || !Object.hasOwn(XP_REWARDS, action)) {
        const error = new TypeError('Invalid XP reward event');
        error.code = 'invalid-argument';
        throw error;
    }

    const date = new Date(occurredAt || Date.now());
    if (!Number.isFinite(date.getTime())) {
        const error = new TypeError('Invalid XP event timestamp');
        error.code = 'invalid-argument';
        throw error;
    }
    const dayKey = date.toISOString().slice(0, 10);
    const userRef = db.collection('users').doc(uid);
    const eventRef = userRef.collection('xpEvents').doc(eventKey);
    const dailyRef = userRef.collection('xpDaily').doc(dayKey);
    const requestedXp = XP_REWARDS[action];

    return db.runTransaction(async tx => {
        const [userSnap, eventSnap, dailySnap] = await Promise.all([
            tx.get(userRef), tx.get(eventRef), tx.get(dailyRef)
        ]);
        if (!userSnap.exists) return { awarded: false, reason: 'profile-missing', xpGained: 0 };
        if (eventSnap.exists) return { awarded: false, reason: 'duplicate', xpGained: 0 };

        const daily = dailySnap.exists ? dailySnap.data() : {};
        const counts = daily.actionCounts && typeof daily.actionCounts === 'object'
            ? daily.actionCounts : {};
        const earned = Number.isSafeInteger(daily.xpEarned) && daily.xpEarned > 0
            ? daily.xpEarned : 0;
        const actionCount = Number.isSafeInteger(counts[action]) && counts[action] > 0
            ? counts[action] : 0;
        const allowed = earned + requestedXp <= XP_DAILY_LIMIT &&
            actionCount < XP_DAILY_ACTION_LIMIT;
        const xpGained = allowed ? requestedXp : 0;

        tx.create(eventRef, {
            action, sourceId, requestedXp, xpGained,
            reason: allowed ? 'awarded' : 'daily-limit',
            occurredAt: date,
            createdAt: FieldValue.serverTimestamp()
        });

        if (allowed) {
            const profile = userSnap.data();
            const stats = profile.stats && typeof profile.stats === 'object' &&
                !Array.isArray(profile.stats) ? profile.stats : {};
            const currentXp = Number.isSafeInteger(stats.xp) && stats.xp >= 0 ? stats.xp : 0;
            tx.update(userRef, { stats: { ...stats, xp: currentXp + xpGained } });
        }

        tx.set(dailyRef, {
            xpEarned: earned + xpGained,
            actionCounts: { ...counts, [action]: actionCount + 1 },
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            awarded: allowed,
            reason: allowed ? 'awarded' : 'daily-limit',
            xpGained,
            totalXp: allowed
                ? (Number.isSafeInteger(userSnap.data().stats?.xp) ? userSnap.data().stats.xp : 0) + xpGained
                : Number.isSafeInteger(userSnap.data().stats?.xp) ? userSnap.data().stats.xp : 0
        };
    });
}

