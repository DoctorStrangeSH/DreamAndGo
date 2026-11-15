import { isValidUsername } from '../core/username.js';

// Pure orchestration for an opt-in pilot. Firebase SDK functions are injected
// so failures and rollback behavior can be tested without creating accounts.
export async function completeSignupV2({ email, password, username, createAuthUser, registerProfile, deleteAuthUser, signOutAuth }) {
    if (!isValidUsername(username) || typeof username !== 'string' ||
        username !== username.trim()) {
        return { success: false, error: 'Никнейм: 3–20 латинских букв, цифр или _.' };
    }
    let account;
    try {
        account = await createAuthUser(email, password);
    } catch (error) {
        return { success: false, code: error?.code || 'auth/error', error: 'Не удалось создать аккаунт. Проверь email и пароль.' };
    }
    try {
        await registerProfile(username);
        return { success: true, user: account };
    } catch (error) {
        // A network timeout may mean Firestore committed the profile although
        // the HTTP response was lost. Never delete an account on uncertainty.
        const code = error?.code || '';
        const definitive = code === 'functions/already-exists' ||
            code === 'functions/invalid-argument' ||
            code === 'functions/failed-precondition';
        if (definitive) {
            try {
                await deleteAuthUser(account);
                return {
                    success: false, code,
                    error: code === 'functions/already-exists'
                        ? 'Никнейм уже занят. Выбери другой.'
                        : 'Регистрация пока недоступна. Попробуй позже.'
                };
            } catch {
                // Auth user may remain if rollback fails. Must not register
                // another account with this email or make a duplicate profile.
            }
        }
        try { await signOutAuth(); } catch { /* best-effort only */ }
        return {
            success: false, code: code || 'unknown',
            recoveryRequired: true,
            error: 'Создание профиля не подтверждено. Не регистрируйся повторно с этим email; войди в аккаунт или обратись в поддержку.'
        };
    }
}
