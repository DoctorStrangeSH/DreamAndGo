// Candidate v2 lifecycle hook. The caller owns the authenticated transport and
// the set of visible/known chat IDs. Never reads legacy messages or stores data.
export class ChatUnreadRefreshCoordinator {
    constructor(controller, getChatIds, windowObject, documentObject, {
        minIntervalMs = 5000, now = Date.now
    } = {}) {
        if (!controller || typeof controller.refresh !== 'function' || typeof controller.clear !== 'function' ||
            typeof getChatIds !== 'function' || typeof windowObject?.addEventListener !== 'function' ||
            typeof windowObject?.removeEventListener !== 'function' ||
            typeof documentObject?.addEventListener !== 'function' ||
            typeof documentObject?.removeEventListener !== 'function' ||
            typeof now !== 'function' || !Number.isSafeInteger(minIntervalMs) || minIntervalMs < 0) {
            throw new TypeError('Невозможно настроить обновление непрочитанных');
        }
        this.controller = controller;
        this.getChatIds = getChatIds;
        this.windowObject = windowObject;
        this.documentObject = documentObject;
        this.now = now;
        this.minIntervalMs = minIntervalMs;
        this.started = false;
        this.lastRequestAt = -Infinity;
        this.pending = null;
        this.onOnline = () => { void this.refreshNow(); };
        this.onVisibility = () => { if (this.documentObject.visibilityState === 'visible') void this.refreshNow(); };
    }

    start() {
        if (this.started) return this.pending || Promise.resolve({ status: 'already-started' });
        this.started = true;
        this.windowObject.addEventListener('online', this.onOnline);
        this.documentObject.addEventListener('visibilitychange', this.onVisibility);
        return this.refreshNow();
    }

    refreshNow() {
        if (!this.started || this.documentObject.visibilityState !== 'visible' ||
            this.windowObject.navigator?.onLine === false) {
            return Promise.resolve({ status: 'paused' });
        }
        if (this.pending) return this.pending;
        const instant = this.now();
        if (!Number.isFinite(instant) || instant - this.lastRequestAt < this.minIntervalMs) {
            return Promise.resolve({ status: 'throttled' });
        }
        let chatIds;
        try {
            const ids = this.getChatIds();
            if (!Array.isArray(ids)) return Promise.resolve({ status: 'invalid-source' });
            chatIds = [...new Set(ids)];
            if (chatIds.some(id => typeof id !== 'string' || !id || id.length > 128 || id.includes('/'))) {
                return Promise.resolve({ status: 'invalid-source' });
            }
        } catch {
            return Promise.resolve({ status: 'invalid-source' });
        }
        this.lastRequestAt = instant;
        const task = Promise.allSettled(chatIds.map(id => this.controller.refresh(id)))
            .then(() => ({ status: 'checked', chats: chatIds.length }))
            .finally(() => { if (this.pending === task) this.pending = null; });
        this.pending = task;
        return task;
    }

    stop() {
        if (!this.started) return;
        this.started = false;
        this.windowObject.removeEventListener('online', this.onOnline);
        this.documentObject.removeEventListener('visibilitychange', this.onVisibility);
        this.pending = null;
        this.lastRequestAt = -Infinity;
        // Crucial: invalidate replies from an account that may have logged out.
        this.controller.clear();
    }
}
