const CATEGORIES = new Set(['', 'Путешествия', 'Карьера', 'Творчество', 'Спорт', 'Отношения', 'Знания', 'Материальное', 'Другое']);
const STATUSES = new Set(['dreaming', 'in_progress', 'completed']);
const INPUT_KEYS = new Set(['title', 'category', 'status', 'description', 'progress', 'deadline', 'steps']);

function isValidDeadline(value) {
    if (value === null || value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateDreamInput(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new TypeError('Некорректные данные мечты');
    }
    if (Object.keys(raw).some(key => !INPUT_KEYS.has(key))) {
        throw new TypeError('Недопустимые поля мечты');
    }
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    const category = raw.category ?? '';
    const status = raw.status ?? 'dreaming';
    const progress = raw.progress ?? 0;
    const deadline = raw.deadline ?? null;
    const steps = raw.steps ?? [];
    if (!title || title.length > 120) throw new TypeError('Название мечты: 1–120 символов');
    if (description.length > 4000 || typeof raw.description !== 'string' && raw.description != null) {
        throw new TypeError('Описание мечты слишком длинное');
    }
    if (!CATEGORIES.has(category)) throw new TypeError('Неизвестная категория мечты');
    if (!STATUSES.has(status)) throw new TypeError('Неизвестный статус мечты');
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        throw new TypeError('Прогресс должен быть от 0 до 100');
    }
    if (!isValidDeadline(deadline)) throw new TypeError('Неверная дата срока');
    if (!Array.isArray(steps) || steps.length > 20 || steps.some(step =>
        !step || typeof step !== 'object' || Array.isArray(step) ||
        Object.keys(step).some(key => key !== 'text' && key !== 'done') ||
        typeof step.text !== 'string' || !step.text.trim() || step.text.trim().length > 200 ||
        typeof step.done !== 'boolean'
    )) throw new TypeError('Некорректные шаги мечты');
    return {
        title,
        category,
        status,
        description,
        progress,
        deadline,
        steps: steps.map(step => ({ text: step.text.trim(), done: step.done }))
    };
}
