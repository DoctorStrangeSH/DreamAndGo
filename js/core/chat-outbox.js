import { validateChatMessage } from './chat-message-policy.js';

// Prepared for the v2 callable API; intentionally not wired to the legacy chat.
// Pending messages remain in memory only and are never persisted as plaintext.
export class ChatOutbox {
    constructor(send, createId = () => globalThis.crypto.randomUUID()) {
        if (typeof send !== 'function' || typeof createId !== 'function') {
            throw new TypeError('Outbox requires a send transport and ID factory');
        }
        this.send = send;
        this.createId = createId;
        this.pending = new Map();
        this.inFlight = new Map();
        this.generation = 0;
    }

    prepare(chatId, text) {
        const validation = validateChatMessage(text);
        if (!validation.valid) throw new TypeError(validation.error);
        if (typeof chatId !== 'string' || !chatId || chatId.length > 128 || chatId.includes('/')) {
            throw new TypeError('Некорректный диалог');
        }
        const clientMessageId = this.createId();
        if (typeof clientMessageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)) {
            throw new TypeError('Некорректный идентификатор отправки');
        }
        const key = clientMessageId.toLowerCase();
        if (this.pending.has(key)) throw new Error('Повторный идентификатор отправки');
        const entry = Object.freeze({ chatId, text: validation.text, clientMessageId: key });
        this.pending.set(key, entry);
        return entry;
    }

    get(clientMessageId) {
        return this.pending.get(clientMessageId) || null;
    }

    // Retrying deliberately reuses the immutable intent, including the UUID.
    deliver(clientMessageId) {
        const pending = this.pending.get(clientMessageId);
        if (!pending) return Promise.resolve({ success: false, error: 'Сообщение отсутствует в очереди' });
        const existing = this.inFlight.get(clientMessageId);
        if (existing) return existing;
        const generation = this.generation;
        const task = (async () => {
            try {
                const result = await this.send(pending);
                if (generation !== this.generation) return { success: false, error: 'Сессия изменилась' };
                if (!result || typeof result.messageId !== 'string' || !result.messageId) {
                    return { success: false, error: 'Нет подтверждения отправки' };
                }
                this.pending.delete(clientMessageId);
                return { success: true, messageId: result.messageId };
            } catch (error) {
                return { success: false, error: error?.code || 'Ошибка сети', retryable: true };
            } finally {
                if (this.inFlight.get(clientMessageId) === task) this.inFlight.delete(clientMessageId);
            }
        })();
        this.inFlight.set(clientMessageId, task);
        return task;
    }

    discard(clientMessageId) {
        if (this.inFlight.has(clientMessageId)) return false;
        return this.pending.delete(clientMessageId);
    }

    clear() {
        // On logout, no result from an earlier session can affect the new queue.
        this.generation += 1;
        this.pending.clear();
        this.inFlight.clear();
    }
}
