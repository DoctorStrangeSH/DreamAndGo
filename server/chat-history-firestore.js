// Firestore Standard / Native adapter for the candidate private chat history.
// This module performs only the database IO; chat-history-service.js authorizes
// every request before listMessages can run.
export function createFirestoreHistoryAdapter(db) {
    return {
        async getChat(chatId) {
            const snapshot = await db.collection('chats').doc(chatId).get();
            return snapshot.exists ? snapshot.data() : null;
        },
        async getBlock(ownerId, peerId) {
            const snapshot = await db.collection('users').doc(ownerId)
                .collection('blockedUsers').doc(peerId).get();
            return { exists: snapshot.exists };
        },
        async listMessages(chatId, { beforeSequence, limit }) {
            // Filter and order the same scalar field, using its single-field
            // index. Never scan the full collection or use an unbounded query.
            const messages = db.collection('chats').doc(chatId).collection('messages');
            let query = messages;
            if (beforeSequence !== null) {
                query = query.where('sequence', '<', beforeSequence);
            }
            const snapshot = await query.orderBy('sequence', 'desc').limit(limit).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    };
}
