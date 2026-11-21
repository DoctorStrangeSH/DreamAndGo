import { auth, db } from '../config/firebase.js';
import { getPublicProfilesByIds } from './public-profile-callable.service.js';
import { validateChatMessage, validChatParticipants, isValidChatUid, isValidChatPathSegment } from '../core/chat-message-policy.js';
import {
    collection, doc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, limit, serverTimestamp, writeBatch, setDoc, increment, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ChatService {
    constructor() {
        this.db = db;
    }

    getChatId(userId1, userId2) {
        if (!isValidChatUid(userId1) || !isValidChatUid(userId2) || userId1 === userId2) {
            throw new TypeError('Некорректные участники диалога');
        }
        return [userId1, userId2].sort().join('_');
    }

    async getChats(userId) {
        if (!isValidChatUid(userId) || auth?.currentUser?.uid !== userId) return [];
        try {
            const chatsRef = collection(this.db, 'users', userId, 'chats');
            const q = query(chatsRef, orderBy('lastMessageTime', 'desc'));
            const snapshot = await getDocs(q);

            const chatDocs = snapshot.docs.filter(item => item.id !== '_init');
            const partnerIds = [...new Set(chatDocs
                .map(item => item.data().partnerId)
                .filter(uid => isValidChatUid(uid) && uid !== userId))];
            const profiles = await getPublicProfilesByIds(partnerIds);
            const profilesById = new Map(profiles.map(profile => [profile.uid, profile]));

            return chatDocs.map(docSnap => {
                const chatData = docSnap.data();
                const partnerData = profilesById.get(chatData.partnerId) || null;
                return {
                    id: docSnap.id,
                    partnerId: chatData.partnerId,
                    partnerName: partnerData?.username || 'Пользователь',
                    partnerAvatar: partnerData?.avatar || null,
                    lastMessage: chatData.lastMessage || '',
                    lastMessageTime: chatData.lastMessageTime?.toDate?.() || new Date(),
                    unread: chatData.unread || 0,
                    isGroup: chatData.isGroup || false
                };
            });
        } catch (error) {
            console.error('Ошибка загрузки чатов:', error);
            return [];
        }
    }

    async getOrCreateChat(userId, partnerId) {
        if (!isValidChatUid(userId) || !isValidChatUid(partnerId) ||
            userId === partnerId || auth?.currentUser?.uid !== userId) return null;
        try {
            const ownRef = doc(this.db, 'users', userId, 'chats', partnerId);
            const peerRef = doc(this.db, 'users', partnerId, 'chats', userId);
            await runTransaction(this.db, async transaction => {
                // Read only our own document. Concurrent attempts retry safely.
                const own = await transaction.get(ownRef);
                if (own.exists()) return;
                transaction.set(ownRef, {
                    partnerId,
                    lastMessage: '',
                    lastMessageTime: serverTimestamp(),
                    unread: 0,
                    createdAt: serverTimestamp()
                });
                // Preserve the recipient's existing preview, timestamp and unread count.
                // The first actual message populates them if the record was absent.
                transaction.set(peerRef, { partnerId: userId }, { merge: true });
            });
            if (auth?.currentUser?.uid !== userId) return null;
            return partnerId;
        } catch (error) {
            console.error('Ошибка создания чата:', error);
            return null;
        }
    }

    async sendMessage(chatId, senderId, receiverId, text) {
        const validation = validateChatMessage(text);
        if (!validation.valid) return { success: false, error: validation.error };
        if (!validChatParticipants(auth?.currentUser?.uid, senderId, receiverId, chatId, this.getChatId.bind(this))) {
            return { success: false, error: 'Некорректные участники диалога' };
        }
        text = validation.text;
        try {
            const messagesRef = collection(this.db, 'chats', chatId, 'messages');

            const message = {
                senderId: senderId,
                text: text,
                createdAt: serverTimestamp(),
                read: false,
                edited: false
            };

            // All three documents succeed or fail together.
            const batch = writeBatch(this.db);
            batch.set(doc(messagesRef), message);

            const updateData = {
                lastMessage: text.substring(0, 100),
                lastMessageTime: serverTimestamp()
            };

            batch.set(doc(this.db, 'users', senderId, 'chats', receiverId), {
                partnerId: receiverId,
                ...updateData,
                unread: 0
            }, { merge: true });

            batch.set(doc(this.db, 'users', receiverId, 'chats', senderId), {
                partnerId: senderId,
                ...updateData,
                unread: increment(1)
            }, { merge: true });

            if (auth?.currentUser?.uid !== senderId) return { success: false, error: 'Сессия изменилась' };
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteMessage(chatId, messageId) {
        try {
            const actorId = auth?.currentUser?.uid;
            if (!actorId || !isValidChatUid(actorId) || !isValidChatPathSegment(chatId, 257) ||
                !isValidChatPathSegment(messageId, 128)) return { success: false };
            const messageRef = doc(this.db, 'chats', chatId, 'messages', messageId);
            const existing = await getDoc(messageRef);
            if (!existing.exists() || existing.data().senderId !== actorId || auth?.currentUser?.uid !== actorId) return { success: false };
            await deleteDoc(messageRef);
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления сообщения:', error);
            return { success: false };
        }
    }

    async editMessage(chatId, messageId, newText) {
        const validation = validateChatMessage(newText);
        if (!validation.valid) return { success: false, error: validation.error };
        try {
            const actorId = auth?.currentUser?.uid;
            if (!actorId || !isValidChatUid(actorId) || !isValidChatPathSegment(chatId, 257) ||
                !isValidChatPathSegment(messageId, 128)) return { success: false };
            const messageRef = doc(this.db, 'chats', chatId, 'messages', messageId);
            const existing = await getDoc(messageRef);
            if (!existing.exists() || existing.data().senderId !== actorId || auth?.currentUser?.uid !== actorId) return { success: false };
            await updateDoc(messageRef, {
                text: validation.text,
                edited: true,
                editedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Ошибка редактирования:', error);
            return { success: false };
        }
    }

    async markAsRead(userId, partnerId) {
        if (!isValidChatUid(userId) || !isValidChatUid(partnerId) ||
            userId === partnerId || auth?.currentUser?.uid !== userId) return;
        try {
            const chatRef = doc(this.db, 'users', userId, 'chats', partnerId);
            await updateDoc(chatRef, { unread: 0 });
        } catch (error) {
            console.error('Ошибка отметки прочитано:', error);
        }
    }

    async deleteChat(userId, partnerId) {
        if (!isValidChatUid(userId) || !isValidChatUid(partnerId) ||
            userId === partnerId || auth?.currentUser?.uid !== userId) {
            return { success: false, error: 'Некорректный диалог' };
        }
        try {
            const chatId = this.getChatId(userId, partnerId);
            const messagesRef = collection(this.db, 'chats', chatId, 'messages');

            // Firestore batches allow at most 500 writes. Reserve two writes
            // for conversation metadata; fail without deleting anything if
            // the full history will not fit into the atomic batch.
            const snapshot = await getDocs(query(messagesRef, limit(499)));
            if (snapshot.size > 498) {
                return {
                    success: false,
                    error: 'История слишком длинная для безопасного удаления. Обратись к администратору.'
                };
            }

            if (auth?.currentUser?.uid !== userId) return { success: false, error: 'Сессия изменилась' };
            const batch = writeBatch(this.db);
            snapshot.forEach(item => batch.delete(item.ref));
            batch.delete(doc(this.db, 'users', userId, 'chats', partnerId));
            batch.delete(doc(this.db, 'users', partnerId, 'chats', userId));
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления диалога:', error);
            return { success: false, error: 'Не удалось удалить диалог' };
        }
    }

    async deleteChatLocal(userId, partnerId) {
        if (!isValidChatUid(userId) || !isValidChatUid(partnerId) ||
            userId === partnerId || auth?.currentUser?.uid !== userId) {
            return { success: false };
        }
        try {
            await deleteDoc(doc(this.db, 'users', userId, 'chats', partnerId));
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления диалога:', error);
            return { success: false };
        }
    }

    async getUserProfile(uid) {
        if (!isValidChatUid(uid)) return null;
        try {
            const profiles = await getPublicProfilesByIds([uid]);
            return profiles.find(profile => profile.uid === uid) || null;
        } catch (error) {
            return null;
        }
    }
}