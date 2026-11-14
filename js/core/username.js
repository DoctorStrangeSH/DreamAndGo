/** One canonical username key for indexed queries; display casing is retained separately. */
export function normalizeUsername(value) {
    return String(value ?? '').trim().toLowerCase();
}

export function isValidUsername(value) {
    return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value));
}
