import { db } from '../config/firebase.js';
import {
    collection, doc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, writeBatch, setDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ChatService {
    constructor() {
        this.db = db;
    }

    getChatId(userId1, userId2) {
        return [userId1, userId2].sort().join('_');
    }

    async getChats(userId) {
        try {
            const chatsRef = collection(this.db, 'users', userId, 'chats');
            const q = query(chatsRef, orderBy('lastMessageTime', 'desc'));
            const snapshot = await getDocs(q);

            const chats = [];
            for (const docSnap of snapshot.docs) {
                if (docSnap.id !== '_init') {
                    const chatData = docSnap.data();
                    const partnerData = await this.getUserProfile(chatData.partnerId);

                    chats.push({
                        id: docSnap.id,
                        partnerId: chatData.partnerId,
                        partnerName: partnerData?.username || 'Пользователь',
                        partnerAvatar: partnerData?.avatar || null,
                        lastMessage: chatData.lastMessage || '',
                        lastMessageTime: chatData.lastMessageTime?.toDate?.() || new Date(),
                        unread: chatData.unread || 0,
                        isGroup: chatData.isGroup || false
                    });
                }
            }

            return chats;
        } catch (error) {
            console.error('Ошибка загрузки чатов:', error);
            return [];
        }
    }

    async getOrCreateChat(userId, partnerId) {
        if (!userId || !partnerId || userId === partnerId) return null;
        try {
            const ownRef = doc(this.db, 'users', userId, 'chats', partnerId);
            const own = await getDoc(ownRef);
            if (own.exists()) return partnerId;

            const peerRef = doc(this.db, 'users', partnerId, 'chats', userId);
            const batch = writeBatch(this.db);
            batch.set(ownRef, {
                partnerId,
                lastMessage: '',
                lastMessageTime: serverTimestamp(),
                unread: 0,
                createdAt: serverTimestamp()
            });
            // The peer's private chats are not readable by this user.
            // Merge only the relationship field so existing message previews,
            // timestamps and unread counts cannot be reset.
            batch.set(peerRef, { partnerId: userId }, { merge: true });
            await batch.commit();
            return partnerId;
        } catch (error) {
            console.error('Ошибка создания чата:', error);
            return null;
        }
    }

    async sendMessage(chatId, senderId, receiverId, text) {
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

            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteMessage(chatId, messageId) {
        try {
            await deleteDoc(doc(this.db, 'chats', chatId, 'messages', messageId));
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления сообщения:', error);
            return { success: false };
        }
    }

    async editMessage(chatId, messageId, newText) {
        try {
            await updateDoc(doc(this.db, 'chats', chatId, 'messages', messageId), {
                text: newText,
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
        try {
            const chatRef = doc(this.db, 'users', userId, 'chats', partnerId);
            await updateDoc(chatRef, { unread: 0 });
        } catch (error) {
            console.error('Ошибка отметки прочитано:', error);
        }
    }

    async deleteChat(userId, partnerId) {
        try {
            const chatId = this.getChatId(userId, partnerId);
            const batch = writeBatch(this.db);

            // Удаляем диалог у обоих
            batch.delete(doc(this.db, 'users', userId, 'chats', partnerId));
            batch.delete(doc(this.db, 'users', partnerId, 'chats', userId));

            // Удаляем все сообщения
            const messagesRef = collection(this.db, 'chats', chatId, 'messages');
            const snapshot = await getDocs(messagesRef);
            snapshot.forEach(msgDoc => {
                batch.delete(msgDoc.ref);
            });

            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления диалога:', error);
            return { success: false };
        }
    }

    async deleteChatLocal(userId, partnerId) {
        try {
            await deleteDoc(doc(this.db, 'users', userId, 'chats', partnerId));
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления диалога:', error);
            return { success: false };
        }
    }

    async getUserProfile(uid) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', uid));
            if (userDoc.exists()) {
                return userDoc.data();
            }
            return null;
        } catch (error) {
            return null;
        }
    }
}