/**
 * MultiPlayerUI — Feature 18: Multi-Player Swarm Architecture
 *
 * Allows multiple users to collaborate in the same chat room via WebSocket.
 * User A types and their messages are broadcast live to User B and vice versa.
 */
export class MultiPlayerUI {
    private panelEl: HTMLElement | null;
    private openBtn: HTMLElement | null;
    private closeBtn: HTMLElement | null;
    private joinBtn: HTMLButtonElement | null;
    private roomInput: HTMLInputElement | null;
    private usernameInput: HTMLInputElement | null;
    private chatEl: HTMLElement | null;
    private messageInput: HTMLInputElement | null;
    private sendMsgBtn: HTMLButtonElement | null;
    private userListEl: HTMLElement | null;
    private joinFormEl: HTMLElement | null;
    private chatAreaEl: HTMLElement | null;

    private ws: WebSocket | null = null;
    private currentRoom: string = '';
    private username: string = '';

    constructor() {
        this.panelEl = document.getElementById('multiplayer-panel');
        this.openBtn = document.getElementById('open-multiplayer-btn');
        this.closeBtn = document.getElementById('close-multiplayer-btn');
        this.joinBtn = document.getElementById('mp-join-btn') as HTMLButtonElement;
        this.roomInput = document.getElementById('mp-room-input') as HTMLInputElement;
        this.usernameInput = document.getElementById('mp-username-input') as HTMLInputElement;
        this.chatEl = document.getElementById('mp-chat');
        this.messageInput = document.getElementById('mp-message-input') as HTMLInputElement;
        this.sendMsgBtn = document.getElementById('mp-send-btn') as HTMLButtonElement;
        this.userListEl = document.getElementById('mp-user-list');
        this.joinFormEl = document.getElementById('mp-join-form');
        this.chatAreaEl = document.getElementById('mp-chat-area');

        this.bindEvents();
    }

    private bindEvents() {
        this.openBtn?.addEventListener('click', () => this.show());
        this.closeBtn?.addEventListener('click', () => this.hide());
        this.joinBtn?.addEventListener('click', () => this.joinRoom());
        this.sendMsgBtn?.addEventListener('click', () => this.sendMessage());
        this.messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    private show() {
        this.panelEl?.classList.remove('hidden');
        this.panelEl?.classList.add('flex');
    }

    private hide() {
        this.panelEl?.classList.add('hidden');
        this.panelEl?.classList.remove('flex');
    }

    private joinRoom() {
        const room = this.roomInput?.value.trim();
        const username = this.usernameInput?.value.trim();
        if (!room || !username) return;

        this.currentRoom = room;
        this.username = username;

        const wsUrl = `ws://${window.location.hostname}:3001`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.ws!.send(JSON.stringify({ type: 'join', room, username }));
        };

        this.ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            this.handleIncoming(msg);
        };

        this.ws.onclose = () => {
            this.appendSystemMessage('Disconnected from room.');
        };
    }

    private handleIncoming(msg: any) {
        if (msg.type === 'joined') {
            // Switch to chat view
            if (this.joinFormEl) this.joinFormEl.classList.add('hidden');
            if (this.chatAreaEl) this.chatAreaEl.classList.remove('hidden');
            this.appendSystemMessage(`You joined room "${this.currentRoom}" as ${this.username}`);
            this.updateUserList(msg.users);
        }

        if (msg.type === 'system') {
            this.appendSystemMessage(msg.text);
            if (msg.users) this.updateUserList(msg.users);
        }

        if (msg.type === 'chat') {
            this.appendChatMessage(msg.username, msg.text, false);
        }
    }

    private sendMessage() {
        const text = this.messageInput?.value.trim();
        if (!text || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({ type: 'chat', text }));
        this.appendChatMessage(this.username, text, true);
        if (this.messageInput) this.messageInput.value = '';
    }

    private appendChatMessage(user: string, text: string, isSelf: boolean) {
        if (!this.chatEl) return;
        const div = document.createElement('div');
        div.className = `flex flex-col ${isSelf ? 'items-end' : 'items-start'} mb-2`;
        div.innerHTML = `
            <span class="text-xs text-zinc-500 mb-0.5">${isSelf ? 'You' : user}</span>
            <div class="text-xs px-3 py-2 rounded-lg max-w-[80%] ${isSelf ? 'bg-blue-600/30 text-blue-100' : 'bg-zinc-800 text-zinc-200'}">${text}</div>
        `;
        this.chatEl.appendChild(div);
        this.chatEl.scrollTop = this.chatEl.scrollHeight;
    }

    private appendSystemMessage(text: string) {
        if (!this.chatEl) return;
        const div = document.createElement('div');
        div.className = 'text-center text-xs text-zinc-600 italic my-1';
        div.textContent = text;
        this.chatEl.appendChild(div);
        this.chatEl.scrollTop = this.chatEl.scrollHeight;
    }

    private updateUserList(users: string[]) {
        if (!this.userListEl) return;
        this.userListEl.innerHTML = users.map(u =>
            `<span class="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">${u}</span>`
        ).join('');
    }
}
