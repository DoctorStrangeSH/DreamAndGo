import { isValidUsername, normalizeUsername } from '../js/core/username.js';

const REGION = 'europe-west3';
const EDITABLE_FIELDS = Object.freeze(['username', 'displayName', 'bio', 'location']);

function validateProfileInput(data, HttpsError) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length !== EDITABLE_FIELDS.length ||
        Object.keys(data).some(key => !EDITABLE_FIELDS.includes(key))) {
        throw new HttpsError('invalid-argument', 'Переданы недопустимые поля профиля');
    }

    const username = data.username;
    if (typeof username !== 'string' || username !== username.trim() || !isValidUsername(username)) {
        throw new HttpsError('invalid-argument', 'Никнейм должен содержать от 3 до 20 символов: латиница, цифры и _');
    }

    const limits = { displayName: 80, bio: 500, location: 100 };
    const result = { username };
    for (const [field, maxLength] of Object.entries(limits)) {
        if (typeof data[field] !== 'string' || data[field].length > maxLength) {
            throw new HttpsError('invalid-argument', 'Некорректные данные профиля');
        }
        result[field] = data[field].trim();
    }
    return result;
}

function isRegistryReady(snapshot) {
    return snapshot?.exists === true &&
        snapshot.get('ready') === true &&
        snapshot.get('schemaVersion') === 1 &&
        snapshot.get('legacyBackfillComplete') === true;
}

/**
 * Private profile reads and edits are owner-only callable operations.
 * Username changes require a ready reservation registry and atomically move
 * the reservation; public projection refresh is part of the same transaction.
 */
export function createProfileAccountCallables({
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
        throw new TypeError('Некорректная конфигурация управления аккаунтом');
    }

    const options = { region: REGION, enforceAppCheck: true };

    const getMyProfileV1 = onCall(options, async request => {
        const uid = request.auth?.uid;
        if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
            throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
        }
        if (request.data && (typeof request.data !== 'object' || Array.isArray(request.data) || Object.keys(request.data).length > 0)) {
            throw new HttpsError('invalid-argument', 'Параметры чтения профиля не поддерживаются');
        }

        try {
            const snapshot = await getFirestore().collection('users').doc(uid).get();
            if (!snapshot?.exists) {
                throw new HttpsError('not-found', 'Профиль не найден');
            }
            return { profile: snapshot.data() };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось загрузить профиль');
        }
    });

    const updateMyProfileV1 = onCall(options, async request => {
        const uid = request.auth?.uid;
        if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
            throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
        }
        const input = validateProfileInput(request.data, HttpsError);
        const db = getFirestore();
        const userRef = db.collection('users').doc(uid);
        const publicRef = db.collection('publicProfiles').doc(uid);
        const nextUsername = normalizeUsername(input.username);

        try {
            return await db.runTransaction(async transaction => {
                const userSnapshot = await transaction.get(userRef);
                if (!userSnapshot?.exists) {
                    throw new HttpsError('failed-precondition', 'Профиль ещё не создан');
                }

                const current = userSnapshot.data();
                const currentUsername = normalizeUsername(current.username);
                const usernameChanged = currentUsername !== nextUsername;
                let registrySnapshot;
                let oldReservationSnapshot;
                let newReservationSnapshot;
                let oldReservationRef;
                let newReservationRef;

                if (usernameChanged) {
                    const registryRef = db.collection('system').doc('usernameRegistry');
                    oldReservationRef = db.collection('usernameReservations').doc(currentUsername);
                    newReservationRef = db.collection('usernameReservations').doc(nextUsername);
                    [registrySnapshot, oldReservationSnapshot, newReservationSnapshot] = await Promise.all([
                        transaction.get(registryRef),
                        transaction.get(oldReservationRef),
                        transaction.get(newReservationRef)
                    ]);
                    if (!isRegistryReady(registrySnapshot)) {
                        throw new HttpsError('failed-precondition', 'Смена никнейма временно недоступна до завершения миграции');
                    }
                    if (!oldReservationSnapshot?.exists || oldReservationSnapshot.get('uid') !== uid) {
                        throw new HttpsError('failed-precondition', 'Текущий никнейм ещё не защищён реестром');
                    }
                    if (newReservationSnapshot?.exists && newReservationSnapshot.get('uid') !== uid) {
                        throw new HttpsError('already-exists', 'Этот никнейм уже занят');
                    }
                }

                const updatedProfile = {
                    ...current,
                    username: input.username,
                    usernameNormalized: nextUsername,
                    displayName: input.displayName,
                    bio: input.bio,
                    location: input.location
                };
                const profileUpdate = {
                    username: input.username,
                    usernameNormalized: nextUsername,
                    displayName: input.displayName,
                    bio: input.bio,
                    location: input.location,
                    profileUpdatedAt: FieldValue.serverTimestamp()
                };

                let publicProjection = null;
                if (current.privacy?.profile === 'public') {
                    try {
                        publicProjection = buildPublicProfile(uid, updatedProfile);
                        if (!publicProjection) {
                            throw new HttpsError('failed-precondition', 'Публичный профиль не прошёл проверку данных');
                        }
                    } catch {
                        throw new HttpsError('failed-precondition', 'Публичный профиль содержит некорректные данные');
                    }
                }

                transaction.update(userRef, profileUpdate);
                if (usernameChanged) {
                    transaction.delete(oldReservationRef);
                    if (!newReservationSnapshot?.exists) {
                        transaction.create(newReservationRef, {
                            uid,
                            username: input.username,
                            createdAt: FieldValue.serverTimestamp()
                        });
                    }
                }

                if (publicProjection) {
                    transaction.set(publicRef, {
                        ...publicProjection,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                } else if (current.privacy?.profile !== 'public') {
                    transaction.delete(publicRef);
                }

                return {
                    username: input.username,
                    usernameNormalized: nextUsername,
                    displayName: input.displayName,
                    bio: input.bio,
                    location: input.location,
                    publicProfileUpdated: publicProjection !== null
                };
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось сохранить профиль');
        }
    });

    return Object.freeze({ getMyProfileV1, updateMyProfileV1 });
}
