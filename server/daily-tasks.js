import { FieldValue } from 'firebase-admin/firestore';
import {
    createDailyTaskSet, DAILY_TASK_BONUS_XP, isValidDailyTaskId
} from '../js/core/daily-task-policy.js';

const validSegment = value => typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);

const utcDateKey = value => {
    const date = new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid daily task timestamp');
    return date.toISOString().slice(0, 10);
};

export async function ensureDailyTasks(db, uid, now = new Date()) {
    if (!validSegment(uid)) throw new TypeError('Invalid user ID');
    const dateKey = utcDateKey(now);
    const taskRef = db.collection('users').doc(uid).collection('dailyTasks').doc('current');
    return db.runTransaction(async tx => {
        const snapshot = await tx.get(taskRef);
        if (snapshot.exists && snapshot.get('dateKey') === dateKey) {
            return snapshot.data();
        }
        const tasks = createDailyTaskSet(uid, dateKey);
        const assignment = {
            dateKey,
            tasks,
            allCompleted: false,
            bonusClaimed: false,
            bonusClaimedXp: 0,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };
        tx.set(taskRef, assignment);
        return assignment;
    });
}

export async function recordDailyTaskProgress(db, {
    uid, action, sourceId, occurredAt
}) {
    if (!validSegment(uid) || !validSegment(sourceId) ||
        !['travels', 'restaurants', 'movies', 'books', 'dreams', 'friends'].includes(action)) {
        throw new TypeError('Invalid daily task event');
    }
    const dateKey = utcDateKey(occurredAt);
    const userRef = db.collection('users').doc(uid);
    const taskRef = userRef.collection('dailyTasks').doc('current');
    const eventRef = userRef.collection('dailyTaskEvents').doc('created_' + action + '_' + sourceId);

    return db.runTransaction(async tx => {
        const [taskSnapshot, eventSnapshot] = await Promise.all([
            tx.get(taskRef), tx.get(eventRef)
        ]);
        if (!taskSnapshot.exists || taskSnapshot.get('dateKey') !== dateKey) {
            return { updated: false, reason: 'no-current-assignment' };
        }
        if (eventSnapshot.exists) return { updated: false, reason: 'duplicate' };

        const data = taskSnapshot.data();
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        const matching = tasks.some(task => task.action === action && !task.completed);
        if (!matching) return { updated: false, reason: 'no-matching-task' };

        const updatedTasks = tasks.map(task => {
            if (task.action !== action || task.completed) return task;
            const progress = Math.min(task.target, task.progress + 1);
            return { ...task, progress, completed: progress >= task.target };
        });
        const allCompleted = updatedTasks.every(task => task.completed);

        tx.create(eventRef, {
            action, sourceId, dateKey, occurredAt: new Date(occurredAt || Date.now()),
            createdAt: FieldValue.serverTimestamp()
        });
        tx.update(taskRef, {
            tasks: updatedTasks,
            allCompleted,
            updatedAt: FieldValue.serverTimestamp()
        });
        return { updated: true, tasks: updatedTasks, allCompleted };
    });
}

async function claimReward(db, uid, claimId, rewardXp, now, mutateTask) {
    if (!validSegment(uid) || !validSegment(claimId)) throw new TypeError('Invalid daily task claim');
    const date = new Date(now || Date.now());
    if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid claim timestamp');
    const utcDay = date.toISOString().slice(0, 10);
    const userRef = db.collection('users').doc(uid);
    const taskRef = userRef.collection('dailyTasks').doc('current');
    const claimRef = userRef.collection('dailyTaskClaims').doc(claimId);
    const dailyRef = userRef.collection('xpDaily').doc(utcDay);

    return db.runTransaction(async tx => {
        const [userSnapshot, taskSnapshot, claimSnapshot, dailySnapshot] = await Promise.all([
            tx.get(userRef), tx.get(taskRef), tx.get(claimRef), tx.get(dailyRef)
        ]);
        if (!userSnapshot.exists) return { claimed: false, reason: 'profile-missing', xpGained: 0 };
        if (!taskSnapshot.exists) return { claimed: false, reason: 'tasks-missing', xpGained: 0 };
        if (claimSnapshot.exists) return { claimed: false, reason: 'duplicate', xpGained: 0 };

        const taskData = taskSnapshot.data();
        if (taskData.dateKey !== utcDay) {
            // The local task day may differ from UTC. The claim ID embeds the
            // task date, while the reward ceiling is always calculated by UTC day.
        }
        const validation = mutateTask(taskData);
        if (!validation.ok) return { claimed: false, reason: validation.reason, xpGained: 0 };

        const daily = dailySnapshot.exists ? dailySnapshot.data() : {};
        const earned = Number.isSafeInteger(daily.xpEarned) && daily.xpEarned >= 0 ? daily.xpEarned : 0;
        const counts = daily.actionCounts && typeof daily.actionCounts === 'object' ? daily.actionCounts : {};
        const actionCount = Number.isSafeInteger(counts.daily_task) && counts.daily_task >= 0
            ? counts.daily_task : 0;
        if (actionCount >= 5) return { claimed: false, reason: 'daily-claim-limit', xpGained: 0 };
        const xpGained = Math.min(rewardXp, Math.max(0, 300 - earned));
        if (xpGained <= 0) return { claimed: false, reason: 'daily-xp-limit', xpGained: 0 };

        const profile = userSnapshot.data();
        const stats = profile.stats && typeof profile.stats === 'object' && !Array.isArray(profile.stats)
            ? profile.stats : {};
        const currentXp = Number.isSafeInteger(stats.xp) && stats.xp >= 0 ? stats.xp : 0;

        tx.update(userRef, { stats: { ...stats, xp: currentXp + xpGained } });
        tx.set(dailyRef, {
            xpEarned: earned + xpGained,
            actionCounts: { ...counts, daily_task: actionCount + 1 },
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        tx.update(taskRef, {
            ...validation.patch,
            updatedAt: FieldValue.serverTimestamp()
        });
        tx.create(claimRef, {
            rewardXp, xpGained, utcDay,
            createdAt: FieldValue.serverTimestamp()
        });
        return { claimed: true, xpGained, totalXp: currentXp + xpGained };
    });
}

export async function claimDailyTaskReward(db, uid, taskId, now = new Date()) {
    if (!isValidDailyTaskId(taskId)) return { claimed: false, reason: 'invalid-task', xpGained: 0 };
    const dateKey = utcDateKey(now);
    const definition = createDailyTaskSet(uid, dateKey).find(task => task.id === taskId);
    const catalogXp = definition?.xp;
    // Use the immutable catalog reward even when today's selected set differs.
    const reward = catalogXp ?? 0;
    return claimReward(db, uid, dateKey + '_' + taskId, reward, now, data => {
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        const task = tasks.find(item => item.id === taskId);
        if (!task || !task.completed || task.claimed) {
            return { ok: false, reason: 'not-claimable' };
        }
        return {
            ok: true,
            patch: {
                tasks: tasks.map(item => item.id === taskId
                    ? { ...item, claimed: true, claimedXp: Math.min(reward, 300) }
                    : item)
            }
        };
    });
}

export async function claimDailyTaskBonus(db, uid, now = new Date()) {
    const dateKey = utcDateKey(now);
    return claimReward(db, uid, dateKey + '_bonus', DAILY_TASK_BONUS_XP, now, data => {
        if (!data.allCompleted || data.bonusClaimed) return { ok: false, reason: 'not-claimable' };
        return {
            ok: true,
            patch: { bonusClaimed: true, bonusClaimedXp: DAILY_TASK_BONUS_XP }
        };
    });
}
