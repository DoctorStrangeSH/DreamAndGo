import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
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

// Твой конфиг Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCojBCBMu7ygKiDIfBzMgmf2ocFj9PScf8",
    authDomain: "dream-and-go.firebaseapp.com",
    projectId: "dream-and-go",
    storageBucket: "dream-and-go.firebasestorage.app",
    messagingSenderId: "185825350373",
    appId: "1:185825350373:web:749e60926a0c6294f7fa0c",
    measurementId: "G-FR9HRFS4S7"
};

// Инициализация Firebase с проверкой ошибок
let app, auth, db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Подключаемся к эмулятору только для разработки (если нужно)
    // connectFirestoreEmulator(db, 'localhost', 8080);
    
    console.log('✅ Firebase успешно инициализирован');
    console.log('📁 Project ID:', firebaseConfig.projectId);
} catch (error) {
    console.error('❌ Ошибка инициализации Firebase:', error);
    console.error('Проверь конфигурацию в Firebase Console');
}

// Экспортируем для использования в других модулях
export { app, auth, db };

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