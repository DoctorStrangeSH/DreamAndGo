import { app, appCheck } from '../config/firebase.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { ProfilePrivacyClient } from '../core/profile-privacy-client.js';

export class ProfilePrivacyService extends ProfilePrivacyClient {
    constructor() {
        super({
            firebaseApp: app,
            check: appCheck,
            functionsFactory: getFunctions,
            callableFactory: httpsCallable
        });
    }
}
