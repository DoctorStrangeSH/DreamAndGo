import { isValidChatUid } from './chat-message-policy.js';

// Candidate v2 transport adapter. The caller injects the Firebase callable
// invoker (name, payload) => Promise<{ data }>, already bound to europe-west3.
// Never routes a request to a legacy endpoint or stores credentials.
const isChatId = value => typeof value === 'string' && value.length > 0 &&
    value.length <= 128 && !value.includes('/');
const isMessageId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isUuid = value => typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export class ChatV2Transport {
    constructor(invoke, getUserId) {
        if (typeof invoke !== 'function' || typeof getUserId !== 'function') {
            throw new TypeError('Нужен авторизованный транспорт');
        }
        this.invoke = invoke;
        this.getUserId = getUserId;
        this.generation = 0;
    }

    invalidate() { this.generation++; }

    async _call(endpoint, payload) {
        const userId = this.getUserId();
        if (!isValidChatUid(userId)) {
            throw new Error('Требуется вход в аккаунт');
        }
        const generation = this.generation;
        const reply = await this.invoke(endpoint, payload);
        if (generation !== this.generation || this.getUserId() !== userId) {
            throw new Error('Сессия изменилась');
        }
        if (!reply || typeof reply !== 'object' || !Object.hasOwn(reply, 'data') ||
            !reply.data || typeof reply.data !== 'object') {
            throw new Error('Некорректный ответ сервера');
        }
        return reply.data;
    }

    async createChat(partnerId) {
        if (!isValidChatUid(partnerId) || partnerId === this.getUserId()) {
            throw new TypeError('Некорректный собеседник');
        }
        const result = await this._call('createPrivateChatV2', { partnerId });
        if (!isChatId(result.chatId) || result.version !== 2) throw new Error('Некорректный ответ сервера');
        return { chatId: result.chatId, version: 2 };
    }

    async send({ chatId, text, clientMessageId }) {
        if (!isChatId(chatId) || typeof text !== 'string' || !text.trim() ||
            text.length > 2000 || !isUuid(clientMessageId)) {
            throw new TypeError('Некорректное сообщение');
        }
        const result = await this._call('sendPrivateMessageV2', { chatId, text, clientMessageId });
        if (result.chatId !== chatId || !isMessageId(result.messageId)) {
            throw new Error('Некорректное подтверждение отправки');
        }
        return { chatId, messageId: result.messageId };
    }

    async status({ chatId, clientMessageId }) {
        if (!isChatId(chatId) || !isUuid(clientMessageId)) throw new TypeError('Некорректный запрос');
        const result = await this._call('getPrivateMessageStatusV2', { chatId, clientMessageId });
        if (result.status === 'missing') return { status: 'missing' };
        if (result.status !== 'sent' || !isMessageId(result.messageId) || typeof result.read !== 'boolean') {
            throw new Error('Некорректный статус сообщения');
        }
        return { status: 'sent', messageId: result.messageId, read: result.read };
    }

    async markRead(chatId, messageId) {
        if (!isChatId(chatId) || !isMessageId(messageId)) throw new TypeError('Некорректная квитанция');
        const result = await this._call('markPrivateMessageReadV2', { chatId, messageId });
        if (result.status !== 'read' || result.messageId !== messageId) {
            throw new Error('Некорректная квитанция сервера');
        }
        return { status: 'read', messageId };
    }

    async unread({ chatId }) {
        if (!isChatId(chatId)) throw new TypeError('Некорректный диалог');
        const result = await this._call('getPrivateChatUnreadV2', { chatId });
        if (result.chatId !== chatId || !Number.isSafeInteger(result.unread) || result.unread < 0) {
            throw new Error('Некорректный счётчик сообщений');
        }
        return { chatId, unread: result.unread };
    }
    // Candidate history callable contract. The backend is not yet deployed.
    // Validate the complete page before exposing it to UI pagination state.
    async history({ chatId, beforeSequence = null, limit = 30 }) {
        if (!isChatId(chatId) || (beforeSequence !== null &&
            (!Number.isSafeInteger(beforeSequence) || beforeSequence <= 0)) ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
            throw new TypeError('Некорректный запрос истории');
        }
        const result = await this._call('getPrivateChatHistoryV2',
            { chatId, beforeSequence, limit });
        if (result.chatId !== chatId || !Array.isArray(result.messages) ||
            result.messages.length > limit || typeof result.hasMore !== 'boolean') {
            throw new Error('Некорректная история сообщений');
        }
        const seen = new Set();
        let previous = beforeSequence ?? Number.MAX_SAFE_INTEGER;
        const messages = result.messages.map(message => {
            if (!message || !isMessageId(message.id) ||
                !Number.isSafeInteger(message.sequence) || message.sequence <= 0 ||
                message.sequence >= previous || seen.has(message.id) ||
                typeof message.senderId !== 'string' || !message.senderId ||
                typeof message.text !== 'string' || message.text.length > 2000 ||
                typeof message.read !== 'boolean') {
                throw new Error('Некорректная история сообщений');
            }
            seen.add(message.id);
            previous = message.sequence;
            return Object.freeze({
                id: message.id, sequence: message.sequence, senderId: message.senderId,
                text: message.text, read: message.read
            });
        });
        const cursor = result.hasMore && messages.length ? messages.at(-1).sequence : null;
        if ((result.hasMore && messages.length === 0) ||
            result.nextBeforeSequence !== cursor) {
            throw new Error('Некорректный курсор истории');
        }
        return { chatId, messages, hasMore: result.hasMore, nextBeforeSequence: cursor };
    }

}
