import { app } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const REGION = 'europe-west3';
const ENDPOINTS = Object.freeze({
    findByUsername: 'findPublicProfileByUsernameV2',
    getByIds: 'getPublicProfilesV2'
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
    if (!Array.isArray(userIds) || userIds.length > 50) {
        throw new TypeError('Можно загрузить не более 50 профилей за раз');
    }
    if (userIds.length === 0) return [];
    const data = await getInvoker()('getByIds', { userIds });
    return Array.isArray(data?.profiles) ? data.profiles : [];
}
