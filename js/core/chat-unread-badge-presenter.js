import { renderChatUnreadBadge } from './chat-unread-badge.js';

// Candidate v2 presenter. resolveSlot returns a dedicated badge container for
// a chat; it must never return a whole chat card or other user-owned content.
// No global selectors, no use of untrusted IDs as CSS selectors.
export class ChatUnreadBadgePresenter {
    constructor(resolveSlot) {
        if (typeof resolveSlot !== 'function') {
            throw new TypeError('Требуется функция поиска контейнера бейджа');
        }
        this.resolveSlot = resolveSlot;
        this.slots = new Map();
    }

    // Intended as ChatUnreadController's onChange callback.
    onChange(state, chatId) {
        if (chatId === null) {
            this.clear();
            return;
        }
        if (typeof chatId !== 'string' || !chatId) return;
        const previous = this.slots.get(chatId);
        if (!state) {
            if (previous) previous.innerHTML = '';
            this.slots.delete(chatId);
            return;
        }
        if (state.chatId !== chatId) return;
        const slot = this.resolveSlot(chatId);
        if (!slot || typeof slot.innerHTML !== 'string') return;
        if (previous && previous !== slot) previous.innerHTML = '';
        // The renderer only emits closed, validated markup.
        slot.innerHTML = renderChatUnreadBadge(state);
        this.slots.set(chatId, slot);
    }

    clear() {
        for (const slot of this.slots.values()) slot.innerHTML = '';
        this.slots.clear();
    }
}
