import { isValidUsername } from './username.js';

// Firebase SDK functions are injected so the flow can be tested without
// creating real accounts. A failed callable is reconciled with server state
// before any destructive Auth action is considered.
export async function completeSignupV2({
    email,
    password,
    username,
    createAuthUser,
    registerProfile,
    getRegistrationState,
    deleteAuthUser,
    signOutAuth
}) {
    if (typeof username !== 'string' || username !== username.trim() ||
        !isValidUsername(username)) {
        return { success: false, error: 'Никнейм: 3–20 латинских букв, цифр или _.' };
    }

    if (typeof email !== 'string' || !email.trim() ||
        typeof password !== 'string' || password.length < 6 ||
        typeof createAuthUser !== 'function' ||
        typeof registerProfile !== 'function' ||
        typeof getRegistrationState !== 'function' ||
        typeof deleteAuthUser !== 'function' ||
        typeof signOutAuth !== 'function') {
        return { success: false, error: 'Проверь email, пароль и настройки регистрации.' };
    }

    let account;
    try {
        account = await createAuthUser(email.trim(), password);
        if (!account || typeof account !== 'object') {
            throw new TypeError('Auth provider returned no account');
        }
    } catch (error) {
        return {
            success: false,
            code: error?.code || 'auth/error',
            error: 'Не удалось создать аккаунт. Проверь email и пароль.'
        };
    }

    try {
        await registerProfile(username);
        return { success: true, user: account };
    } catch (registrationError) {
        let state = null;
        try {
            state = await getRegistrationState();
        } catch {
            // The outcome is still uncertain. Never delete an account merely
            // because both the registration response and reconciliation failed.
        }

        if (state?.status === 'complete') {
            return { success: true, user: account, recovered: true };
        }

        const code = registrationError?.code || 'unknown';
        const definitive = [
            'functions/already-exists',
            'functions/invalid-argument',
            'functions/failed-precondition'
        ].includes(code);

        // Only a definitive rejection plus a successful state read that proves
        // no profile exists permits cleanup of this newly-created Auth account.
        if (definitive && state?.status === 'needs-profile') {
            try {
                await deleteAuthUser(account);
                return {
                    success: false,
                    code,
                    error: code === 'functions/already-exists'
                        ? 'Никнейм уже занят. Выбери другой.'
                        : 'Регистрация пока недоступна. Попробуй позже.'
                };
            } catch {
                // The Auth account may remain. Keep it recoverable; do not ask
                // the user to register with the same email again.
            }
        }

        try {
            await signOutAuth();
        } catch {
            // Best effort. The recovery instructions remain explicit.
        }

        return {
            success: false,
            code,
            recoveryRequired: true,
            error: 'Не удалось подтвердить создание профиля. Аккаунт сохранён. Не регистрируйся повторно с этим email — войди с ним для восстановления.'
        };
    }
}
