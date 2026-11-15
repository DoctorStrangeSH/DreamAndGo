export function validateProfileSettings(raw, currentUsername) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new TypeError('Некорректные настройки профиля');
    }
    const allowed = ['username', 'displayName', 'bio', 'location'];
    if (Object.keys(raw).some(key => !allowed.includes(key))) {
        throw new TypeError('Недопустимые поля профиля');
    }
    const username = raw.username;
    if (typeof username !== 'string' || typeof currentUsername !== 'string' ||
        username !== currentUsername) {
        throw new TypeError('Смена никнейма временно недоступна до безопасного резервирования');
    }
    const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
    const bio = typeof raw.bio === 'string' ? raw.bio.trim() : null;
    const location = typeof raw.location === 'string' ? raw.location.trim() : null;
    if (!displayName || displayName.length > 80) {
        throw new TypeError('Имя: от 1 до 80 символов');
    }
    if (bio === null || bio.length > 500) {
        throw new TypeError('О себе: не более 500 символов');
    }
    if (location === null || location.length > 120) {
        throw new TypeError('Местоположение: не более 120 символов');
    }
    return { displayName, bio, location };
}
