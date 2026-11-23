// Only explicitly declared backend endpoints may be invoked by the browser.
// This allowlist is not authorization: every callable must authenticate and
// authorize the participant on the server.
export const CHAT_V2_ENDPOINTS = Object.freeze([
    'createPrivateChatV2',
    'sendPrivateMessageV2',
    'getMyChatContactsV2',
    'getMyPrivateChatsV2',
    'getPrivateMessageStatusV2',
    'markPrivateMessageReadV2',
    'markPrivateMessagesReadV2',
    'getPrivateChatUnreadV2',
    'getPrivateChatHistoryV2'
]);

export function createChatV2CallableInvoker(httpsCallable, functionsInstance) {
    if (typeof httpsCallable !== 'function' || !functionsInstance) {
        throw new TypeError('Требуется Firebase Functions SDK');
    }

    const allowed = new Set(CHAT_V2_ENDPOINTS);
    const handles = new Map();

    return (endpoint, payload) => {
        if (!allowed.has(endpoint)) {
            throw new TypeError('Недопустимая функция чата');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new TypeError('Некорректный запрос к чату');
        }

        let callable = handles.get(endpoint);
        if (!callable) {
            callable = httpsCallable(functionsInstance, endpoint);
            if (typeof callable !== 'function') {
                throw new TypeError('Недоступная функция чата');
            }
            handles.set(endpoint, callable);
        }
        return callable(payload);
    };
}
