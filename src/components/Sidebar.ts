import { StorageUtils } from '../utils/storage';
import { ChatUI } from './ChatUI';

export class Sidebar {
    private sidebarEl: HTMLElement | null;
    private openBtn: HTMLElement | null;
    private closeBtn: HTMLElement | null;
    private newChatBtn: HTMLButtonElement | null;
    private clearBtn: HTMLButtonElement | null;
    private personaSelect: HTMLSelectElement | null;
    private titleEl: HTMLElement | null;

    private chatUI: ChatUI;

    constructor(chatUI: ChatUI) {
        this.sidebarEl = document.getElementById('sidebar');
        this.openBtn = document.getElementById('open-sidebar-btn');
        this.closeBtn = document.getElementById('close-sidebar-btn');
        this.newChatBtn = document.getElementById('new-chat-btn') as HTMLButtonElement;
        this.clearBtn = document.getElementById('clear-history-btn') as HTMLButtonElement;
        this.personaSelect = document.getElementById('persona-selector') as HTMLSelectElement;
        this.titleEl = document.getElementById('mobile-header-title');

        this.chatUI = chatUI;

        this.init();
        this.bindEvents();
    }

    private init() {
        // Load saved persona on initialization
        const history = StorageUtils.getHistory();
        if (this.personaSelect && history.persona) {
            this.personaSelect.value = history.persona;
            this.updateTitle();
        }
    }

    private bindEvents() {
        // Mobile sidebar toggles
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => this.toggleSidebar(true));
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.toggleSidebar(false));
        }

        // New Chat / Clear History actions
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => this.handleClearHistory());
        }

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.handleClearHistory());
        }

        // Persona change
        if (this.personaSelect) {
            this.personaSelect.addEventListener('change', () => {
                const newPersona = this.personaSelect!.value;
                const history = StorageUtils.getHistory();
                history.persona = newPersona;
                StorageUtils.saveHistory(history);

                this.updateTitle();
            });
        }
    }

    private handleClearHistory() {
        if (confirm('Are you sure you want to clear the conversation history?')) {
            StorageUtils.clearHistory();
            this.chatUI.clearMessages();
        }
    }

    private updateTitle() {
        if (this.titleEl && this.personaSelect) {
            const selectedText = this.personaSelect.options[this.personaSelect.selectedIndex].text;
            this.titleEl.textContent = selectedText;
        }
    }

    private toggleSidebar(isOpen: boolean) {
        if (!this.sidebarEl) return;

        // Tailwind classes logic for translated states
        if (isOpen) {
            this.sidebarEl.classList.remove('-translate-x-full');
            this.sidebarEl.classList.add('translate-x-0');
        } else {
            this.sidebarEl.classList.add('-translate-x-full');
            this.sidebarEl.classList.remove('translate-x-0');
        }
    }
}
