import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { ProfileAccountClient } from '../core/profile-account-client.js';

function isFunctionsBackendReady() {
    return document.querySelector('meta[name="firebase-functions-backend-ready"]')?.content?.trim().toLowerCase() === 'true';
}

export class ProfileAccountService extends ProfileAccountClient {
    constructor() {
        super({
            firebaseApp: app,
            check: appCheck,
            backendReady: isFunctionsBackendReady(),
            functionsFactory: getFunctions,
            callableFactory: httpsCallable
        });
    }
}
