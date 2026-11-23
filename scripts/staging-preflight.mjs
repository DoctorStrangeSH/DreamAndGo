import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLAG_NAMES = Object.freeze([
    'firebase-functions-backend-ready',
    'chat-v2-enabled',
    'signup-v2-enabled',
    'signup-v2-backend-ready',
    'signup-v2-legacy-migration-verified'
]);

function validateStagingConfig(config) {
    const errors = [];
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return { valid: false, errors: ['Ожидается объект staging-конфигурации.'] };
    }
    const web = config.firebaseConfig;
    if (!web || typeof web !== 'object' || Array.isArray(web)) {
        return { valid: false, errors: ['Необходим объект firebaseConfig.'] };
    }

    const projectId = web.projectId;
    if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
        errors.push('Некорректный Firebase projectId.');
    } else if (projectId === 'dream-and-go' || projectId.startsWith('demo-') ||
        !/(?:^|-)staging(?:-|$)/.test(projectId)) {
        errors.push('Нужен отдельный реальный staging-проект (не production или demo).');
    }

    if (typeof web.authDomain !== 'string' ||
        web.authDomain !== `${projectId}.firebaseapp.com`) {
        errors.push('authDomain должен принадлежать staging-проекту.');
    }
    if (typeof web.apiKey !== 'string' || !/^AIza[A-Za-z0-9_-]{20,}$/.test(web.apiKey)) {
        errors.push('Не указан корректный публичный Firebase web apiKey.');
    }
    if (typeof web.appId !== 'string' ||
        !/^1:[0-9]+:web:[A-Za-z0-9]+$/.test(web.appId)) {
        errors.push('Не указан корректный web appId.');
    }
    if (typeof web.messagingSenderId !== 'string' || !/^[0-9]+$/.test(web.messagingSenderId)) {
        errors.push('Некорректный messagingSenderId.');
    }
    if (typeof web.storageBucket === 'string' &&
        (web.storageBucket === 'dream-and-go.firebasestorage.app' ||
         web.storageBucket === 'dream-and-go.appspot.com')) {
        errors.push('storageBucket указывает на production.');
    }
    if (typeof web.databaseURL === 'string') {
        let host = '';
        try {
            const url = new URL(web.databaseURL);
            host = url.hostname.toLowerCase();
            if (url.protocol !== 'https:') errors.push('databaseURL должен использовать HTTPS.');
        } catch {
            errors.push('Некорректный databaseURL.');
        }
        if (/^dream-and-go(?:-default-rtdb)?(?:\\.[a-z0-9-]+)?\\.(?:firebaseio\\.com|firebasedatabase\\.app)$/.test(host)) {
            errors.push('databaseURL указывает на production.');
        }
    }
    if (typeof config.appCheckSiteKey !== 'string' ||
        !/^[A-Za-z0-9_-]{20,128}$/.test(config.appCheckSiteKey)) {
        errors.push('Не указан App Check reCAPTCHA site key.');
    }

    const flags = config.rolloutFlags;
    if (!flags || typeof flags !== 'object' || Array.isArray(flags) ||
        FLAG_NAMES.some(name => flags[name] !== false)) {
        errors.push('Все rolloutFlags должны быть явно равны false до приёмки.');
    }

    return { valid: errors.length === 0, errors };
}

async function main(configPath) {
    if (!configPath) {
        console.error('Использование: node scripts/staging-preflight.mjs <путь-к-staging-config.local.json>');
        process.exitCode = 1;
        return;
    }
    try {
        const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
        const result = validateStagingConfig(config);
        if (!result.valid) {
            for (const error of result.errors) console.error(`FAIL: ${error}`);
            process.exitCode = 1;
            return;
        }
        console.log('PASS: локальная staging-конфигурация прошла статическую проверку.');
        console.log('Важно: Firebase, App Check, Functions и пользовательские сценарии НЕ проверялись по сети.');
    } catch {
        console.error('FAIL: не удалось прочитать или разобрать staging-конфигурацию.');
        process.exitCode = 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main(process.argv[2]);
}

export { validateStagingConfig, FLAG_NAMES };
