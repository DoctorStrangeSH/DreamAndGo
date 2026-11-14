/** Prevent a slow async snapshot transform from overwriting a newer result. */
export class SnapshotGate {
    constructor() { this.sequence = 0; }
    begin() { return ++this.sequence; }
    isLatest(sequence) { return sequence === this.sequence; }
}
