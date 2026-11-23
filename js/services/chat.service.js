import { db } from '../config/firebase.js';
import { ChatV2Service } from './chat-v2.service.js';
import {
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, writeBatch, setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class ChatService {
    constructor() {
        this.db = db;
        this.chatV2 = new ChatV2Service();
        this.chatIdsByPartner = new Map();
    }

    get isV2Enabled() {
        return this.chatV2.isEnabled;
    }

    rememberChatId(partnerId, chatId) {
        if (partnerId && chatId) this.chatIdsByPartner.set(partnerId, chatId);
    }

    getChatId(userId1, userId2) {
        if (this.isV2Enabled && this.chatIdsByPartner.has(userId2)) {
            return this.chatIdsByPartner.get(userId2);
        }
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
        if (this.isV2Enabled) {
            try {
                if (!userId || !partnerId || userId === partnerId) {
                    throw new Error('Некорректный собеседник.');
                }
                const chatId = await this.chatV2.createPrivateChat(partnerId);
                this.rememberChatId(partnerId, chatId);
                return chatId;
            } catch (error) {
                console.error('Ошибка создания Chat V2:', error);
                return null;
            }
        }

        try {
            const userChatRef = doc(this.db, 'users', userId, 'chats', partnerId);
            const userChatDoc = await getDoc(userChatRef);

            if (userChatDoc.exists()) {
                return partnerId;
            }

            const batch = writeBatch(this.db);

            const chatData = {
                partnerId: partnerId,
                lastMessage: '',
                lastMessageTime: serverTimestamp(),
                unread: 0,
                createdAt: serverTimestamp()
            };

            batch.set(doc(this.db, 'users', userId, 'chats', partnerId), chatData);
            batch.set(doc(this.db, 'users', partnerId, 'chats', userId), {
                ...chatData,
                partnerId: userId
            });

            await batch.commit();
            return partnerId;
        } catch (error) {
            console.error('Ошибка создания чата:', error);
            return null;
        }
    }

    async sendMessage(chatId, senderId, receiverId, text) {
        if (this.isV2Enabled) {
            try {
                if (!chatId || !text?.trim()) throw new Error('Пустое сообщение.');
                await this.chatV2.sendMessage(chatId, text.trim());
                return { success: true };
            } catch (error) {
                console.error('Ошибка отправки Chat V2:', error);
                return { success: false, error: error.message };
            }
        }

        try {
            const messagesRef = collection(this.db, 'chats', chatId, 'messages');

            const message = {
                senderId: senderId,
                text: text,
                createdAt: serverTimestamp(),
                read: false,
                edited: false
            };

            await addDoc(messagesRef, message);

            const batch = writeBatch(this.db);

            const updateData = {
                lastMessage: text.substring(0, 100),
                lastMessageTime: serverTimestamp()
            };

            batch.set(doc(this.db, 'users', senderId, 'chats', receiverId), {
                partnerId: receiverId,
                ...updateData,
                unread: 0,
                createdAt: serverTimestamp()
            }, { merge: true });

            batch.set(doc(this.db, 'users', receiverId, 'chats', senderId), {
                partnerId: senderId,
                ...updateData,
                unread: 1,
                createdAt: serverTimestamp()
            }, { merge: true });

            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteMessage(chatId, messageId) {
        if (this.isV2Enabled) return { success: false, error: 'Удаление сообщений пока отключено для нового чата.' };

        try {
            await deleteDoc(doc(this.db, 'chats', chatId, 'messages', messageId));
            return { success: true };
        } catch (error) {
            console.error('Ошибка удаления сообщения:', error);
            return { success: false };
        }
    }

    async editMessage(chatId, messageId, newText) {
        if (this.isV2Enabled) return { success: false, error: 'Редактирование сообщений пока отключено для нового чата.' };

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
        if (this.isV2Enabled) {
            try {
                const chatId = this.getChatId(userId, partnerId);
                if (!chatId || chatId.includes('_')) return;
                const messages = await this.chatV2.getHistory(chatId);
                const unread = messages.filter(message => message.senderId !== userId && message.read !== true);
                for (const message of unread) {
                    await this.chatV2.markMessageRead(chatId, message.id);
                }
            } catch (error) {
                console.error('Ошибка отметки Chat V2 прочитанным:', error);
            }
            return;
        }
        try {
            const chatRef = doc(this.db, 'users', userId, 'chats', partnerId);
            await updateDoc(chatRef, { unread: 0 });
        } catch (error) {
            console.error('Ошибка отметки прочитано:', error);
        }
    }

    async deleteChat(userId, partnerId) {
        if (this.isV2Enabled) return { success: false, error: 'Удаление переписок пока отключено для нового чата.' };

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
        if (this.isV2Enabled) return { success: false, error: 'Удаление переписок пока отключено для нового чата.' };

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