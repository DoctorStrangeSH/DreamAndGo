const REGION = 'europe-west3';
const MAX_NOTIFICATION_ID_LENGTH = 150;

function requireActor(request, HttpsError) {
    const uid = request.auth?.uid;
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) {
        throw new HttpsError('unauthenticated', 'Требуется вход в аккаунт');
    }
    return uid;
}

function requireNotificationId(data, HttpsError) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length !== 1 ||
        !Object.hasOwn(data, 'notificationId') ||
        typeof data.notificationId !== 'string' ||
        !data.notificationId ||
        data.notificationId.length > MAX_NOTIFICATION_ID_LENGTH ||
        data.notificationId.includes('/')) {
        throw new HttpsError('invalid-argument', 'Некорректный идентификатор уведомления');
    }
    return data.notificationId;
}

function toClientNotification(document) {
    const data = document.data() || {};
    const timestamp = data.createdAt;
    const createdAt = typeof timestamp?.toMillis === 'function'
        ? timestamp.toMillis()
        : (Number.isFinite(timestamp) ? timestamp : null);

    return {
        id: document.id,
        type: typeof data.type === 'string' ? data.type : 'system',
        title: typeof data.title === 'string' ? data.title.slice(0, 120) : 'Уведомление',
        message: typeof data.message === 'string' ? data.message.slice(0, 500) : '',
        icon: typeof data.icon === 'string' ? data.icon : 'bi-bell',
        color: typeof data.color === 'string' ? data.color : 'primary',
        link: typeof data.link === 'string' ? data.link : '',
        read: data.read === true,
        createdAt
    };
}

export function createNotificationCallables({ onCall, HttpsError, getFirestore }) {
    if (typeof onCall !== 'function' || typeof HttpsError !== 'function' ||
        typeof getFirestore !== 'function') {
        throw new TypeError('Некорректная конфигурация уведомлений');
    }

    const options = { region: REGION, enforceAppCheck: true };

    const getMyNotificationsV1 = onCall(options, async request => {
        const uid = requireActor(request, HttpsError);
        if (request.data !== undefined &&
            (!request.data || typeof request.data !== 'object' ||
             Array.isArray(request.data) || Object.keys(request.data).length !== 0)) {
            throw new HttpsError('invalid-argument', 'Запрос не должен содержать параметры');
        }

        try {
            const snapshot = await getFirestore()
                .collection('users').doc(uid).collection('notifications')
                .orderBy('createdAt', 'desc')
                .limit(30)
                .get();
            return { notifications: snapshot.docs.map(toClientNotification) };
        } catch {
            throw new HttpsError('unavailable', 'Не удалось загрузить уведомления');
        }
    });

    const markNotificationReadV1 = onCall(options, async request => {
        const uid = requireActor(request, HttpsError);
        const notificationId = requireNotificationId(request.data, HttpsError);
        const ref = getFirestore().collection('users').doc(uid)
            .collection('notifications').doc(notificationId);

        try {
            const snapshot = await ref.get();
            if (!snapshot.exists) {
                throw new HttpsError('not-found', 'Уведомление не найдено');
            }
            await ref.update({ read: true });
            return { success: true };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('unavailable', 'Не удалось обновить уведомление');
        }
    });

    const markAllNotificationsReadV1 = onCall(options, async request => {
        const uid = requireActor(request, HttpsError);
        if (request.data !== undefined &&
            (!request.data || typeof request.data !== 'object' ||
             Array.isArray(request.data) || Object.keys(request.data).length !== 0)) {
            throw new HttpsError('invalid-argument', 'Запрос не должен содержать параметры');
        }

        try {
            const db = getFirestore();
            const snapshot = await db.collection('users').doc(uid)
                .collection('notifications')
                .where('read', '==', false)
                .limit(100)
                .get();
            if (snapshot.empty) return { success: true, updated: 0 };

            const batch = db.batch();
            for (const document of snapshot.docs) {
                batch.update(document.ref, { read: true });
            }
            await batch.commit();
            return { success: true, updated: snapshot.size };
        } catch {
            throw new HttpsError('unavailable', 'Не удалось обновить уведомления');
        }
    });

    return Object.freeze({
        getMyNotificationsV1,
        markNotificationReadV1,
        markAllNotificationsReadV1
    });
}
