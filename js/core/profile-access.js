const PROFILE_COLLECTIONS = Object.freeze({
    owner: 'users',
    public: 'publicProfiles'
});

/**
 * Private account documents are readable only by their owner.
 * Visitors must resolve a separate, server-generated public projection.
 */
export function getProfileCollection(userId, currentUserId) {
    if (typeof userId !== 'string' || !userId || userId.length > 128 || userId.includes('/')) {
        return null;
    }
    return userId === currentUserId
        ? PROFILE_COLLECTIONS.owner
        : PROFILE_COLLECTIONS.public;
}
