export class ProfilePrivacyClient {
    constructor({ firebaseApp, check, functionsFactory, callableFactory }) {
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

        const functions = this.functionsFactory(this.app, 'europe-west3');
        const callable = this.callableFactory(functions, 'updateProfileVisibilityV1');
        const result = await callable({ visibility });
        return result.data;
    }
}
