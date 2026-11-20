import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
    ensureDailyTasks, recordDailyTaskProgress, claimDailyTaskReward, claimDailyTaskBonus
} from './daily-tasks.js';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Must run against Firestore emulator only');
const app = initializeApp({ projectId: 'demo-dreamandgo-chat-rules' }, 'daily-task-tests');
const db = getFirestore(app);

test('assignment is server-created, stable for the day and requires an existing profile', async () => {
    const uid = 'daily-assignment-owner';
    assert.equal(await ensureDailyTasks(db, 'daily-no-profile', new Date('2026-11-20T09:00:00Z')), null);
    await db.doc('users/' + uid).set({ stats: { xp: 12 } });
    const first = await ensureDailyTasks(db, uid, new Date('2026-11-20T09:00:00Z'));
    const repeated = await ensureDailyTasks(db, uid, new Date('2026-11-20T18:00:00Z'));
    assert.equal(first.dateKey, '2026-11-20');
    assert.deepEqual(first.tasks, repeated.tasks);
    assert.equal(first.tasks.length, 3);
    assert.equal(first.tasks.every(task => task.progress === 0 && !task.completed && !task.claimed), true);
});

test('only a persisted matching collection event advances progress and duplicate delivery is ignored', async () => {
    const uid = 'daily-progress-owner';
    await db.doc('users/' + uid).set({ stats: { xp: 0 } });
    const now = new Date('2026-11-20T10:00:00Z');
    const assignment = await ensureDailyTasks(db, uid, now);
    const selected = assignment.tasks[0];

    const first = await recordDailyTaskProgress(db, {
        uid, action: selected.action, sourceId: 'record-1', occurredAt: now
    });
    const duplicate = await recordDailyTaskProgress(db, {
        uid, action: selected.action, sourceId: 'record-1', occurredAt: now
    });
    const saved = await db.doc('users/' + uid + '/dailyTasks/current').get();
    const task = saved.get('tasks').find(item => item.id === selected.id);

    assert.equal(first.updated, true);
    assert.equal(duplicate.reason, 'duplicate');
    assert.equal(task.progress, 1);
    assert.equal(task.completed, true);
});

test('completed task reward is atomic, capped and idempotent', async () => {
    const uid = 'daily-claim-owner';
    await db.doc('users/' + uid).set({ stats: { xp: 20, friends: 3 } });
    const now = new Date('2026-11-20T11:00:00Z');
    const assignment = await ensureDailyTasks(db, uid, now);
    const selected = assignment.tasks[0];
    await recordDailyTaskProgress(db, {
        uid, action: selected.action, sourceId: 'claim-record', occurredAt: now
    });

    const first = await claimDailyTaskReward(db, uid, selected.id, now);
    const duplicate = await claimDailyTaskReward(db, uid, selected.id, now);
    const profile = await db.doc('users/' + uid).get();
    const taskDoc = await db.doc('users/' + uid + '/dailyTasks/current').get();
    const savedTask = taskDoc.get('tasks').find(item => item.id === selected.id);

    assert.equal(first.claimed, true);
    assert.equal(first.xpGained, selected.xp);
    assert.equal(duplicate.reason, 'duplicate');
    assert.equal(profile.get('stats.xp'), 20 + selected.xp);
    assert.equal(profile.get('stats.friends'), 3);
    assert.equal(savedTask.claimed, true);
    assert.equal(savedTask.claimedXp, selected.xp);
});

test('reward claim respects the shared 300 XP daily ceiling and stores the actual partial reward', async () => {
    const uid = 'daily-cap-owner';
    await db.doc('users/' + uid).set({ stats: { xp: 290 } });
    const now = new Date('2026-11-20T12:00:00Z');
    const assignment = await ensureDailyTasks(db, uid, now);
    const selected = assignment.tasks[0];
    await recordDailyTaskProgress(db, {
        uid, action: selected.action, sourceId: 'cap-record', occurredAt: now
    });
    await db.doc('users/' + uid + '/xpDaily/2026-11-20').set({ xpEarned: 290, actionCounts: {} });

    const result = await claimDailyTaskReward(db, uid, selected.id, now);
    const profile = await db.doc('users/' + uid).get();
    const taskDoc = await db.doc('users/' + uid + '/dailyTasks/current').get();
    const savedTask = taskDoc.get('tasks').find(item => item.id === selected.id);

    assert.equal(result.claimed, true);
    assert.equal(result.xpGained, 10);
    assert.equal(profile.get('stats.xp'), 300);
    assert.equal(savedTask.claimedXp, 10);
});

test('all three server-verified tasks unlock one atomic bonus claim', async () => {
    const uid = 'daily-bonus-owner';
    await db.doc('users/' + uid).set({ stats: { xp: 0 } });
    const now = new Date('2026-11-20T13:00:00Z');
    const assignment = await ensureDailyTasks(db, uid, now);
    for (let index = 0; index < assignment.tasks.length; index++) {
        const task = assignment.tasks[index];
        await recordDailyTaskProgress(db, {
            uid, action: task.action, sourceId: 'bonus-record-' + index, occurredAt: now
        });
    }

    const first = await claimDailyTaskBonus(db, uid, now);
    const duplicate = await claimDailyTaskBonus(db, uid, now);
    const profile = await db.doc('users/' + uid).get();
    const saved = await db.doc('users/' + uid + '/dailyTasks/current').get();

    assert.equal(saved.get('allCompleted'), true);
    assert.equal(first.claimed, true);
    assert.equal(first.xpGained, 100);
    assert.equal(duplicate.reason, 'duplicate');
    assert.equal(saved.get('bonusClaimed'), true);
    assert.equal(profile.get('stats.xp'), 100);
});

test.after(async () => { await deleteApp(app); });
