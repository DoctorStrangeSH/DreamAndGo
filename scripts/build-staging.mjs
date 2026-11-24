import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_NAMES, validateStagingConfig } from './staging-preflight.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG = 'staging-config.local.json';
const OUTPUT_DIR = resolve(ROOT, 'dist', 'staging');

function escapeAttribute(value) {
    return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function escapeJsonForHtml(value) {
    return JSON.stringify(value)
        .replaceAll('<', '\\u003c')
        .replaceAll('>', '\\u003e')
        .replaceAll('&', '\\u0026');
}

function replaceMetaContent(html, name, value) {
    const pattern = new RegExp(`<meta\\b(?=[^>]*\\bname=["']${name}["'])[^>]*>`, 'i');
    const match = html.match(pattern);
    if (!match) throw new Error(`В index.html отсутствует meta ${name}.`);
    const updated = match[0].replace(/\\bcontent=(["'])[^"']*\\1/i, `content="${escapeAttribute(value)}"`);
    if (updated === match[0]) throw new Error(`Не удалось обновить meta ${name}.`);
    return html.replace(match[0], updated);
}

function readMetaContent(html, name) {
    const pattern = new RegExp(`<meta\\b(?=[^>]*\\bname=["']${name}["'])[^>]*\\bcontent=["']([^"']*)["'][^>]*>`, 'i');
    return html.match(pattern)?.[1] ?? null;
}

function publicFirebaseConfig(config) {
    const source = config.firebaseConfig;
    const result = {
        apiKey: source.apiKey,
        authDomain: source.authDomain,
        projectId: source.projectId,
        appId: source.appId,
        messagingSenderId: source.messagingSenderId
    };
    if (source.storageBucket !== undefined) result.storageBucket = source.storageBucket;
    if (source.databaseURL !== undefined) result.databaseURL = source.databaseURL;
    if (typeof source.measurementId === 'string' && /^G-[A-Z0-9]+$/.test(source.measurementId)) {
        result.measurementId = source.measurementId;
    }
    return result;
}

export function renderStagingIndex(sourceHtml, config) {
    const validation = validateStagingConfig(config);
    if (!validation.valid) {
        throw new Error(`Staging preflight failed: ${validation.errors.join(' ')}`);
    }
    if (sourceHtml.includes('dreamandgo-firebase-config') ||
        sourceHtml.includes('name="dreamandgo-environment"')) {
        throw new Error('Исходный index.html уже содержит staging runtime config.');
    }

    let html = replaceMetaContent(sourceHtml, 'firebase-app-check-site-key', config.appCheckSiteKey);
    for (const flag of FLAG_NAMES) {
        if (readMetaContent(html, flag) !== 'false') {
            throw new Error(`Rollout flag ${flag} должен оставаться false в staging build.`);
        }
    }

    const runtimeConfig = escapeJsonForHtml(publicFirebaseConfig(config));
    const injection = [
        '<meta name="dreamandgo-environment" content="staging">',
        `<script id="dreamandgo-firebase-config" type="application/json">${runtimeConfig}</script>`
    ].join('\\n');
    if (!/<\\/head>/i.test(html)) throw new Error('В index.html отсутствует закрывающий </head>.');
    html = html.replace(/<\\/head>/i, `${injection}\\n</head>`);
    return html;
}

export async function buildStaging(configPath = DEFAULT_CONFIG) {
    const absoluteConfigPath = resolve(process.cwd(), configPath);
    const outputRelativeToConfig = relative(absoluteConfigPath, OUTPUT_DIR);
    if (outputRelativeToConfig === '' || (!outputRelativeToConfig.startsWith(`..${sep}`) && outputRelativeToConfig !== '..')) {
        throw new Error('Staging config не может находиться внутри каталога сборки.');
    }

    const config = JSON.parse(await readFile(absoluteConfigPath, 'utf8'));
    const validation = validateStagingConfig(config);
    if (!validation.valid) {
        throw new Error(`Staging preflight failed: ${validation.errors.join(' ')}`);
    }

    const sourceHtml = await readFile(resolve(ROOT, 'index.html'), 'utf8');
    const stagingHtml = renderStagingIndex(sourceHtml, config);

    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await mkdir(OUTPUT_DIR, { recursive: true });
    await cp(resolve(ROOT, 'css'), resolve(OUTPUT_DIR, 'css'), { recursive: true });
    await cp(resolve(ROOT, 'js'), resolve(OUTPUT_DIR, 'js'), { recursive: true });
    await writeFile(resolve(OUTPUT_DIR, 'index.html'), stagingHtml, 'utf8');

    console.log(`Staging build created: ${relative(ROOT, OUTPUT_DIR)}`);
    console.log(`Firebase project: ${config.firebaseConfig.projectId}`);
    console.log('Rollout flags: all false');
    console.log('Production Firebase config was not modified.');
    return OUTPUT_DIR;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await buildStaging(process.argv[2] || DEFAULT_CONFIG);
    } catch (error) {
        console.error(`Staging build failed: ${error.message}`);
        process.exitCode = 1;
    }
}
