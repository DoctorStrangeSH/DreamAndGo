// Candidate v2 only. Viewport visibility is a prerequisite, not proof of human reading.
// The caller must supply a trusted authenticated receipt transport.
export class ChatReadVisibilityTracker {
    constructor({ root, currentUserId, markRead, isActive,
        documentRef = globalThis.document,
        observerFactory = callback => new IntersectionObserver(callback, { root, threshold: 0.75 })
    }) {
        if (!root || !documentRef || typeof currentUserId !== 'string' || !currentUserId ||
            typeof markRead !== 'function' || typeof isActive !== 'function' ||
            typeof observerFactory !== 'function') {
            throw new TypeError('Invalid read visibility tracker configuration');
        }
        this.root = root;
        this.currentUserId = currentUserId;
        this.documentRef = documentRef;
        this.markRead = markRead;
        this.isActive = isActive;
        this.records = new Map();
        this.inFlight = new Set();
        this.generation = 0;
        this.stopped = false;
        this.observer = observerFactory(entries => this._onIntersection(entries));
        this._onVisibility = () => this._flush();
        documentRef.addEventListener('visibilitychange', this._onVisibility);
    }

    observe(element, message) {
        if (this.stopped || !element || !message ||
            message.senderId === this.currentUserId ||
            typeof message.id !== 'string' || !/^[a-f0-9]{64}$/.test(message.id) ||
            message.read === true || !this.root.contains(element)) return false;
        const old = this.records.get(element);
        if (old) this.observer.unobserve(element);
        this.records.set(element, { messageId: message.id, visible: false, confirmed: false });
        this.observer.observe(element);
        return true;
    }

    unobserve(element) {
        if (!this.records.has(element)) return;
        this.observer.unobserve(element);
        this.records.delete(element);
    }

    _onIntersection(entries) {
        if (this.stopped) return;
        for (const entry of entries) {
            const record = this.records.get(entry.target);
            if (!record) continue;
            record.visible = Boolean(entry.isIntersecting && entry.intersectionRatio >= 0.75);
        }
        this._flush();
    }

    _flush() {
        if (this.stopped || this.documentRef.visibilityState !== 'visible' || !this.isActive()) return;
        for (const [element, record] of this.records) {
            if (!record.visible || record.confirmed || this.inFlight.has(record.messageId) ||
                !element.isConnected || !this.root.contains(element)) continue;
            this.inFlight.add(record.messageId);
            const generation = this.generation;
            const id = record.messageId;
            Promise.resolve().then(() => {
                // Recheck when the queued microtask actually starts.
                if (this.stopped || generation !== this.generation ||
                    !record.visible || !element.isConnected || !this.root.contains(element) ||
                    this.documentRef.visibilityState !== 'visible' || !this.isActive()) return null;
                return this.markRead(id);
            }).then(result => {
                if (this.stopped || generation !== this.generation) return;
                if (result?.status === 'read' && result.messageId === id) {
                    // The same message can be represented by more than one element.
                    for (const other of this.records.values()) {
                        if (other.messageId === id) other.confirmed = true;
                    }
                }
            }).catch(() => {
                // A failed network acknowledgement is ambiguous. Never invent a receipt;
                // a later visibility event can safely retry the idempotent callable.
            }).finally(() => {
                if (generation === this.generation) this.inFlight.delete(id);
            });
        }
    }

    stop() {
        if (this.stopped) return;
        this.stopped = true;
        this.generation++;
        this.observer.disconnect();
        this.documentRef.removeEventListener('visibilitychange', this._onVisibility);
        this.records.clear();
        this.inFlight.clear();
    }
}
