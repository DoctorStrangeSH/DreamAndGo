import { auth, functions } from '../config/firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

// The server derives the UID from Firebase Auth and recomputes every counter.
// No client-supplied UID or counter value is sent to the callable.
export async function refreshUserStats(requestedUid) {
    const uid = auth?.currentUser?.uid;
    if (!uid || uid !== requestedUid || !functions) return null;
    try {
        const callable = httpsCallable(functions, 'refreshUserStatsV2');
        const response = await callable({});
        if (auth?.currentUser?.uid !== uid) return null;
        return Array.isArray(response.data?.newAchievements) ? response.data.newAchievements : [];
    } catch (error) {
        console.error('Не удалось обновить статистику профиля:', error);
        return null;
    }
}
