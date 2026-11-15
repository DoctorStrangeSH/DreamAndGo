import { ChatV2HistoryController } from './chat-v2-history-controller.js';
import { ChatV2PilotView } from './chat-v2-pilot-view.js';
import { ChatV2ActiveRefresh } from './chat-v2-active-refresh.js';

// Candidate-only composer. The injected lookup must call an authenticated v2
// history endpoint; this class does not access legacy Firestore collections.
export class ChatV2PilotConversation {
    constructor({ root, session, chatId, title, lookup, viewFactory, limit = 30,
        isVisible, schedule, cancel, intervalMs = 10000 }) {
        const historyLookup = lookup ?? session?.loadHistory?.bind(session);
        if (typeof historyLookup !== 'function') throw new TypeError('Нужен транспорт истории');
        this.disposed = false;
        this.view = null;
        this.history = new ChatV2HistoryController(historyLookup, snapshot => {
            if (!this.disposed) this.view?.setHistoryState(snapshot);
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
        this.view.destroy();
    }
}
