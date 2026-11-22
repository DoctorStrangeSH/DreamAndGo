const REGION = 'europe-west3';

export function createRegistrationCallables({
    onCall,
    HttpsError,
    getAuth,
    getFirestore,
    FieldValue,
    registerProfileWithReservedUsername,
    getRegistrationState
}) {
    if (typeof onCall !== 'function' || typeof HttpsError !== 'function' ||
        typeof getAuth !== 'function' || typeof getFirestore !== 'function' ||
        !FieldValue || typeof FieldValue.serverTimestamp !== 'function' ||
        typeof registerProfileWithReservedUsername !== 'function' ||
        typeof getRegistrationState !== 'function') {
        throw new TypeError('Некорректная конфигурация серверной регистрации');
    }

    const registrationOptions = { region: REGION, enforceAppCheck: true };

    const registerProfileV2 = onCall(registrationOptions, async request => {
        const uid = request.auth?.uid;
        if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
            throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
        }

        let account;
        try {
            account = await getAuth().getUser(uid);
        } catch {
            throw new HttpsError('unauthenticated', 'Аккаунт не найден');
        }

        if (!account.email || account.disabled === true) {
            throw new HttpsError('failed-precondition', 'Нужен действующий аккаунт с email');
        }

        const result = await registerProfileWithReservedUsername(
            getFirestore(),
            uid,
            request.data?.username,
            account.email,
            () => FieldValue.serverTimestamp()
        );

        if (!result?.ok) {
            const code = result?.code;
            if (code === 'already-exists') {
                throw new HttpsError('already-exists', 'Никнейм занят или профиль уже существует');
            }
            if (code === 'failed-precondition') {
                throw new HttpsError('failed-precondition', 'Регистрация временно недоступна до безопасной миграции');
            }
            if (code === 'invalid-argument') {
                throw new HttpsError('invalid-argument', 'Некорректный никнейм');
            }
            throw new HttpsError('internal', 'Не удалось завершить регистрацию');
        }

        return {
            username: result.username,
            recovered: result.recovered === true
        };
    });

    const getRegistrationStateV2 = onCall(registrationOptions, async request => {
        const uid = request.auth?.uid;
        if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
            throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
        }

        const result = await getRegistrationState(getFirestore(), uid);
        if (!result?.ok) {
            throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
        }

        const allowedStates = new Set([
            'complete',
            'needs-profile',
            'temporarily-unavailable'
        ]);
        if (!allowedStates.has(result.status)) {
            throw new HttpsError('internal', 'Не удалось проверить состояние регистрации');
        }

        return { status: result.status };
    });

    return Object.freeze({ registerProfileV2, getRegistrationStateV2 });
}
