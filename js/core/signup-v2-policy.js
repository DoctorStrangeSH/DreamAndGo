// Explicit opt-in for the future signup v2 pilot. Never treat a browser flag as
// an authorization boundary; the server still checks the migration control doc.
export function canUseSignupV2(rollout) {
    return rollout?.enabled === true &&
        rollout?.backendReady === true &&
        rollout?.legacyMigrationVerified === true;
}

export function signupV2Status(rollout) {
    return canUseSignupV2(rollout)
        ? { available: true, message: '' }
        : { available: false, message: 'Новая регистрация пока проходит проверку. Попробуйте позже.' };
}
