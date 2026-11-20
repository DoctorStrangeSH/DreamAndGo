export function isAuthenticatedOwner(requestedUid, authenticatedUid) {
    return typeof requestedUid === 'string' && requestedUid.length > 0 &&
        typeof authenticatedUid === 'string' && authenticatedUid === requestedUid;
}

export function isValidFirestoreDocumentId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 1500 &&
        value !== '.' && value !== '..' && !value.includes('/') && value.trim() === value;
}
