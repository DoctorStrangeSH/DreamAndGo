const REGION = 'europe-west3';
const VISIBILITY_KEYS = Object.freeze([
    'profile', 'travels', 'food', 'movies', 'books', 'dreams'
]);

function validateVisibility(data, HttpsError) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length !== 1 || !Object.hasOwn(data, 'visibility')) {
        throw new HttpsError('invalid-argument', 'Переданы недопустимые настройки приватности');
    }

    const visibility = data.visibility;
    if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) {
        throw new HttpsError('invalid-argument', 'Некорректные настройки видимости');
    }

    const keys = Object.keys(visibility);
    if (keys.length !== VISIBILITY_KEYS.length ||
        keys.some(key => !VISIBILITY_KEYS.includes(key))) {
        throw new HttpsError('invalid-argument', 'Нужно передать полный набор настроек видимости');
    }

    for (const key of VISIBILITY_KEYS) {
        if (visibility[key] !== 'public' && visibility[key] !== 'private') {
            throw new HttpsError('invalid-argument', 'Некорректное значение настройки видимости');
        }
    }

    return Object.fromEntries(VISIBILITY_KEYS.map(key => [key, visibility[key]]));
}

/**
 * Update the owner's complete visibility preferences and public projection
 * atomically. The caller can never choose a UID or write arbitrary profile
 * fields. Legacy privacy defaults are replaced only after an explicit full
 * consent submission from the authenticated owner.
 */
export function createProfileCallables({
    onCall,
    HttpsError,
    getFirestore,
    FieldValue,
    buildPublicProfile
}) {
    if (typeof onCall !== 'function' || typeof HttpsError !== 'function' ||
        typeof getFirestore !== 'function' ||
        typeof FieldValue?.serverTimestamp !== 'function' ||
        typeof buildPublicProfile !== 'function') {
        throw new TypeError('Некорректная конфигурация управления приватностью профиля');
    }

    const updateProfileVisibilityV1 = onCall({
        region: REGION,
        enforceAppCheck: true
    }, async request => {
        const uid = request.auth?.uid;
        if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
            throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
        }

        const visibility = validateVisibility(request.data, HttpsError);
        const db = getFirestore();
        const userRef = db.collection('users').doc(uid);
        const publicProfileRef = db.collection('publicProfiles').doc(uid);

        let snapshot;
        try {
            snapshot = await userRef.get();
        } catch {
            throw new HttpsError('unavailable', 'Не удалось загрузить профиль');
        }

        if (!snapshot?.exists) {
            throw new HttpsError('failed-precondition', 'Сначала необходимо завершить создание профиля');
        }

        const userData = snapshot.data();
        let projection;
        try {
            projection = buildPublicProfile(uid, {
                ...userData,
                privacy: visibility
            });
        } catch {
            throw new HttpsError('failed-precondition', 'Профиль содержит некорректные данные и требует проверки');
        }

        const batch = db.batch();
        batch.update(userRef, {
            privacy: visibility,
            privacyUpdatedAt: FieldValue.serverTimestamp()
        });

        if (projection) {
            batch.set(publicProfileRef, {
                ...projection,
                updatedAt: FieldValue.serverTimestamp()
            });
        } else {
            batch.delete(publicProfileRef);
        }

        try {
            await batch.commit();
        } catch {
            throw new HttpsError('unavailable', 'Не удалось сохранить настройки приватности');
        }

        return {
            profileVisibility: visibility.profile,
            publicProfilePublished: projection !== null
        };
    });

    return Object.freeze({ updateProfileVisibilityV1 });
}
