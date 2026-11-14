export const MAX_CHAT_MESSAGE_LENGTH = 2000;

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
    return typeof currentUserId === 'string' && currentUserId.length > 0 &&
        currentUserId === senderId &&
        typeof receiverId === 'string' && receiverId.length > 0 &&
        receiverId !== senderId &&
        typeof chatId === 'string' && chatId === getChatId(senderId, receiverId);
}
