import { isValidUsername, normalizeUsername } from './username.js';

const REGISTRATION_STATES = new Set([
    'complete',
    'needs-profile',
    'temporarily-unavailable'
]);

function callableData(result) {
    if (!result || typeof result !== 'object' ||
        !result.data || typeof result.data !== 'object') {
        const error = new Error('Некорректный ответ сервера регистрации');
        error.code = 'functions/internal';
        throw error;
    }
    return result.data;
}

// A thin, dependency-injected adapter. It does not initialize Firebase,
// enable rollout, or decide whether the caller is allowed to use signup V2.
export function createSignupV2Client({ functions, httpsCallable }) {
    if (!functions || typeof httpsCallable !== 'function') {
        throw new TypeError('Некорректная конфигурация Firebase Functions');
    }

    const registerCallable = httpsCallable(functions, 'registerProfileV2');
    const stateCallable = httpsCallable(functions, 'getRegistrationStateV2');

    if (typeof registerCallable !== 'function' || typeof stateCallable !== 'function') {
        throw new TypeError('Не удалось подготовить серверные вызовы регистрации');
    }

    return Object.freeze({
        async registerProfile(username) {
            if (typeof username !== 'string' || username !== username.trim() ||
                !isValidUsername(username)) {
                const error = new Error('Некорректный никнейм');
                error.code = 'functions/invalid-argument';
                throw error;
            }

            const data = callableData(await registerCallable({ username }));
            const canonical = normalizeUsername(username);
            if (data.username !== canonical || typeof data.recovered !== 'boolean') {
                const error = new Error('Сервер вернул некорректный результат регистрации');
                error.code = 'functions/internal';
                throw error;
            }

            return {
                username: data.username,
                recovered: data.recovered
            };
        },

        async getRegistrationState() {
            const data = callableData(await stateCallable());
            if (!REGISTRATION_STATES.has(data.status)) {
                const error = new Error('Сервер вернул неизвестное состояние регистрации');
                error.code = 'functions/internal';
                throw error;
            }
            return { status: data.status };
        }
    });
}
