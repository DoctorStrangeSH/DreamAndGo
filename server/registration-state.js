// Read-only state inspection for the authenticated user's own signup.
// Do not expose email, profile contents, usernames or other users' existence.
export async function getRegistrationState(db, uid) {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
        return { ok: false, code: 'unauthenticated' };
    }
    const [profile, registry] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('system').doc('usernameRegistry').get()
    ]);
    if (profile.exists) {
        // An existing account is never presented as a new registration.
        return { ok: true, status: 'complete' };
    }
    const ready = registry.exists && registry.get('ready') === true &&
        registry.get('schemaVersion') === 1 &&
        registry.get('legacyBackfillComplete') === true;
    return { ok: true, status: ready ? 'needs-profile' : 'temporarily-unavailable' };
}
