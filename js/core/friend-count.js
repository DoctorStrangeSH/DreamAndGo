/** Count friend relationship documents, regardless of profile visibility. */
export function countFriendRecords(records) {
    if (!Array.isArray(records)) return 0;
    return records.filter(record => record && typeof record.id === 'string' && record.id !== '_init').length;
}
