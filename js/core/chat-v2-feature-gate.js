import { ChatV2Session } from './chat-v2-session.js';
import { isValidChatUid } from './chat-message-policy.js';

// A deployment-controlled, deny-by-default rollout gate for the candidate chat.
// It is NOT an authorization boundary: callable Functions still enforce auth,
// membership and policy server-side.
export function canStartChatV2(rollout, userId) {
    return rollout?.enabled === true &&
        rollout?.backendReady === true &&
        isValidChatUid(userId) &&
        Array.isArray(rollout.allowedUserIds) &&
        rollout.allowedUserIds.some(allowedId => isValidChatUid(allowedId) && allowedId === userId);
}

export function createGatedChatV2Session({
    rollout, getRollout, getUserId, invoke, createId, onDeliveryChange, onUnreadChange
}) {
    if (typeof getUserId !== 'function') {
        throw new TypeError('Требуется проверка авторизации');
    }
    if (getRollout !== undefined && typeof getRollout !== 'function') {
        throw new TypeError('Требуется проверка доступности пилота');
    }
    // Re-check at every action and after awaited calls. A revoked rollout
    // invalidates this pilot session even if the account has not changed.
    const gatedUserId = () => {
        const userId = getUserId();
        return canStartChatV2(getRollout ? getRollout() : rollout, userId) ? userId : null;
    };
    // No callable invocation, listener or session is constructed if disabled.
    if (gatedUserId() === null) return null;
    return new ChatV2Session({
        getUserId: gatedUserId, invoke, createId, onDeliveryChange, onUnreadChange
    });
}
