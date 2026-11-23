import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { createChatV2CallableInvoker } from '../core/chat-v2-callable-invoker.js';
import { createEncryptedChatOutbox, createIndexedDbChatOutbox } from './chat-v2-offline-outbox.js';

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
        this.activeOutboxUid = null;
        this.outboxFlushPromise = null;
        this.onOutboxChange = null;
        try {
            this.outbox = createEncryptedChatOutbox({
                store: createIndexedDbChatOutbox()
            });
        } catch (error) {
            this.outbox = null;
            console.warn('Зашифрованная офлайн-очередь недоступна:', error);
        }
        this.handleOnline = () => {
            if (this.activeOutboxUid) void this.flushOutbox(this.activeOutboxUid);
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('online', this.handleOnline);
        }

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

    get isOutboxAvailable() {
        return Boolean(this.outbox);
    }

    resetSession() {
        this.pendingMessageIds.clear();
        this.activeOutboxUid = null;
    }

    startOutbox(uid) {
        if (typeof uid !== 'string' || !uid) return;
        this.activeOutboxUid = uid;
        if (globalThis.navigator?.onLine !== false) {
            void this.flushOutbox(uid);
        }
    }

    async getPendingMessages(uid, chatId = null) {
        if (!this.outbox) return [];
        return this.outbox.list(uid, chatId);
    }

    isTransientSendError(error) {
        const code = String(error?.code || '').toLowerCase();
        return globalThis.navigator?.onLine === false ||
            ['unavailable', 'functions/unavailable', 'deadline-exceeded',
                'functions/deadline-exceeded', 'network-request-failed',
                'functions/network-request-failed', 'aborted'].includes(code);
    }

    async enqueueOfflineMessage(uid, chatId, text, messageId) {
        if (!this.outbox) {
            throw new Error('Не удалось безопасно сохранить сообщение: зашифрованная очередь недоступна.');
        }
        const queued = await this.outbox.enqueue({ uid, chatId, text, messageId });
        this.onOutboxChange?.();
        return { success: true, queued: true, ...queued };
    }

    async flushOutbox(uid) {
        if (!this.outbox || !this.isEnabled || !uid || uid !== this.activeOutboxUid ||
            globalThis.navigator?.onLine === false) return;
        if (this.outboxFlushPromise) return this.outboxFlushPromise;

        this.outboxFlushPromise = (async () => {
            try {
                const records = await this.outbox.getQueued(uid);
                const pendingMessages = await this.outbox.list(uid);
                const textById = new Map(pendingMessages.map(message => [message.id, message.text]));
                for (const record of records) {
                    if (uid !== this.activeOutboxUid || globalThis.navigator?.onLine === false) break;
                    try {
                        const text = textById.get(record.messageId);
                        if (typeof text !== 'string') throw new Error('Локальное сообщение не найдено.');
                        const result = await this.call('sendPrivateMessageV2', {
                            chatId: record.chatId,
                            text,
                            clientMessageId: record.messageId
                        });
                        if (result.success !== true || typeof result.messageId !== 'string') {
                            throw new Error('Сервер не подтвердил отправку сообщения.');
                        }
                        await this.outbox.remove(uid, record.messageId);
                        this.onOutboxChange?.();
                    } catch (error) {
                        if (String(error?.code || '').endsWith('permission-denied')) {
                            await this.outbox.markBlocked(uid, record.messageId);
                            this.onOutboxChange?.();
                            continue;
                        }
                        if (!this.isTransientSendError(error)) {
                            console.error('Офлайн-сообщение оставлено в очереди:', error);
                        }
                        break;
                    }
                }
            } catch (error) {
                console.error('Не удалось прочитать зашифрованную офлайн-очередь:', error);
                this.onOutboxChange?.();
            }
        })().finally(() => {
            this.outboxFlushPromise = null;
            if (this.activeOutboxUid && this.activeOutboxUid !== uid &&
                globalThis.navigator?.onLine !== false) {
                void this.flushOutbox(this.activeOutboxUid);
            }
        });
        return this.outboxFlushPromise;
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

    async blockUser(targetUid) {
        const result = await this.call('blockUserV1', { targetUid });
        if (result.success !== true || result.blockedUid !== targetUid) {
            throw new Error('Не удалось заблокировать пользователя.');
        }
        return result;
    }

    async unblockUser(targetUid) {
        const result = await this.call('unblockUserV1', { targetUid });
        if (result.success !== true || result.unblockedUid !== targetUid) {
            throw new Error('Не удалось снять блокировку.');
        }
        return result;
    }

    async getBlockStatus(chatId) {
        const result = await this.call('getChatBlockStatusV2', { chatId });
        if (typeof result.canSend !== 'boolean' ||
            typeof result.blockedByMe !== 'boolean' ||
            typeof result.blockedByPartner !== 'boolean') {
            throw new Error('Сервер вернул некорректный статус блокировки.');
        }
        return result;
    }

    async getContacts() {
        const result = await this.call('getMyChatContactsV2', {});
        if (!Array.isArray(result.contacts)) {
            throw new Error('Сервер вернул некорректный список друзей.');
        }
        return result.contacts;
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

    async sendMessage(chatId, text, uid) {
        const normalizedText = String(text ?? '').trim();
        if (!normalizedText || normalizedText.length > 4000) {
            throw new Error('Сообщение должно содержать от 1 до 4000 символов.');
        }
        if (typeof uid !== 'string' || !uid) throw new Error('Не удалось определить аккаунт отправителя.');
        const pendingKey = JSON.stringify([uid, chatId, normalizedText]);
        const clientMessageId = this.pendingMessageIds.get(pendingKey) || createClientMessageId();
        this.pendingMessageIds.set(pendingKey, clientMessageId);

        if (globalThis.navigator?.onLine === false) {
            const queued = await this.enqueueOfflineMessage(uid, chatId, normalizedText, clientMessageId);
            this.pendingMessageIds.delete(pendingKey);
            return queued;
        }

        try {
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
        } catch (error) {
            if (this.isTransientSendError(error)) {
                const queued = await this.enqueueOfflineMessage(uid, chatId, normalizedText, clientMessageId);
                this.pendingMessageIds.delete(pendingKey);
                return queued;
            }
            throw error;
        }
    }

    async getHistoryPage(chatId, beforeMessageId = null) {
        const payload = beforeMessageId ? { chatId, beforeMessageId } : { chatId };
        const result = await this.call('getPrivateChatHistoryV2', payload);
        if (!Array.isArray(result.messages)) {
            throw new Error('Сервер вернул некорректную историю сообщений.');
        }
        const messages = result.messages.map(message => ({
            ...message,
            createdAt: Number.isFinite(message.createdAt)
                ? new Date(message.createdAt)
                : new Date(),
            readAt: Number.isFinite(message.readAt) ? new Date(message.readAt) : null,
            editedAt: Number.isFinite(message.editedAt) ? new Date(message.editedAt) : null
        }));
        return {
            messages,
            nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null
        };
    }

    async getHistory(chatId) {
        return (await this.getHistoryPage(chatId)).messages;
    }

    async getMessageStatus(chatId, messageId) {
        return this.call('getPrivateMessageStatusV2', { chatId, messageId });
    }

    async markMessageRead(chatId, messageId) {
        return this.call('markPrivateMessageReadV2', { chatId, messageId });
    }

    async markMessagesRead(chatId, messageIds) {
        return this.call('markPrivateMessagesReadV2', { chatId, messageIds });
    }

    async getUnread(chatId) {
        const result = await this.call('getPrivateChatUnreadV2', { chatId });
        return Number.isSafeInteger(result.unread) ? Math.max(0, result.unread) : 0;
    }
}
