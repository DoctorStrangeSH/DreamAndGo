// Candidate v2 history page state; transport is injected and must be backed by
// an authenticated, membership-checked server endpoint. No Firestore direct reads.
const validChatId = id => typeof id === 'string' && id.length > 0 &&
    id.length <= 128 && !id.includes('/');
const validMessageId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
const validSequence = n => Number.isSafeInteger(n) && n > 0;

function normalizePage(reply, chatId, beforeSequence, limit) {
    if (!reply || reply.chatId !== chatId || !Array.isArray(reply.messages) ||
        reply.messages.length > limit || typeof reply.hasMore !== 'boolean') {
        throw new Error('Некорректная страница истории');
    }
    const seen = new Set();
    let previous = beforeSequence ?? Number.MAX_SAFE_INTEGER;
    const messages = reply.messages.map(message => {
        if (!message || !validMessageId(message.id) || !validSequence(message.sequence) ||
            message.sequence >= previous || seen.has(message.id) ||
            typeof message.senderId !== 'string' || !message.senderId ||
            typeof message.text !== 'string' || message.text.length > 2000 ||
            typeof message.read !== 'boolean') {
            throw new Error('Некорректная страница истории');
        }
        previous = message.sequence;
        seen.add(message.id);
        return Object.freeze({
            id: message.id, sequence: message.sequence, senderId: message.senderId,
            text: message.text, read: message.read
        });
    });
    if (reply.hasMore && messages.length === 0) {
        throw new Error('Некорректный курсор истории');
    }
    const expectedCursor = reply.hasMore ? messages.at(-1).sequence : null;
    if (reply.nextBeforeSequence !== expectedCursor) {
        throw new Error('Некорректный курсор истории');
    }
    return { messages, hasMore: reply.hasMore, nextBeforeSequence: expectedCursor };
}

export class ChatV2HistoryController {
    constructor(lookup, onChange = () => {}, limit = 30) {
        if (typeof lookup !== 'function' || typeof onChange !== 'function' ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
            throw new TypeError('Некорректная конфигурация истории');
        }
        this.lookup = lookup;
        this.onChange = onChange;
        this.limit = limit;
        this.generation = 0;
        this.chatId = null;
        this.messages = [];
        this.cursor = null;
        this.hasMore = true;
        this.status = 'idle';
        this.inFlight = null;
    }

    snapshot() {
        return Object.freeze({
            chatId: this.chatId, status: this.status, hasMore: this.hasMore,
            messages: Object.freeze([...this.messages].reverse())
        });
    }

    async open(chatId) {
        if (!validChatId(chatId)) throw new TypeError('Некорректный диалог');
        this.clear();
        this.chatId = chatId;
        return this.loadOlder();
    }

    loadOlder() {
        if (!this.chatId || !this.hasMore) return Promise.resolve(this.snapshot());
        if (this.inFlight) return this.inFlight;
        const generation = this.generation, chatId = this.chatId;
        const beforeSequence = this.cursor;
        this.status = 'loading';
        this.onChange(this.snapshot());
        const task = Promise.resolve().then(() => this.lookup({
            chatId, beforeSequence, limit: this.limit
        })).then(reply => {
            if (generation !== this.generation) return { status: 'stale' };
            const page = normalizePage(reply, chatId, beforeSequence, this.limit);
            const existing = new Set(this.messages.map(item => item.id));
            if (page.messages.some(item => existing.has(item.id))) {
                throw new Error('Повторяющиеся сообщения в истории');
            }
            this.messages.push(...page.messages);
            this.cursor = page.nextBeforeSequence;
            this.hasMore = page.hasMore;
            this.status = 'ready';
            this.onChange(this.snapshot());
            return this.snapshot();
        }).catch(() => {
            if (generation !== this.generation) return { status: 'stale' };
            this.status = 'error';
            this.onChange(this.snapshot());
            return this.snapshot();
        }).finally(() => {
            if (this.inFlight === task) this.inFlight = null;
        });
        this.inFlight = task;
        return task;
    }

    // Refresh only the newest page. Identical pages leave DOM and scroll alone.
    // Longer paginated histories stay intact until the user explicitly reopens.
    refreshLatest() {
        if (!this.chatId) return Promise.resolve(this.snapshot());
        if (this.messages.length > this.limit) return Promise.resolve(this.snapshot());
        if (this.inFlight) return this.inFlight;
        const generation = this.generation, chatId = this.chatId;
        const task = Promise.resolve().then(() => this.lookup({
            chatId, beforeSequence: null, limit: this.limit
        })).then(reply => {
            if (generation !== this.generation) return { status: 'stale' };
            const page = normalizePage(reply, chatId, null, this.limit);
            const unchanged = this.messages.length === page.messages.length &&
                this.messages.every((item, index) => {
                    const next = page.messages[index];
                    return item.id === next.id && item.sequence === next.sequence &&
                        item.senderId === next.senderId && item.text === next.text &&
                        item.read === next.read;
                }) && this.hasMore === page.hasMore && this.cursor === page.nextBeforeSequence;
            if (!unchanged) {
                this.messages = page.messages;
                this.cursor = page.nextBeforeSequence;
                this.hasMore = page.hasMore;
                this.status = 'ready';
                this.onChange(this.snapshot());
            }
            return this.snapshot();
        }).catch(() => {
            // Keep already displayed messages and allow a later retry.
            return generation === this.generation ? this.snapshot() : { status: 'stale' };
        }).finally(() => {
            if (this.inFlight === task) this.inFlight = null;
        });
        this.inFlight = task;
        return task;
    }

    clear() {
        this.generation++;
        this.chatId = null;
        this.messages = [];
        this.cursor = null;
        this.hasMore = true;
        this.status = 'idle';
        this.inFlight = null;
        this.onChange(this.snapshot());
    }
}
