import { app } from '../config/firebase.js';
import {
    getFunctions, httpsCallable
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { createChatV2CallableInvoker } from '../core/chat-v2-callable-invoker.js';

// Candidate-only SDK bridge. It is never imported by legacy chat.
// Calling this factory requires a separately approved and deployed v2 backend.
export function createBrowserChatV2Invoker() {
    if (!app) throw new Error('Firebase не инициализирован');
    const functions = getFunctions(app, 'europe-west3');
    return createChatV2CallableInvoker(httpsCallable, functions);
}
