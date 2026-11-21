import { ChatV2HistoryController } from './chat-v2-history-controller.js';
import { ChatV2PilotView } from './chat-v2-pilot-view.js';
import { ChatV2ActiveRefresh } from './chat-v2-active-refresh.js';

// Candidate-only composer. The injected lookup must call an authenticated v2
// history endpoint; this class does not access legacy Firestore collections.
export class ChatV2PilotConversation {
    constructor({ root, session, chatId, title, lookup, viewFactory, limit = 30,
        isVisible, schedule, cancel, intervalMs = 10000,
        documentRef, observerFactory, isActive = () => true }) {
        const historyLookup = lookup ?? session?.loadHistory?.bind(session);
        if (typeof historyLookup !== 'function') throw new TypeError('Нужен транспорт истории');
        if (typeof isActive !== 'function') throw new TypeError('Нужна проверка активного диалога');
        this.disposed = false;
        this.view = null;
        this.readTracker = null;
        this.observedIncomingElements = new Set();
        this.currentHistoryState = null;
        this.documentRef = documentRef ?? root?.ownerDocument;
        this.observerFactory = observerFactory;
        this.isActive = isActive;
        this.history = new ChatV2HistoryController(historyLookup, snapshot => {
            if (this.disposed) return;
            this.currentHistoryState = snapshot;
            this._renderCurrentHistoryState();
            void this._refreshOutgoingReadStatuses(snapshot.messages);
        }, limit);
        const createView = viewFactory || (options => new ChatV2PilotView(options));
        this.view = createView({
            root, session, chatId, title,
            onLoadOlder: () => this.loadOlder(),
            onSent: () => this.refreshLatest()
        });
        this.chatId = chatId;
        this.autoRefresh = new ChatV2ActiveRefresh({
            refresh: () => {
                // Do not collapse a reader's already paginated older history.
                if (this.history.messages.length > this.history.limit) return;
                return this.refreshLatest();
            },
            isVisible: isVisible ?? (() => root?.ownerDocument?.visibilityState !== 'hidden'),
            schedule, cancel, intervalMs
        });
    }

    async mount() {
        if (this.disposed) throw new Error('Диалог закрыт');
        this.view.mount();
        const result = await this.history.open(this.chatId);
        if (!this.disposed) this.autoRefresh.start();
        return result;
    }

    _renderCurrentHistoryState() {
        if (this.disposed || !this.currentHistoryState) return;
        const deliveryStates = this.session?.delivery?.messages;
        const byServerMessageId = new Map();
        if (deliveryStates instanceof Map) {
            for (const state of deliveryStates.values()) {
                if (state?.messageId && typeof state.deliveryStatus === 'string') {
                    byServerMessageId.set(state.messageId, state.deliveryStatus);
                }
            }
        }
        const messages = this.currentHistoryState.messages.map(message => {
            const deliveryStatus = byServerMessageId.get(message.id);
            return deliveryStatus ? { ...message, deliveryStatus } : message;
        });
        this.view?.setHistoryState({ ...this.currentHistoryState, messages });
        this._syncReadObservers();
    }

    async _refreshOutgoingReadStatuses(messages) {
        if (this.disposed || typeof this.session?.refreshRead !== 'function') return;
        const states = this.session?.delivery?.messages;
        if (!(states instanceof Map)) return;
        const pending = [];
        for (const message of messages) {
            if (message.senderId !== this.session.userId) continue;
            for (const [clientMessageId, state] of states) {
                if (state?.messageId === message.id && state.deliveryStatus === 'sent') {
                    pending.push(clientMessageId);
                    break;
                }
            }
        }
        if (!pending.length) return;
        let results;
        try {
            results = await Promise.all(pending.map(id => this.session.refreshRead(id)));
        } catch {
            // A logout, revoked pilot or transport failure must not create an
            // unhandled rejection or alter the last confirmed delivery state.
            return;
        }
        if (!this.disposed && results.some(result => result?.status === 'read')) {
            this._renderCurrentHistoryState();
        }
    }

    _syncReadObservers() {
        if (this.disposed || this.readTrackingUnavailable ||
            typeof this.session?.watchIncoming !== 'function' ||
            typeof this.view?.getMessageListElement !== 'function' ||
            typeof this.view?.getIncomingMessageElements !== 'function') return;
        const list = this.view.getMessageListElement();
        if (!list) return;
        if (!this.readTracker) {
            const options = {
                chatId: this.chatId,
                root: list,
                isActive: () => !this.disposed && this.isActive() &&
                    this.session?.userId === this.session?.getUserId?.()
            };
            if (this.documentRef) options.documentRef = this.documentRef;
            if (this.observerFactory) options.observerFactory = this.observerFactory;
            try {
                this.readTracker = this.session.watchIncoming(options);
            } catch {
                // Visibility receipts are best-effort UI enhancement. A browser
                // without IntersectionObserver must still be able to read/send.
                this.readTracker = null;
                this.readTrackingUnavailable = true;
                return;
            }
        }
        if (!this.readTracker) return;
        for (const element of this.observedIncomingElements) {
            this.readTracker.unobserve(element);
        }
        this.observedIncomingElements.clear();
        for (const item of this.view.getIncomingMessageElements()) {
            if (item?.element && item.message &&
                this.readTracker.observe(item.element, item.message)) {
                this.observedIncomingElements.add(item.element);
            }
        }
    }

    refreshLatest() {
        if (this.disposed) return Promise.resolve({ status: 'stale' });
        return this.history.refreshLatest();
    }

    loadOlder() {
        if (this.disposed) return Promise.resolve({ status: 'stale' });
        return this.history.loadOlder();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.autoRefresh.stop();
        this.history.clear();
        this.currentHistoryState = null;
        if (this.readTracker) {
            if (typeof this.session?.stopWatchingIncoming === 'function') {
                this.session.stopWatchingIncoming(this.readTracker);
            } else {
                this.readTracker.stop();
            }
            this.readTracker = null;
        }
        this.observedIncomingElements.clear();
        this.view.destroy();
    }
}
