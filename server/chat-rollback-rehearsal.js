import { compareMessageInventories } from './chat-integrity.js';

// Candidate recovery drill: emulator only. This reopens a synthetic v2 chat,
// NOT legacy storage or production traffic.
export async function rehearseChatReopen(db, { projectId, chatId, expectedMessages }) {
    if (!process.env.FIRESTORE_EMULATOR_HOST ||
        projectId !== 'demo-dreamandgo-chat-rules' ||
        !/^rollback-drill-[a-z0-9-]{1,48}$/.test(chatId)) {
        throw new Error('Recovery drill requires the isolated emulator demo project');
    }
    const ref = db.doc(`chats/${chatId}`);
    // Query and state reads belong to the SAME retryable transaction. If a
    // document observed by the transaction changes, Firestore can retry it.
    const result = await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (!current.exists || current.get('state') !== 'frozen' || current.get('version') !== 2) {
            throw new Error('Chat must be a frozen v2 rehearsal');
        }
        const snapshot = await tx.get(ref.collection('messages'));
        const actual = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        const verification = compareMessageInventories(expectedMessages, actual);
        if (!verification.equal) throw new Error('Recovery blocked: message integrity mismatch');
        tx.update(ref, { state: 'active' });
        return verification;
    });
    return {
        status: 'emulator_chat_reopened',
        sourceDigest: result.sourceDigest,
        restoredDigest: result.targetDigest,
        productionSwitchEnabled: false
    };
}
