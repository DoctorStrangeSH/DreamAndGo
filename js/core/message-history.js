// Shared in-memory view of the live message tail and paged older messages.
export class MessageHistory {
    constructor() {
        this.items = new Map();
    }

    merge(messages = []) {
        for (const message of messages) {
            if (message?.id) this.items.set(message.id, message);
        }
    }

    change(id, patch) {
        if (!this.items.has(id)) return false;
        if (patch === null) this.items.delete(id);
        else this.items.set(id, { ...this.items.get(id), ...patch });
        return true;
    }

    get size() {
        return this.items.size;
    }

    ordered() {
        return [...this.items.values()].sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
            String(a.id).localeCompare(String(b.id)));
    }
}
