import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { createSignupV2Client } from '../core/signup-v2-client.js';
import { canUseSignupV2, signupV2Status } from '../core/signup-v2-policy.js';

function readFlag(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content?.trim().toLowerCase() === 'true';
}

export class SignupV2Service {
    constructor() {
        this.app = app;
        this.appCheck = appCheck;
        this.rollout = {
            enabled: readFlag('signup-v2-enabled'),
            backendReady: readFlag('signup-v2-backend-ready'),
            legacyMigrationVerified: readFlag('signup-v2-legacy-migration-verified')
        };
        this.backendReady = readFlag('firebase-functions-backend-ready');
        this.client = null;

        if (this.app && this.appCheck && this.backendReady) {
            this.client = createSignupV2Client({
                functions: getFunctions(this.app, 'europe-west3'),
                httpsCallable
            });
        }
    }

    get isTransportReady() {
        return Boolean(this.app && this.appCheck && this.backendReady && this.client);
    }

    get canStartNewSignup() {
        return this.isTransportReady && canUseSignupV2(this.rollout);
    }

    get signupStatus() {
        if (!this.appCheck) {
            return {
                available: false,
                message: 'Защищённая регистрация пока не настроена. Попробуйте позже.'
            };
        }
        if (!this.backendReady) {
            return {
                available: false,
                message: 'Серверная регистрация ещё не подключена к тестовой среде.'
            };
        }
        return signupV2Status(this.rollout);
    }

    async registerProfile(username) {
        if (!this.isTransportReady) {
            const error = new Error('Защищённая регистрация пока не настроена');
            error.code = 'app-check/not-configured';
            throw error;
        }
        return this.client.registerProfile(username);
    }

    async getRegistrationState() {
        if (!this.isTransportReady) {
            const error = new Error('Проверка восстановления пока недоступна');
            error.code = 'app-check/not-configured';
            throw error;
        }
        return this.client.getRegistrationState();
    }
}


    get isTransportReady() {
        return Boolean(this.app && this.appCheck && this.client);
    }

    get canStartNewSignup() {
        return this.isTransportReady && canUseSignupV2(this.rollout);
    }

    get signupStatus() {
        if (!this.isTransportReady) {
            return {
                available: false,
                message: 'Защищённая регистрация пока не настроена. Попробуйте позже.'
            };
        }
        return signupV2Status(this.rollout);
    }

    async registerProfile(username) {
        if (!this.isTransportReady) {
            const error = new Error('Защищённая регистрация пока не настроена');
            error.code = 'app-check/not-configured';
            throw error;
        }
        return this.client.registerProfile(username);
    }

    async getRegistrationState() {
        if (!this.isTransportReady) {
            const error = new Error('Проверка восстановления пока недоступна');
            error.code = 'app-check/not-configured';
            throw error;
        }
        return this.client.getRegistrationState();
    }
}
