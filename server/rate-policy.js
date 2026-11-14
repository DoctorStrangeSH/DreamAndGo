// Per-sender cooldown in the candidate v2 chat sender.
// Use an authenticated, server-owned Firestore document and read/write it
// in the same transaction as each newly-created message.
export const CHAT_SEND_COOLDOWN_MS = 1500;

export function canSendChatMessage(lastSentAt, nowMillis, cooldownMs = CHAT_SEND_COOLDOWN_MS) {
    if (!Number.isSafeInteger(nowMillis) || nowMillis < 0 ||
        !Number.isSafeInteger(cooldownMs) || cooldownMs <= 0) return false;

    // Missing document = no previous send; an existing malformed document fails closed.
    if (lastSentAt === null) return true;
    if (typeof lastSentAt?.toMillis !== 'function') return false;
    let previousMillis;
    try {
        previousMillis = lastSentAt.toMillis();
    } catch {
        return false;
    }
    if (!Number.isFinite(previousMillis) || previousMillis < 0) return false;
    const elapsed = nowMillis - previousMillis;
    return elapsed >= cooldownMs;
}
