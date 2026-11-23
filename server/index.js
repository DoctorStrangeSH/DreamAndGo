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
import { createFriendCallables } from './friends-callables.js';
import { createNotificationCallables } from './notifications-callables.js';
import { createChatCallables } from './chat-callables.js';

if (getApps().length === 0) initializeApp();

// Candidate callable surface for registration, owner-scoped profile, friends,
// notifications and private Chat V2. Do not deploy until Emulator and staging acceptance
// are complete; production rollout flags remain closed.
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


const friends = createFriendCallables({ onCall, HttpsError, getFirestore, FieldValue });

export const sendFriendRequestV1 = friends.sendFriendRequestV1;
export const acceptFriendRequestV1 = friends.acceptFriendRequestV1;
export const rejectFriendRequestV1 = friends.rejectFriendRequestV1;
export const cancelFriendRequestV1 = friends.cancelFriendRequestV1;
export const removeFriendV1 = friends.removeFriendV1;

const notifications = createNotificationCallables({ onCall, HttpsError, getFirestore });

export const getMyNotificationsV1 = notifications.getMyNotificationsV1;
export const markNotificationReadV1 = notifications.markNotificationReadV1;
export const markAllNotificationsReadV1 = notifications.markAllNotificationsReadV1;

const chat = createChatCallables({ onCall, HttpsError, getFirestore, FieldValue });

export const createPrivateChatV2 = chat.createPrivateChatV2;
export const sendPrivateMessageV2 = chat.sendPrivateMessageV2;
export const getPrivateChatHistoryV2 = chat.getPrivateChatHistoryV2;
export const getPrivateMessageStatusV2 = chat.getPrivateMessageStatusV2;
export const markPrivateMessageReadV2 = chat.markPrivateMessageReadV2;
export const getPrivateChatUnreadV2 = chat.getPrivateChatUnreadV2;
