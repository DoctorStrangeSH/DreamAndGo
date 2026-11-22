// Browser flags are not an authorization boundary. The server must enforce
// the same migration gate independently on every registration request.
export function canUseSignupV2(rollout) {
    return rollout?.enabled === true &&
        rollout?.backendReady === true &&
        rollout?.legacyMigrationVerified === true;
}

export function signupV2Status(rollout) {
    return canUseSignupV2(rollout)
        ? { available: true, message: '' }
        : {
            available: false,
            message: 'Новая регистрация пока проходит проверку. Попробуйте позже.'
        };
}
