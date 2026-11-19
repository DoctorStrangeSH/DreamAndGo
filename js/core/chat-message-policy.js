export const MAX_CHAT_MESSAGE_LENGTH = 2000;

export function isValidChatUid(value) {
    return typeof value === 'string' && value.length > 0 &&
        value.length <= 128 && value.trim() === value && !value.includes('/');
}

export function validateChatMessage(text) {
    if (typeof text !== 'string') return { valid: false, error: 'Некорректный текст сообщения' };
    const normalized = text.trim();
    if (!normalized) return { valid: false, error: 'Сообщение не может быть пустым' };
    if (normalized.length > MAX_CHAT_MESSAGE_LENGTH) {
        return { valid: false, error: 'Сообщение слишком длинное (максимум 2000 символов)' };
    }
    return { valid: true, text: normalized };
}

export function validChatParticipants(currentUserId, senderId, receiverId, chatId, getChatId) {
    return isValidChatUid(currentUserId) &&
        currentUserId === senderId &&
        isValidChatUid(senderId) &&
        isValidChatUid(receiverId) &&
        receiverId !== senderId &&
        typeof chatId === 'string' && chatId.length <= 257 &&
        chatId === getChatId(senderId, receiverId);
}
