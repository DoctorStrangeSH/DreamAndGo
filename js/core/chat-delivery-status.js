// Candidate v2 delivery presentation. Never infer "read" from chat-level unread counters.
// Legacy messages have no authoritative deliveryStatus and render without a badge.
const STATES = Object.freeze({
    sending: Object.freeze({ label: 'Отправляется', icon: 'bi-clock', tone: 'text-muted' }),
    checking: Object.freeze({ label: 'Проверяем доставку', icon: 'bi-arrow-repeat', tone: 'text-muted' }),
    sent: Object.freeze({ label: 'Отправлено', icon: 'bi-check', tone: 'text-muted' }),
    read: Object.freeze({ label: 'Прочитано', icon: 'bi-check-all', tone: 'text-primary' }),
    failed: Object.freeze({ label: 'Не удалось отправить', icon: 'bi-exclamation-circle', tone: 'text-danger' })
});

export function getMessageDeliveryDisplay(message, currentUserId) {
    if (!message || message.senderId !== currentUserId) return null;
    // The read status may only be supplied by an authoritative v2 receipt.
    return Object.hasOwn(STATES, message.deliveryStatus) ? STATES[message.deliveryStatus] : null;
}

export function renderMessageDeliveryIndicator(message, currentUserId) {
    const display = getMessageDeliveryDisplay(message, currentUserId);
    if (!display) return '';
    // All interpolated values come from a closed, internal allow-list.
    return `<small class="message-delivery ${display.tone}" role="status" aria-label="${display.label}" title="${display.label}"><i class="bi ${display.icon}" aria-hidden="true"></i><span class="visually-hidden">${display.label}</span></small>`;
}
