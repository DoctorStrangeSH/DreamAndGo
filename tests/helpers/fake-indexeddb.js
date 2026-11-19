// Minimal deterministic IndexedDB test double for the adapter contract.
// It models asynchronous requests and transaction completion, not browser storage internals.
class FakeRequest {
    constructor() {
        this.result = undefined;
        this.error = null;
        this.onsuccess = null;
        this.onerror = null;
        this.onupgradeneeded = null;
    }
}

class FakeObjectStore {
    constructor(transaction, name) {
        this.transaction = transaction;
        this.name = name;
    }

    get(key) {
        return this.transaction.enqueue(() => this.transaction.database.stores.get(this.name).get(key));
    }

    put(value) {
        return this.transaction.enqueue(() => {
            const store = this.transaction.database.stores.get(this.name);
            store.set(value.userId, value);
            return value.userId;
        });
    }

    delete(key) {
        return this.transaction.enqueue(() => {
            this.transaction.database.stores.get(this.name).delete(key);
            return undefined;
        });
    }
}

class FakeTransaction {
    constructor(database, storeNames) {
        this.database = database;
        this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
        this.pending = 0;
        this.finished = false;
        this.oncomplete = null;
        this.onerror = null;
        this.onabort = null;
    }

    objectStore(name) {
        if (!this.storeNames.includes(name)) throw new Error('Store is outside transaction');
        return new FakeObjectStore(this, name);
    }

    enqueue(operation) {
        const request = new FakeRequest();
        this.pending++;
        setImmediate(() => {
            try {
                request.result = operation();
                request.onsuccess?.();
            } catch (error) {
                request.error = error;
                request.onerror?.();
                this.onerror?.({ target: this });
            } finally {
                this.pending--;
                this.scheduleCompletion();
            }
        });
        return request;
    }

    scheduleCompletion() {
        if (this.pending !== 0 || this.finished) return;
        setImmediate(() => {
            if (this.pending !== 0 || this.finished) return;
            this.finished = true;
            this.oncomplete?.({ target: this });
        });
    }
}

class FakeDatabase {
    constructor(state) {
        this.state = state;
        this.stores = state.stores;
        this.objectStoreNames = {
            contains: name => this.stores.has(name)
        };
        this.onversionchange = null;
    }

    createObjectStore(name) {
        if (!this.stores.has(name)) this.stores.set(name, new Map());
        return new FakeObjectStore(new FakeTransaction(this, name), name);
    }

    transaction(names) {
        for (const name of (Array.isArray(names) ? names : [names])) {
            if (!this.stores.has(name)) throw new Error('Unknown object store: ' + name);
        }
        return new FakeTransaction(this, names);
    }

    close() {}
}

export class FakeIndexedDB {
    constructor() {
        this.databases = new Map();
    }

    open(name) {
        const request = new FakeRequest();
        setImmediate(() => {
            let state = this.databases.get(name);
            const isNew = !state;
            if (!state) {
                state = { stores: new Map() };
                this.databases.set(name, state);
            }
            request.result = new FakeDatabase(state);
            if (isNew) request.onupgradeneeded?.({ target: request });
            request.onsuccess?.({ target: request });
        });
        return request;
    }

    deleteDatabase(name) {
        const request = new FakeRequest();
        setImmediate(() => {
            this.databases.delete(name);
            request.onsuccess?.({ target: request });
        });
        return request;
    }
}
