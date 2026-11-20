export function isValidFriendPair(userId, friendId) {
    const isValidUid = value => typeof value === 'string' && value.length > 0 &&
        value.length <= 128 && value.trim() === value && !value.includes('/');
    return isValidUid(userId) && isValidUid(friendId) && userId !== friendId;
}

export function isCurrentFriendActor(userId, authenticatedUid) {
    return typeof userId === 'string' && userId.length > 0 &&
        typeof authenticatedUid === 'string' && authenticatedUid === userId;
}
