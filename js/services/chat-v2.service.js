import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { createChatV2CallableInvoker } from '../core/chat-v2-callable-invoker.js';

function createClientMessageId() {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
    if (!cryptoApi?.getRandomValues) throw new Error('Безопасная генерация ID недоступна.');
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function enabledMeta(name) {
    return document.querySelector(`meta[name="${name}"]`)
        ?.content?.trim().toLowerCase() === 'true';
}

export class ChatV2Service {
    constructor() {
        this.invoke = null;
        this.enabled = false;
        this.pendingMessageIds = new Map();

        if (!app || !appCheck ||
            !enabledMeta('firebase-functions-backend-ready') ||
            !enabledMeta('chat-v2-enabled')) {
            return;
        }

        try {
            const functions = getFunctions(app, 'europe-west3');
            this.invoke = createChatV2CallableInvoker(httpsCallable, functions);
            this.enabled = true;
        } catch (error) {
            console.error('Chat V2 не удалось инициализировать:', error);
        }
    }

    get isEnabled() {
        return this.enabled && typeof this.invoke === 'function';
    }

    resetSession() {
        this.pendingMessageIds.clear();
    }

    async call(endpoint, payload) {
        if (!this.isEnabled) {
            throw new Error('Новый чат пока не включён.');
        }
        const result = await this.invoke(endpoint, payload);
        if (!result?.data || typeof result.data !== 'object') {
            throw new Error('Сервер чата вернул некорректный ответ.');
        }
        return result.data;
    }

    async createPrivateChat(targetUid) {
        const result = await this.call('createPrivateChatV2', { targetUid });
        if (result.success !== true || typeof result.chatId !== 'string') {
            throw new Error('Не удалось создать диалог.');
        }
        return result.chatId;
    }

    async getChats() {
        const result = await this.call('getMyPrivateChatsV2', {});
        if (!Array.isArray(result.chats)) {
            throw new Error('Сервер вернул некорректный список диалогов.');
        }
        return result.chats.map(chat => ({
            ...chat,
            lastMessageTime: Number.isFinite(chat.lastMessageTime)
                ? new Date(chat.lastMessageTime)
                : new Date()
        }));
    }

    async sendMessage(chatId, text) {
        const normalizedText = String(text ?? '').trim();
        const pendingKey = JSON.stringify([chatId, normalizedText]);
        const clientMessageId = this.pendingMessageIds.get(pendingKey) || createClientMessageId();
        this.pendingMessageIds.set(pendingKey, clientMessageId);

        const result = await this.call('sendPrivateMessageV2', {
            chatId,
            text: normalizedText,
            clientMessageId
        });
        if (result.success !== true || typeof result.messageId !== 'string') {
            throw new Error('Не удалось отправить сообщение.');
        }
        this.pendingMessageIds.delete(pendingKey);
        return result;
    }

    async getHistory(chatId) {
        const result = await this.call('getPrivateChatHistoryV2', { chatId });
        if (!Array.isArray(result.messages)) {
            throw new Error('Сервер вернул некорректную историю сообщений.');
        }
        return result.messages.map(message => ({
            ...message,
            createdAt: Number.isFinite(message.createdAt)
                ? new Date(message.createdAt)
                : new Date(),
            readAt: Number.isFinite(message.readAt) ? new Date(message.readAt) : null,
            editedAt: Number.isFinite(message.editedAt) ? new Date(message.editedAt) : null
        }));
    }

    async getMessageStatus(chatId, messageId) {
        return this.call('getPrivateMessageStatusV2', { chatId, messageId });
    }

    async markMessageRead(chatId, messageId) {
        return this.call('markPrivateMessageReadV2', { chatId, messageId });
    }

    async getUnread(chatId) {
        const result = await this.call('getPrivateChatUnreadV2', { chatId });
        return Number.isSafeInteger(result.unread) ? Math.max(0, result.unread) : 0;
    }
}
