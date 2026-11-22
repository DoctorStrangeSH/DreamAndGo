// A single canonical key is used for case-insensitive username comparisons.
export function normalizeUsername(value) {
    return String(value ?? '').trim().toLowerCase();
}

export function isValidUsername(value) {
    return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value));
}
