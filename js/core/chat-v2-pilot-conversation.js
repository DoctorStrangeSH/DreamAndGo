import { ChatV2HistoryController } from './chat-v2-history-controller.js';
import { ChatV2PilotView } from './chat-v2-pilot-view.js';

// Candidate-only composer. The injected lookup must call an authenticated v2
// history endpoint; this class does not access legacy Firestore collections.
export class ChatV2PilotConversation {
    constructor({ root, session, chatId, title, lookup, viewFactory, limit = 30 }) {
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
    }

    async mount() {
        if (this.disposed) throw new Error('Диалог закрыт');
        this.view.mount();
        return this.history.open(this.chatId);
    }

    refreshLatest() {
        if (this.disposed) return Promise.resolve({ status: 'stale' });
        // Re-open at the newest page after a confirmed send. The history
        // controller invalidates any previous in-flight older-page request.
        return this.history.open(this.chatId);
    }

    loadOlder() {
        if (this.disposed) return Promise.resolve({ status: 'stale' });
        return this.history.loadOlder();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.history.clear();
        this.view.destroy();
    }
}
