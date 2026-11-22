import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { ProfileAccountClient } from '../core/profile-account-client.js';

export class ProfileAccountService extends ProfileAccountClient {
    constructor() {
        super({
            firebaseApp: app,
            check: appCheck,
            functionsFactory: getFunctions,
            callableFactory: httpsCallable
        });
    }
}
