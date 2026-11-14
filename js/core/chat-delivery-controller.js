import { ChatOutbox } from './chat-outbox.js';

// Candidate v2 view model. No persistence, no legacy transport integration.
// Statuses are driven by transport results, never timers or local unread counters.
export class ChatDeliveryController {
    constructor(send, lookup, senderId, createId, onChange = () => {}) {
        if (typeof lookup !== 'function' || typeof onChange !== 'function' ||
            typeof senderId !== 'string' || !senderId) {
            throw new TypeError('Status lookup and change listener are required');
        }
        this.outbox = new ChatOutbox(send, createId);
        this.lookup = lookup;
        this.senderId = senderId;
        this.onChange = onChange;
        this.messages = new Map();
        this.receiptChecks = new Map();
        this.generation = 0;
    }

    prepare(chatId, text) {
        const intent = this.outbox.prepare(chatId, text);
        this._set(intent.clientMessageId, { senderId: this.senderId, ...intent, deliveryStatus: 'sending', messageId: null });
        return intent;
    }

    // An intent explicitly recovered by the caller must be checked before retrying.
    restore(chatId, text, clientMessageId) {
        const intent = this.outbox.restore(chatId, text, clientMessageId);
        if (!this.messages.has(intent.clientMessageId)) {
            this._set(intent.clientMessageId, { senderId: this.senderId, ...intent, deliveryStatus: 'checking', messageId: null });
        }
        return intent;
    }

    get(clientMessageId) {
        return this.messages.get(clientMessageId) || null;
    }

    async send(clientMessageId) {
        const intent = this.outbox.get(clientMessageId);
        if (!intent) return { success: false, error: 'Сообщение отсутствует в очереди' };
        const generation = this.generation;
        this._status(clientMessageId, 'sending');
        const result = await this.outbox.deliver(clientMessageId);
        if (generation !== this.generation) return { success: false, error: 'Сессия изменилась' };
        if (result.success) {
            this._status(clientMessageId, 'sent', result.messageId);
        } else {
            // A network error or lost acknowledgement is ambiguous: verify server state.
            this._status(clientMessageId, result.retryable ? 'checking' : 'failed');
        }
        return result;
    }

    async reconcile(clientMessageId) {
        if (!this.outbox.get(clientMessageId)) return { status: 'absent' };
        const generation = this.generation;
        this._status(clientMessageId, 'checking');
        const result = await this.outbox.reconcile(clientMessageId, this.lookup);
        if (generation !== this.generation) return { status: 'stale' };
        if (result.status === 'sent') this._status(clientMessageId, 'sent', result.messageId);
        // Missing means only "not present at read time": it is safe to offer a manual
        // idempotent retry with the same immutable intent, never send automatically.
        else if (result.status === 'missing') this._status(clientMessageId, 'failed');
        else if (result.status === 'unknown') this._status(clientMessageId, 'checking');
        return result;
    }

    // Poll the authenticated sender-only v2 status endpoint for an authoritative receipt.
    // A missing, malformed, stale or offline response can never invent a read marker.
    refreshRead(clientMessageId) {
        const current = this.messages.get(clientMessageId);
        if (!current || !['sent', 'read'].includes(current.deliveryStatus) || !current.messageId) {
            return Promise.resolve({ status: 'absent' });
        }
        if (current.deliveryStatus === 'read') return Promise.resolve({ status: 'read' });
        const existing = this.receiptChecks.get(clientMessageId);
        if (existing) return existing;
        const generation = this.generation;
        const task = Promise.resolve().then(() => this.lookup({
            chatId: current.chatId,
            clientMessageId: current.clientMessageId
        })).then(result => {
            if (generation !== this.generation || this.messages.get(clientMessageId) !== current) {
                return { status: 'stale' };
            }
            if (result?.status === 'sent' && result.messageId === current.messageId &&
                result.read === true) {
                this.acknowledgeRead(clientMessageId, current.messageId);
                return { status: 'read' };
            }
            return { status: 'unconfirmed' };
        }).catch(() => ({ status: 'unknown' })).finally(() => {
            if (this.receiptChecks.get(clientMessageId) === task) this.receiptChecks.delete(clientMessageId);
        });
        this.receiptChecks.set(clientMessageId, task);
        return task;
    }

    // Only an authoritative per-message server receipt may call this method.
    acknowledgeRead(clientMessageId, serverMessageId) {
        const current = this.messages.get(clientMessageId);
        if (!current || current.deliveryStatus !== 'sent' || !serverMessageId ||
            current.messageId !== serverMessageId) return false;
        this._status(clientMessageId, 'read', serverMessageId);
        return true;
    }

    discard(clientMessageId) {
        if (!this.outbox.discard(clientMessageId)) return false;
        this.messages.delete(clientMessageId);
        this.receiptChecks.delete(clientMessageId);
        this.onChange(null, clientMessageId);
        return true;
    }

    clear() {
        this.generation++;
        this.outbox.clear();
        this.messages.clear();
        this.receiptChecks.clear();
        this.onChange(null, null);
    }

    _status(id, deliveryStatus, messageId = undefined) {
        const current = this.messages.get(id);
        if (!current) return;
        this._set(id, {
            ...current,
            deliveryStatus,
            messageId: messageId === undefined ? current.messageId : messageId
        });
    }

    _set(id, message) {
        const snapshot = Object.freeze(message);
        this.messages.set(id, snapshot);
        this.onChange(snapshot, id);
    }
}
