import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { registerProfileWithReservedUsername } from './username-reservation.js';
import { getRegistrationState } from './registration-state.js';
import { createRegistrationCallables } from './registration-callables.js';
import { createProfileCallables } from './profile-callables.js';
import { buildPublicProfile } from './public-profile.js';
import { createProfileAccountCallables } from './profile-account-callables.js';

if (getApps().length === 0) initializeApp();

// This deployment unit exposes isolated signup and owner-scoped profile
// callables only. Do not deploy until Emulator and staging acceptance are complete.
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


const profileAccount = createProfileAccountCallables({
    onCall,
    HttpsError,
    getFirestore,
    FieldValue,
    buildPublicProfile
});

export const getMyProfileV1 = profileAccount.getMyProfileV1;
export const updateMyProfileV1 = profileAccount.updateMyProfileV1;
