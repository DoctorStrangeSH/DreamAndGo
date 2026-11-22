import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { registerProfileWithReservedUsername } from './username-reservation.js';
import { getRegistrationState } from './registration-state.js';
import { createRegistrationCallables } from './registration-callables.js';
import { createProfileCallables } from './profile-callables.js';
import { buildPublicProfile } from './public-profile.js';

if (getApps().length === 0) initializeApp();

// This deployment unit deliberately exposes only the isolated signup
// endpoints. Do not deploy until Emulator and staging acceptance are complete.
const registration = createRegistrationCallables({
    onCall,
    HttpsError,
    getAuth,
    getFirestore,
    FieldValue,
    registerProfileWithReservedUsername,
    getRegistrationState
});

export const registerProfileV2 = registration.registerProfileV2;
export const getRegistrationStateV2 = registration.getRegistrationStateV2;


const profile = createProfileCallables({
    onCall,
    HttpsError,
    getFirestore,
    FieldValue,
    buildPublicProfile
});

export const updateProfileVisibilityV1 = profile.updateProfileVisibilityV1;
