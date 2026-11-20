import { app } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const REGION = 'europe-west3';
const ENDPOINTS = Object.freeze({
    findByUsername: 'findPublicProfileByUsernameV2',
    getByIds: 'getPublicProfilesV2',
    setVisibility: 'setPublicProfileVisibilityV2'
});

function createInvoker() {
    if (!app) throw new Error('Firebase не инициализирован');
    const functions = getFunctions(app, REGION);
    const handles = new Map();
    return async (key, payload) => {
        const endpoint = ENDPOINTS[key];
        if (!endpoint) throw new TypeError('Недопустимая операция с публичным профилем');
        let callable = handles.get(endpoint);
        if (!callable) {
            callable = httpsCallable(functions, endpoint);
            handles.set(endpoint, callable);
        }
        const response = await callable(payload);
        return response?.data;
    };
}

let invoke;
function getInvoker() {
    if (!invoke) invoke = createInvoker();
    return invoke;
}

export async function findPublicProfileByUsername(username) {
    if (typeof username !== 'string') return null;
    const data = await getInvoker()('findByUsername', { username });
    return data?.profile || null;
}

export async function getPublicProfilesByIds(userIds) {
    if (!Array.isArray(userIds) || userIds.length > 500) {
        throw new TypeError('Можно загрузить не более 500 профилей за раз');
    }
    if (userIds.length === 0) return [];
    const profiles = [];
    for (let offset = 0; offset < userIds.length; offset += 50) {
        const batch = userIds.slice(offset, offset + 50);
        const data = await getInvoker()('getByIds', { userIds: batch });
        if (Array.isArray(data?.profiles)) profiles.push(...data.profiles);
    }
    return profiles;
}


export async function setPublicProfileVisibility(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Некорректная настройка приватности');
    const data = await getInvoker()('setVisibility', { enabled });
    return data?.enabled === true;
}
