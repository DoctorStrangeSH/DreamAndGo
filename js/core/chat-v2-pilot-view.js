import { escapeHTML } from './escape-html.js';
import { renderMessageDeliveryIndicator } from './chat-delivery-status.js';

const isMessageId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isChatId = value => typeof value === 'string' && value.length > 0 &&
    value.length <= 128 && !value.includes('/');

// Candidate-only view. The caller supplies verified v2 messages and a chat
// session; no Firestore subscription or legacy DOM is created here.
export function renderChatV2Pilot({ title = 'Тестовый диалог', messages = [], userId } = {}) {
    if (typeof userId !== 'string' || !userId || !Array.isArray(messages)) {
        throw new TypeError('Некорректные данные тестового чата');
    }
    const items = messages.slice(-100).map(message => {
        if (!message || typeof message !== 'object' ||
            typeof message.senderId !== 'string' || typeof message.text !== 'string') return '';
        const own = message.senderId === userId;
        // Only validated server message IDs may enter a DOM receipt attribute.
        const receipt = !own && isMessageId(message.id) && message.read !== true
            ? ` data-v2-incoming-id="${message.id}"` : '';
        const indicator = renderMessageDeliveryIndicator(message, userId);
        return `<li class="chat-v2-message ${own ? 'chat-v2-message--own' : 'chat-v2-message--other'}"${receipt}>
            <p class="chat-v2-message__text">${escapeHTML(message.text)}</p>
            ${indicator}
        </li>`;
    }).join('');
    return `<section class="chat-v2-pilot" aria-label="Пилотная версия чата">
        <header class="chat-v2-pilot__header">
            <div><span class="chat-v2-pilot__eyebrow">Приватный чат · тестовый режим</span>
            <h2 class="chat-v2-pilot__title">${escapeHTML(title)}</h2></div>
        </header>
        <div class="chat-v2-pilot__history">
            <button type="button" class="chat-v2-pilot__older" hidden>Загрузить ранние</button>
            <span class="chat-v2-pilot__history-status" role="status" aria-live="polite"></span>
        </div>
        <ul class="chat-v2-pilot__messages" aria-label="Сообщения" aria-live="polite">
            ${items || '<li class="chat-v2-pilot__empty">Здесь появятся сообщения после загрузки переписки.</li>'}
        </ul>
        <form class="chat-v2-pilot__composer">
            <label class="visually-hidden" for="chat-v2-pilot-text">Сообщение</label>
            <input id="chat-v2-pilot-text" name="message" maxlength="2000" autocomplete="off"
                   aria-label="Сообщение" placeholder="Написать сообщение…" required>
            <button type="submit">Отправить</button>
        </form>
        <p class="chat-v2-pilot__feedback" role="status" aria-live="polite"></p>
    </section>`;
}

export class ChatV2PilotView {
    constructor({ root, session, chatId, title, onLoadOlder = () => {} }) {
        if (!root || typeof root.querySelector !== 'function' ||
            !session || typeof session.prepare !== 'function' ||
            typeof session.send !== 'function' || !isChatId(chatId) || typeof onLoadOlder !== 'function') {
            throw new TypeError('Некорректная конфигурация тестового чата');
        }
        this.root = root;
        this.session = session;
        this.chatId = chatId;
        this.title = title;
        this.messages = [];
        this.onLoadOlder = onLoadOlder;
        this._older = () => this.onLoadOlder();
        this.destroyed = false;
        this.busy = false;
        this._submit = event => this._onSubmit(event);
    }

    mount() {
        if (this.destroyed) throw new Error('Экран закрыт');
        this.form?.removeEventListener('submit', this._submit);
        this.olderButton?.removeEventListener('click', this._older);
        this.root.innerHTML = renderChatV2Pilot({
            title: this.title, messages: this.messages, userId: this.session.userId
        });
        this.form = this.root.querySelector('.chat-v2-pilot__composer');
        this.form?.addEventListener('submit', this._submit);
        this.olderButton = this.root.querySelector('.chat-v2-pilot__older');
        this.olderButton?.addEventListener('click', this._older);
        return this;
    }

    // The owner passes validated data received from a future v2 history API.
    setMessages(messages) {
        if (this.destroyed) return;
        if (!Array.isArray(messages)) throw new TypeError('Ожидался список сообщений');
        this.messages = messages.slice(-100);
        const panel = this.root.querySelector('.chat-v2-pilot__messages');
        if (!panel) return;
        const holder = renderChatV2Pilot({ title: this.title, messages: this.messages,
            userId: this.session.userId });
        // No arbitrary text reaches HTML: all message bodies are escaped above.
        const template = this.root.ownerDocument.createElement('template');
        template.innerHTML = holder;
        panel.replaceChildren(...template.content.querySelector('.chat-v2-pilot__messages').childNodes);
    }

    setHistoryState(state) {
        if (this.destroyed) return;
        if (!state || state.chatId !== this.chatId || !Array.isArray(state.messages)) return;
        this.setMessages(state.messages);
        const button = this.root.querySelector('.chat-v2-pilot__older');
        const label = this.root.querySelector('.chat-v2-pilot__history-status');
        if (button) {
            button.hidden = !state.hasMore;
            button.disabled = state.status === 'loading';
        }
        if (label) {
            label.textContent = state.status === 'loading' ? 'Загружаем историю…' :
                state.status === 'error' ? 'Не удалось загрузить историю. Попробуйте ещё раз.' : '';
        }
    }

    async _onSubmit(event) {
        event.preventDefault();
        if (this.destroyed || this.busy) return;
        const input = this.form?.querySelector('[name="message"]');
        const text = input?.value?.trim();
        if (!text) return;
        this.busy = true;
        const button = this.form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        const feedback = this.root.querySelector('.chat-v2-pilot__feedback');
        try {
            const intent = this.session.prepare(this.chatId, text);
            const result = await this.session.send(intent.clientMessageId);
            if (this.destroyed) return;
            if (result.success) {
                input.value = '';
                if (feedback) feedback.textContent = 'Отправлено. Ожидаем обновления переписки.';
            } else if (feedback) {
                feedback.textContent = 'Отправка не подтверждена. Проверьте её статус перед повтором.';
            }
        } catch {
            if (!this.destroyed && feedback) feedback.textContent = 'Не удалось отправить сообщение.';
        } finally {
            this.busy = false;
            if (!this.destroyed && button) button.disabled = false;
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.form?.removeEventListener('submit', this._submit);
        this.olderButton?.removeEventListener('click', this._older);
        this.root.replaceChildren();
    }
}
