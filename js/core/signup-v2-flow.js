import { isValidUsername } from './username.js';

// Firebase SDK functions are injected so validation, failure handling and
// rollback can be tested without creating real accounts.
export async function completeSignupV2({
    email,
    password,
    username,
    createAuthUser,
    registerProfile,
    deleteAuthUser,
    signOutAuth
}) {
    if (typeof username !== 'string' || username !== username.trim() ||
        !isValidUsername(username)) {
        return {
            success: false,
            error: 'Никнейм: 3–20 латинских букв, цифр или _.'
        };
    }

    if (typeof email !== 'string' || !email.trim() ||
        typeof password !== 'string' || password.length < 6 ||
        typeof createAuthUser !== 'function' ||
        typeof registerProfile !== 'function' ||
        typeof deleteAuthUser !== 'function' ||
        typeof signOutAuth !== 'function') {
        return {
            success: false,
            error: 'Проверь email, пароль и настройки регистрации.'
        };
    }

    let account;
    try {
        account = await createAuthUser(email, password);
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
    } catch (error) {
        // A network timeout may mean Firestore committed the profile even
        // though the callable response was lost. Never delete on uncertainty.
        const code = error?.code || '';
        const definitive = [
            'functions/already-exists',
            'functions/invalid-argument',
            'functions/failed-precondition'
        ].includes(code);

        if (definitive) {
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
                // The Auth account may remain. Do not encourage a duplicate
                // registration; sign out and surface the recovery path below.
            }
        }

        try {
            await signOutAuth();
        } catch {
            // Best-effort only. The user must not be told registration worked.
        }

        return {
            success: false,
            code: code || 'unknown',
            recoveryRequired: true,
            error: 'Создание профиля не подтверждено. Не регистрируйся повторно с этим email; войди в аккаунт или обратись в поддержку.'
        };
    }
}
