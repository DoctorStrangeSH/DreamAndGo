// Candidate chat polling only: does not access Firestore or legacy listeners.
// The owner supplies a secure history refresh; all timers are cleared on stop.
export class ChatV2ActiveRefresh {
    constructor({ refresh, isVisible = () => true, intervalMs = 10000,
        schedule = setInterval, cancel = clearInterval }) {
        if (typeof refresh !== 'function' || typeof isVisible !== 'function' ||
            typeof schedule !== 'function' || typeof cancel !== 'function' ||
            !Number.isSafeInteger(intervalMs) || intervalMs < 5000) {
            throw new TypeError('Некорректная настройка обновления чата');
        }
        this.refresh = refresh;
        this.isVisible = isVisible;
        this.intervalMs = intervalMs;
        this.schedule = schedule;
        this.cancel = cancel;
        this.handle = null;
        this.running = false;
        this.busy = false;
        this.generation = 0;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.generation++;
        this.handle = this.schedule(() => { void this.tick(); }, this.intervalMs);
    }

    async tick() {
        if (!this.running || this.busy || !this.isVisible()) return;
        this.busy = true;
        const generation = this.generation;
        try {
            await this.refresh();
        } catch {
            // Offline or expired sessions are not retried in a hot loop.
            // The next scheduled tick may recover without sending anything.
        } finally {
            if (this.generation === generation) this.busy = false;
        }
    }

    stop() {
        this.running = false;
        this.generation++;
        if (this.handle !== null) this.cancel(this.handle);
        this.handle = null;
        this.busy = false;
    }
}
