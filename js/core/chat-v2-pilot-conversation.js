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
        this.documentRef = documentRef ?? root?.ownerDocument;
        this.observerFactory = observerFactory;
        this.isActive = isActive;
        this.history = new ChatV2HistoryController(historyLookup, snapshot => {
            if (this.disposed) return;
            this.view?.setHistoryState(snapshot);
            this._syncReadObservers();
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

    _syncReadObservers() {
        if (this.disposed || typeof this.session?.watchIncoming !== 'function' ||
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
            this.readTracker = this.session.watchIncoming(options);
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
