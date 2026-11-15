import { ChatV2Session } from './chat-v2-session.js';

// A deployment-controlled, deny-by-default rollout gate for the candidate chat.
// It is NOT an authorization boundary: callable Functions still enforce auth,
// membership and policy server-side.
export function canStartChatV2(rollout, userId) {
    return rollout?.enabled === true &&
        rollout?.backendReady === true &&
        typeof userId === 'string' && userId.length > 0 &&
        Array.isArray(rollout.allowedUserIds) &&
        rollout.allowedUserIds.includes(userId);
}

export function createGatedChatV2Session({
    rollout, getUserId, invoke, createId, onDeliveryChange, onUnreadChange
}) {
    if (typeof getUserId !== 'function') {
        throw new TypeError('Требуется проверка авторизации');
    }
    // No callable invocation, listener or session is constructed if disabled.
    if (!canStartChatV2(rollout, getUserId())) return null;
    return new ChatV2Session({
        getUserId, invoke, createId, onDeliveryChange, onUnreadChange
    });
}
