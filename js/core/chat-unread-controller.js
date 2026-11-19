// Candidate v2 view model; caller supplies an authenticated getPrivateChatUnreadV2
// transport. No local storage and no integration with the legacy chat UI.
export class ChatUnreadController {
    constructor(lookup, onChange = () => {}) {
        if (typeof lookup !== 'function' || typeof onChange !== 'function') {
            throw new TypeError('Unread lookup and change listener are required');
        }
        this.lookup = lookup;
        this.onChange = onChange;
        this.entries = new Map();
        this.inFlight = new Map();
        this.generation = 0;
    }

    get(chatId) {
        return this.entries.get(chatId) || null;
    }

    refresh(chatId) {
        if (typeof chatId !== 'string' || !chatId || chatId.length > 128 || chatId.includes('/')) {
            throw new TypeError('Некорректный диалог');
        }
        const active = this.inFlight.get(chatId);
        if (active) return active;
        const generation = this.generation;
        const checking = this._set(chatId, { status: 'checking', unread: null });
        const task = Promise.resolve().then(() => this.lookup({ chatId }))
            .then(result => {
                if (generation !== this.generation || this.entries.get(chatId) !== checking) {
                    return { status: 'stale' };
                }
                if (result?.chatId !== chatId || !Number.isSafeInteger(result.unread) || result.unread < 0) {
                    this._set(chatId, { status: 'unknown', unread: null });
                    return { status: 'unknown' };
                }
                this._set(chatId, { status: 'ready', unread: result.unread });
                return { status: 'ready', unread: result.unread };
            })
            .catch(() => {
                if (generation !== this.generation || this.entries.get(chatId) !== checking) {
                    return { status: 'stale' };
                }
                this._set(chatId, { status: 'unknown', unread: null });
                return { status: 'unknown' };
            })
            .finally(() => {
                if (this.inFlight.get(chatId) === task) this.inFlight.delete(chatId);
            });
        this.inFlight.set(chatId, task);
        return task;
    }

    remove(chatId) {
        this.entries.delete(chatId);
        this.inFlight.delete(chatId);
        this.onChange(null, chatId);
    }

    clear() {
        // All in-flight responses from the previous account become invalid.
        this.generation++;
        this.entries.clear();
        this.inFlight.clear();
        this.onChange(null, null);
    }

    _set(chatId, state) {
        const snapshot = Object.freeze({ chatId, ...state });
        this.entries.set(chatId, snapshot);
        this.onChange(snapshot, chatId);
        return snapshot;
    }
}
