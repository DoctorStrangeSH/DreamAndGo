import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const REGION = 'europe-west3';

export class ProfilePrivacyService {
    constructor({ firebaseApp = app, check = appCheck, functionsFactory = getFunctions, callableFactory = httpsCallable } = {}) {
        this.app = firebaseApp;
        this.appCheck = check;
        this.functionsFactory = functionsFactory;
        this.callableFactory = callableFactory;
    }

    get isReady() {
        return Boolean(this.app && this.appCheck);
    }

    async updateVisibility(visibility) {
        if (!this.isReady) {
            const error = new Error('App Check не настроен. Добавьте reCAPTCHA v3 site key в настройки приложения.');
            error.code = 'app-check/not-configured';
            throw error;
        }

        const functions = this.functionsFactory(this.app, REGION);
        const callable = this.callableFactory(functions, 'updateProfileVisibilityV1');
        const result = await callable({ visibility });
        return result.data;
    }
}
