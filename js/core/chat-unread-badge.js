// Candidate v2 unread presentation. Only server-confirmed counts become numbers.
// Closed templates prevent a response value from becoming arbitrary HTML.
export function getChatUnreadDisplay(state) {
    if (!state || typeof state !== 'object') return null;
    if (state.status === 'checking') {
        return Object.freeze({ kind: 'checking', label: 'Проверяем непрочитанные сообщения', text: '' });
    }
    if (state.status === 'unknown') {
        return Object.freeze({ kind: 'unknown', label: 'Не удалось проверить непрочитанные сообщения', text: '' });
    }
    if (state.status !== 'ready' || !Number.isSafeInteger(state.unread) || state.unread < 0) return null;
    if (state.unread === 0) return null;
    const n = state.unread;
    return Object.freeze({
        kind: 'count',
        label: `Непрочитанных сообщений: ${n}`,
        text: n > 99 ? '99+' : String(n)
    });
}

export function renderChatUnreadBadge(state) {
    const display = getChatUnreadDisplay(state);
    if (!display) return '';
    if (display.kind === 'checking') {
        return '<span class="chat-unread-badge chat-unread-badge--checking" role="status" aria-label="Проверяем непрочитанные сообщения"><i class="bi bi-arrow-repeat" aria-hidden="true"></i></span>';
    }
    if (display.kind === 'unknown') {
        return '<span class="chat-unread-badge chat-unread-badge--unknown" role="status" aria-label="Не удалось проверить непрочитанные сообщения" title="Проверка недоступна"><i class="bi bi-wifi-off" aria-hidden="true"></i></span>';
    }
    return `<span class="chat-unread-badge chat-unread-badge--count" role="status" aria-label="${display.label}" title="${display.label}">${display.text}</span>`;
}
