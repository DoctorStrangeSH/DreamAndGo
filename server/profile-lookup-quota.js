// Firestore-backed per-account quota for public profile lookup callables.
// Atomic transaction prevents concurrent requests from bypassing a local counter.
// Candidate settings: 20 requests per 60 seconds per authenticated UID.
export async function consumeProfileLookupQuota(db, uid, nowMs = Date.now(), max = 20, windowMs = 60000) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/') ||
        !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(max) || max < 1 ||
        !Number.isSafeInteger(windowMs) || windowMs < 1000) {
        throw new TypeError('Некорректная квота поиска');
    }
    const ref = db.collection('profileLookupQuotas').doc(uid);
    return db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        const data = snapshot.exists ? snapshot.data() : null;
        const validWindow = Number.isSafeInteger(data?.windowStartedAtMs) &&
            data.windowStartedAtMs <= nowMs && nowMs - data.windowStartedAtMs < windowMs &&
            Number.isSafeInteger(data.count) && data.count >= 0;
        const count = validWindow ? data.count : 0;
        if (count >= max) return false;
        tx.set(ref, { windowStartedAtMs: validWindow ? data.windowStartedAtMs : nowMs,
            count: count + 1 });
        return true;
    });
}
