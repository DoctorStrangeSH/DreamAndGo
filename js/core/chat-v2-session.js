import { ChatV2Transport } from './chat-v2-transport.js';
import { ChatDeliveryController } from './chat-delivery-controller.js';
import { ChatUnreadController } from './chat-unread-controller.js';
import { ChatReadVisibilityTracker } from './chat-read-visibility.js';
import { isValidChatUid } from './chat-message-policy.js';

// Explicitly opt-in candidate v2 wiring. It does not touch legacy chat, Firebase
// initialization, realtime listeners or production DOM.
export class ChatV2Session {
    constructor({ invoke, getUserId, createId, onDeliveryChange, onUnreadChange, pendingStore = null }) {
        if (typeof getUserId !== 'function' || typeof invoke !== 'function') {
            throw new TypeError('Требуется авторизованный транспорт');
        }
        const userId = getUserId();
        if (!isValidChatUid(userId)) {
            throw new Error('Требуется вход в аккаунт');
        }
        this.getUserId = getUserId;
        this.userId = userId;
        if (pendingStore && (
            typeof pendingStore.save !== 'function' ||
            typeof pendingStore.load !== 'function' ||
            typeof pendingStore.remove !== 'function' ||
            typeof pendingStore.clear !== 'function'
        )) throw new TypeError('Некорректное защищённое хранилище очереди');
        this.pendingStore = pendingStore;
        this.sendTasks = new Map();
        this.disposed = false;
        this.trackers = new Set();
        this.transport = new ChatV2Transport(invoke, getUserId);
        this.delivery = new ChatDeliveryController(
            intent => this.transport.send(intent),
            intent => this.transport.status(intent),
            userId,
            createId,
            onDeliveryChange
        );
        this.unread = new ChatUnreadController(
            request => this.transport.unread(request),
            onUnreadChange
        );
    }

    _assertActive() {
        if (this.disposed || this.getUserId() !== this.userId) {
            throw new Error('Сессия изменилась');
        }
    }

    createChat(partnerId) {
        this._assertActive();
        return this.transport.createChat(partnerId);
    }

    prepare(chatId, text) {
        this._assertActive();
        return this.delivery.prepare(chatId, text);
    }

    // Rehydrate an explicitly retained intent after restart; the caller owns
    // secure persistence and must provide the original text and client UUID.
    restore(chatId, text, clientMessageId) {
        this._assertActive();
        return this.delivery.restore(chatId, text, clientMessageId);
    }

    send(clientMessageId) {
        this._assertActive();
        const intent = this.delivery.outbox.get(clientMessageId);
        if (!intent) return this.delivery.send(clientMessageId);
        const key = intent.clientMessageId;
        const existing = this.sendTasks.get(key);
        if (existing) return existing;
        const task = this._sendPersisted(intent).finally(() => {
            if (this.sendTasks.get(key) === task) this.sendTasks.delete(key);
        });
        this.sendTasks.set(key, task);
        return task;
    }

    async _sendPersisted(intent) {
        const clientMessageId = intent.clientMessageId;
        if (this.pendingStore) {
            await this.pendingStore.save(intent);
            this._assertActive();
        }
        const current = this.delivery.get(clientMessageId);
        if (current?.deliveryStatus === 'checking') {
            const reconciliation = await this.delivery.reconcile(clientMessageId);
            this._assertActive();
            if (reconciliation.status === 'sent') {
                if (this.pendingStore) await this.pendingStore.remove(clientMessageId);
                if (this.disposed || this.getUserId() !== this.userId) {
                    return { success: false, error: 'Сессия изменилась' };
                }
                return { success: true, messageId: reconciliation.messageId, reconciled: true };
            }
            if (reconciliation.status !== 'missing') {
                return { success: false, error: 'Не удалось подтвердить состояние сообщения' };
            }
        }
        const result = await this.delivery.send(clientMessageId);
        if (this.disposed || this.getUserId() !== this.userId) {
            return { success: false, error: 'Сессия изменилась' };
        }
        if (result.success && this.pendingStore) {
            await this.pendingStore.remove(clientMessageId);
            if (this.disposed || this.getUserId() !== this.userId) {
                return { success: false, error: 'Сессия изменилась' };
            }
        }
        return result;
    }

    async restorePending() {
        this._assertActive();
        if (!this.pendingStore) return [];
        const records = await this.pendingStore.load();
        this._assertActive();
        const results = [];
        for (const record of records) {
            this._assertActive();
            const intent = this.delivery.restore(record.chatId, record.text, record.clientMessageId);
            const status = await this.delivery.reconcile(intent.clientMessageId);
            this._assertActive();
            if (status.status === 'sent') {
                await this.pendingStore.remove(intent.clientMessageId);
                this._assertActive();
            }
            results.push({ clientMessageId: intent.clientMessageId, status });
        }
        return results;
    }

    async discardPending(clientMessageId) {
        this._assertActive();
        if (!this.pendingStore) return this.delivery.discard(clientMessageId);
        const removed = await this.pendingStore.remove(clientMessageId);
        this._assertActive();
        const discarded = this.delivery.discard(clientMessageId);
        return removed || discarded;
    }

    async logout() {
        this._assertActive();
        try {
            if (this.pendingStore) await this.pendingStore.clear();
            this._assertActive();
        } finally {
            // Even a storage failure must not leave an authenticated view model alive.
            this.dispose();
        }
    }

    discard(clientMessageId) {
        this._assertActive();
        return this.delivery.discard(clientMessageId);
    }

    reconcile(clientMessageId) {
        this._assertActive();
        return this.delivery.reconcile(clientMessageId);
    }

    refreshRead(clientMessageId) {
        this._assertActive();
        return this.delivery.refreshRead(clientMessageId);
    }

    loadHistory(request) {
        this._assertActive();
        return this.transport.history(request);
    }

    refreshUnread(chatId) {
        this._assertActive();
        return this.unread.refresh(chatId);
    }

    // Only the visibility tracker is allowed to submit an incoming-message receipt.
    // The caller must supply a foreground/active-chat predicate and a DOM root.
    watchIncoming({ chatId, root, isActive, documentRef, observerFactory }) {
        this._assertActive();
        if (typeof isActive !== 'function') {
            throw new TypeError('Требуется проверка активного диалога');
        }
        const tracker = new ChatReadVisibilityTracker({
            root,
            currentUserId: this.userId,
            documentRef,
            observerFactory,
            isActive: () => !this.disposed && this.getUserId() === this.userId && isActive(),
            markRead: async messageId => {
                this._assertActive();
                const receipt = await this.transport.markRead(chatId, messageId);
                // A stale or failed refresh never changes a numeric badge optimistically.
                if (!this.disposed && this.getUserId() === this.userId) {
                    await this.unread.refresh(chatId);
                }
                return receipt;
            }
        });
        this.trackers.add(tracker);
        return tracker;
    }

    stopWatchingIncoming(tracker) {
        if (!tracker || !this.trackers.has(tracker)) return false;
        tracker.stop();
        this.trackers.delete(tracker);
        return true;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.transport.invalidate();
        for (const tracker of this.trackers) tracker.stop();
        this.trackers.clear();
        this.delivery.clear();
        this.unread.clear();
        this.sendTasks.clear();
    }
}
