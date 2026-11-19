/**
 * Only allow web image sources in user-controlled profile data.
 * Empty/unsupported URLs fall back to the initial avatar.
 */
export function safeAvatarURL(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return '';
        if (url.username || url.password) return '';
        return url.href;
    } catch {
        return '';
    }
}
