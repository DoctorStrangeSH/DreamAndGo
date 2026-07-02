import { db } from '../config/firebase.js';
import { collection, getDocs, getDoc, doc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ExportService {
    constructor() {
        this.db = db;
    }

    async exportAllData(userId) {
        const data = {
            exportedAt: new Date().toISOString(),
            user: null,
            travels: [],
            restaurants: [],
            movies: [],
            books: [],
            dreams: [],
            friends: [],
            achievements: []
        };

        try {
            // Профиль
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                delete userData.achievements;
                delete userData.friends;
                delete userData.sentRequests;
                delete userData.friendRequests;
                data.user = userData;
            }

            const collections = ['travels', 'restaurants', 'movies', 'books', 'dreams', 'friends'];
            
            for (const col of collections) {
                const snap = await getDocs(collection(this.db, 'users', userId, col));
                snap.forEach(docSnap => {
                    if (docSnap.id !== '_init') {
                        const item = { id: docSnap.id, ...docSnap.data() };
                        // Конвертируем timestamp в строки
                        if (item.createdAt?.toDate) item.createdAt = item.createdAt.toDate().toISOString();
                        if (item.updatedAt?.toDate) item.updatedAt = item.updatedAt.toDate().toISOString();
                        data[col].push(item);
                    }
                });
            }

            // Достижения
            const userData = (await getDoc(doc(this.db, 'users', userId))).data();
            if (userData?.achievements) {
                data.achievements = userData.achievements;
            }

            return data;
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            return null;
        }
    }

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async exportAndDownload(userId) {
        const data = await this.exportAllData(userId);
        if (data) {
            const date = new Date().toISOString().split('T')[0];
            this.downloadJSON(data, `dreamandgo-backup-${date}.json`);
            return true;
        }
        return false;
    }
}