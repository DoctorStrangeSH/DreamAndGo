/** Tracks asynchronous subscription generations to discard stale callbacks. */
export class SubscriptionVersions {
    constructor() {
        this.versions = new Map();
    }

    invalidate(key) {
        const next = (this.versions.get(key) || 0) + 1;
        this.versions.set(key, next);
        return next;
    }

    current(key) {
        return this.versions.get(key) || 0;
    }

    isCurrent(key, token) {
        return this.current(key) === token;
    }
}
