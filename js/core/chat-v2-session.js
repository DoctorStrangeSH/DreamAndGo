import { ChatV2Transport } from './chat-v2-transport.js';
import { ChatDeliveryController } from './chat-delivery-controller.js';
import { ChatUnreadController } from './chat-unread-controller.js';
import { ChatReadVisibilityTracker } from './chat-read-visibility.js';
import { isValidChatUid } from './chat-message-policy.js';

// Explicitly opt-in candidate v2 wiring. It does not touch legacy chat, Firebase
// initialization, realtime listeners or production DOM.
export class ChatV2Session {
    constructor({ invoke, getUserId, createId, onDeliveryChange, onUnreadChange }) {
        if (typeof getUserId !== 'function' || typeof invoke !== 'function') {
            throw new TypeError('Требуется авторизованный транспорт');
        }
        const userId = getUserId();
        if (!isValidChatUid(userId)) {
            throw new Error('Требуется вход в аккаунт');
        }
        this.getUserId = getUserId;
        this.userId = userId;
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
        return this.delivery.send(clientMessageId);
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

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.transport.invalidate();
        for (const tracker of this.trackers) tracker.stop();
        this.trackers.clear();
        this.delivery.clear();
        this.unread.clear();
    }
}
