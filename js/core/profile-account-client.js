export class ProfileAccountClient {
    constructor({ firebaseApp, check, functionsFactory, callableFactory }) {
        this.app = firebaseApp;
        this.appCheck = check;
        this.functionsFactory = functionsFactory;
        this.callableFactory = callableFactory;
    }

    get isReady() {
        return Boolean(this.app && this.appCheck);
    }

    async invoke(name, payload = {}) {
        if (!this.isReady) {
            const error = new Error('App Check не настроен. Добавьте reCAPTCHA v3 site key в настройки приложения.');
            error.code = 'app-check/not-configured';
            throw error;
        }
        const functions = this.functionsFactory(this.app, 'europe-west3');
        const callable = this.callableFactory(functions, name);
        const result = await callable(payload);
        return result.data;
    }

    async getMyProfile() {
        const result = await this.invoke('getMyProfileV1');
        if (!result?.profile || typeof result.profile !== 'object' || Array.isArray(result.profile)) {
            throw new Error('Сервер вернул некорректный профиль');
        }
        return result.profile;
    }

    async updateMyProfile(profile) {
        const result = await this.invoke('updateMyProfileV1', profile);
        if (!result || typeof result.username !== 'string') {
            throw new Error('Сервер вернул некорректный результат сохранения');
        }
        return result;
    }
}
