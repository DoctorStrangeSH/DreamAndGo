import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js';
import { 
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    query,
    collection,
    where,
    getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Production remains the default runtime. Staging builds embed an explicit
// JSON config and environment marker into their generated index.html.
const PRODUCTION_FIREBASE_CONFIG = Object.freeze({
    apiKey: "AIzaSyCojBCBMu7ygKiDIfBzMgmf2ocFj9PScf8",
    authDomain: "dream-and-go.firebaseapp.com",
    projectId: "dream-and-go",
    storageBucket: "dream-and-go.firebasestorage.app",
    messagingSenderId: "185825350373",
    appId: "1:185825350373:web:749e60926a0c6294f7fa0c",
    measurementId: "G-FR9HRFS4S7"
});

const runtimeEnvironment = document.querySelector('meta[name="dreamandgo-environment"]')?.content?.trim() || 'production';
const runtimeConfigElement = document.getElementById('dreamandgo-firebase-config');
const isStagingEnvironment = runtimeEnvironment === 'staging';

function resolveFirebaseConfig() {
    if (!isStagingEnvironment) {
        if (runtimeConfigElement) {
            throw new Error('Embedded Firebase config is only allowed in an explicit staging build.');
        }
        if (runtimeEnvironment !== 'production') {
            throw new Error(`Unsupported Dream&Go environment: ${runtimeEnvironment}`);
        }
        return PRODUCTION_FIREBASE_CONFIG;
    }

    if (!runtimeConfigElement) {
        throw new Error('Staging runtime config is missing; production fallback is disabled.');
    }

    let config;
    try {
        config = JSON.parse(runtimeConfigElement.textContent || '');
    } catch {
        throw new Error('Staging runtime Firebase config is not valid JSON.');
    }

    const projectId = config?.projectId;
    if (!config || typeof config !== 'object' ||
        typeof projectId !== 'string' ||
        !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) ||
        !/(?:^|-)staging(?:-|$)/.test(projectId) ||
        projectId === 'dream-and-go' ||
        config.authDomain !== `${projectId}.firebaseapp.com` ||
        typeof config.apiKey !== 'string' || !/^AIza[A-Za-z0-9_-]{20,}$/.test(config.apiKey) ||
        typeof config.appId !== 'string' || !/^1:[0-9]+:web:[A-Za-z0-9]+$/.test(config.appId) ||
        typeof config.messagingSenderId !== 'string' || !/^[0-9]+$/.test(config.messagingSenderId)) {
        throw new Error('Staging runtime Firebase config failed its project identity checks.');
    }

    return Object.freeze(config);
}

const firebaseConfig = resolveFirebaseConfig();
const appCheckSiteKey = document.querySelector('meta[name="firebase-app-check-site-key"]')?.content?.trim();

if (isStagingEnvironment &&
    (!appCheckSiteKey || !/^[A-Za-z0-9_-]{20,128}$/.test(appCheckSiteKey))) {
    throw new Error('Staging App Check site key is missing or invalid; Firebase initialization is blocked.');
}

// Инициализация Firebase с проверкой ошибок
let app, auth, db, appCheck = null;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    if (appCheckSiteKey && /^[A-Za-z0-9_-]{20,128}$/.test(appCheckSiteKey)) {
        appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(appCheckSiteKey),
            isTokenAutoRefreshEnabled: true
        });
        console.log('🛡️ Firebase App Check initialized');
    } else {
        console.warn('🛡️ Firebase App Check is not configured; protected callables remain unavailable.');
    }
    
    // Подключаемся к эмулятору только для разработки (если нужно)
    // connectFirestoreEmulator(db, 'localhost', 8080);
    
    console.log('✅ Firebase успешно инициализирован');
    console.log('📁 Project ID:', firebaseConfig.projectId);
} catch (error) {
    console.error('❌ Ошибка инициализации Firebase:', error);
    console.error('Проверь конфигурацию в Firebase Console');
    if (isStagingEnvironment) {
        app = auth = db = appCheck = null;
        throw error;
    }
}

// Экспортируем для использования в других модулях
export { app, auth, db, appCheck };

// Дополнительно: проверка подключения
export async function checkFirebaseConnection() {
    try {
        // Пробуем получить документ-заглушку для проверки соединения
        const testDoc = doc(db, '_connection_test', 'test');
        await getDoc(testDoc);
        console.log('✅ Подключение к Firestore работает');
        return true;
    } catch (error) {
        console.error('❌ Ошибка подключения к Firestore:', error);
        return false;
    }
}