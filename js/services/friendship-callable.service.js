import { app } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

let callableMutation;

function getMutationCallable() {
    if (!app) throw new Error('Firebase не инициализирован');
    if (!callableMutation) {
        callableMutation = httpsCallable(getFunctions(app, 'europe-west3'), 'mutateFriendshipV2');
    }
    return callableMutation;
}

export async function mutateFriendship(action, targetUid) {
    if (!['send', 'accept', 'reject', 'cancel', 'remove'].includes(action) ||
        typeof targetUid !== 'string' || !targetUid || targetUid.length > 128 || targetUid.includes('/')) {
        throw new TypeError('Некорректная операция с друзьями');
    }
    const response = await getMutationCallable()({ action, targetUid });
    if (response?.data?.success !== true) throw new Error('Операция с друзьями не подтверждена сервером');
    return response.data;
}
