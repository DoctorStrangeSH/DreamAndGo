import { isValidChatPathSegment, isValidChatUid, validateChatMessage } from './chat-message-policy.js';

export const CHAT_PENDING_STORE_SCHEMA_VERSION = 1;
export const CHAT_PENDING_INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_INTENTS = 100;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Persistence boundary only. The injected adapter MUST provide authenticated
// encryption at rest, integrity protection, and per-user isolation. This module
// deliberately ships no localStorage/IndexedDB adapter and does not claim to
// encrypt data itself.
export class ChatPendingIntentStore {
    constructor({ adapter, getUserId, now = () => Date.now(), ttlMs = CHAT_PENDING_INTENT_TTL_MS }) {
        const security = adapter?.security;
        if (!adapter || typeof adapter.read !== 'function' || typeof adapter.write !== 'function' ||
            security?.encryptionAtRest !== true ||
            security?.integrityProtection !== true ||
            security?.accountIsolation !== true ||
            typeof getUserId !== 'function' || typeof now !== 'function' ||
            !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
            throw new TypeError('Требуется защищённое хранилище ожидающих сообщений');
        }
        this.adapter = adapter;
        this.getUserId = getUserId;
        this.userId = getUserId();
        this.now = now;
        this.ttlMs = ttlMs;
        this.mutations = Promise.resolve();
        if (!isValidChatUid(this.userId)) throw new Error('Требуется вход в аккаунт');
    }

    _enqueueMutation(operation) {
        const task = this.mutations.then(operation);
        this.mutations = task.catch(() => {});
        return task;
    }

    _assertOwner() {
        if (!isValidChatUid(this.getUserId()) || this.getUserId() !== this.userId) {
            throw new Error('Сессия изменилась');
        }
    }

    _normalize(record, now) {
        if (!record || typeof record !== 'object' || Array.isArray(record) ||
            record.schemaVersion !== CHAT_PENDING_STORE_SCHEMA_VERSION ||
            record.userId !== this.userId ||
            !isValidChatPathSegment(record.chatId, 512) ||
            typeof record.text !== 'string' ||
            !UUID_V4.test(record.clientMessageId || '') ||
            !Number.isSafeInteger(record.createdAt) ||
            record.createdAt > now || now - record.createdAt > this.ttlMs) return null;
        const validation = validateChatMessage(record.text);
        if (!validation.valid || validation.text !== record.text) return null;
        return Object.freeze({
            schemaVersion: CHAT_PENDING_STORE_SCHEMA_VERSION,
            userId: this.userId,
            chatId: record.chatId,
            text: record.text,
            clientMessageId: record.clientMessageId.toLowerCase(),
            createdAt: record.createdAt
        });
    }

    async load() {
        this._assertOwner();
        const raw = await this.adapter.read(this.userId);
        this._assertOwner();
        const now = this.now();
        const records = Array.isArray(raw) ? raw : [];
        const valid = [];
        const seen = new Set();
        for (const record of records) {
            const normalized = this._normalize(record, now);
            if (!normalized || seen.has(normalized.clientMessageId)) continue;
            seen.add(normalized.clientMessageId);
            valid.push(normalized);
            if (valid.length === MAX_PENDING_INTENTS) break;
        }
        const unchanged = Array.isArray(raw) && valid.length === raw.length &&
            valid.every((record, index) => {
                const original = raw[index];
                return original && original.schemaVersion === record.schemaVersion &&
                    original.userId === record.userId && original.chatId === record.chatId &&
                    original.text === record.text && original.clientMessageId === record.clientMessageId &&
                    original.createdAt === record.createdAt;
            });
        if (!unchanged) {
            await this.adapter.write(this.userId, valid);
            this._assertOwner();
        }
        return valid;
    }

    save(intent) {
        return this._enqueueMutation(async () => {
        this._assertOwner();
        const now = this.now();
        const record = this._normalize({
            schemaVersion: CHAT_PENDING_STORE_SCHEMA_VERSION,
            userId: this.userId,
            chatId: intent?.chatId,
            text: intent?.text,
            clientMessageId: intent?.clientMessageId,
            createdAt: now
        }, now);
        if (!record) throw new TypeError('Некорректное ожидающее сообщение');
        const current = await this.load();
        this._assertOwner();
        const existing = current.find(item => item.clientMessageId === record.clientMessageId);
        if (existing && (existing.chatId !== record.chatId || existing.text !== record.text)) {
            throw new Error('Идентификатор уже относится к другому сообщению');
        }
        const next = existing ? current : [...current, record];
        if (next.length > MAX_PENDING_INTENTS) throw new Error('Слишком много ожидающих сообщений');
        await this.adapter.write(this.userId, next);
        this._assertOwner();
        return existing || record;
        });
    }

    remove(clientMessageId) {
        return this._enqueueMutation(async () => {
        this._assertOwner();
        if (typeof clientMessageId !== 'string' || !UUID_V4.test(clientMessageId)) return false;
        const current = await this.load();
        this._assertOwner();
        const key = clientMessageId.toLowerCase();
        const next = current.filter(item => item.clientMessageId !== key);
        if (next.length === current.length) return false;
        await this.adapter.write(this.userId, next);
        this._assertOwner();
        return true;
        });
    }

    clear() {
        return this._enqueueMutation(async () => {
            this._assertOwner();
            await this.adapter.write(this.userId, []);
            this._assertOwner();
        });
    }
}
