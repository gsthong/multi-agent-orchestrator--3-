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
    private themeToggleBtn: HTMLButtonElement | null;
    private historyListEl: HTMLElement;

    private chatUI: ChatUI;

    constructor(chatUI: ChatUI) {
        this.sidebarEl = document.getElementById('sidebar');
        this.openBtn = document.getElementById('open-sidebar-btn');
        this.closeBtn = document.getElementById('close-sidebar-btn');
        this.newChatBtn = document.getElementById('new-chat-btn') as HTMLButtonElement;
        this.clearBtn = document.getElementById('clear-history-btn') as HTMLButtonElement;
        this.personaSelect = document.getElementById('persona-selector') as HTMLSelectElement;
        this.titleEl = document.getElementById('mobile-header-title');
        this.themeToggleBtn = document.getElementById('theme-toggle-btn') as HTMLButtonElement;

        // Ensure you have a container for the list. If it doesn't exist, we create it dynamically.
        let historyContainer = document.getElementById('session-history-list');
        if (!historyContainer) {
            historyContainer = document.createElement('div');
            historyContainer.id = 'session-history-list';
            historyContainer.className = 'mt-4 flex flex-col gap-2 relative';
            // Insert it above the History Actions section
            const actionsLabel = document.querySelector('.mb-6:last-of-type') || this.clearBtn?.parentElement;
            if (actionsLabel) actionsLabel.insertAdjacentElement('beforebegin', historyContainer);
        }
        this.historyListEl = historyContainer;

        this.chatUI = chatUI;

        this.init();
        this.bindEvents();
    }

    private async init() {
        // Load Theme
        const theme = StorageUtils.getTheme();
        this.applyTheme(theme);

        // Initial render of history
        await this.renderHistoryList();

        // Sync title with active session
        const activeSession = await StorageUtils.getActiveHistory();
        if (this.personaSelect && activeSession.persona) {
            this.personaSelect.value = activeSession.persona;
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

        // New Chat 
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', async () => {
                const newSession = await StorageUtils.createNewSession(this.personaSelect?.value || 'assistant');
                await this.chatUI.loadSession(newSession.id);
                await this.renderHistoryList();
            });
        }

        // Clear History
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.handleClearHistory());
        }

        // Listen for async title updates from ChatUI
        window.addEventListener('session-title-updated', async () => {
            await this.renderHistoryList();
        });

        // Persona change
        if (this.personaSelect) {
            this.personaSelect.addEventListener('change', async () => {
                const newPersona = this.personaSelect!.value;
                const session = await StorageUtils.getActiveHistory();
                session.persona = newPersona;
                await StorageUtils.saveSession(session);

                this.updateTitle();
            });
        }

        // Theme Toggle
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => {
                const currentTheme = StorageUtils.getTheme();
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                this.applyTheme(newTheme);
            });
        }
    }

    private async renderHistoryList() {
        if (!this.historyListEl) return;
        this.historyListEl.innerHTML = '';

        const sessions = await StorageUtils.getSessions();
        const currentActiveId = StorageUtils.getCurrentSessionId();

        if (sessions.length === 0) {
            this.historyListEl.innerHTML = `<div class="text-xs text-zinc-500 italic p-2">No chat history.</div>`;
            return;
        }

        sessions.forEach(session => {
            const isActive = session.id === currentActiveId;
            const item = document.createElement('div');
            item.className = `group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-300 transform hover:scale-[1.02] ${isActive ? 'bg-zinc-800 text-zinc-100 shadow-lg border border-zinc-700/50' : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 border border-transparent'}`;

            // Truncate title
            const titleSpan = document.createElement('span');
            titleSpan.className = 'text-sm truncate mr-2 w-full';
            titleSpan.textContent = session.title || 'New Chat';
            titleSpan.addEventListener('click', async () => {
                if (!isActive) {
                    await this.chatUI.loadSession(session.id);
                    // Sync persona selector if it changed
                    if (this.personaSelect && session.persona) {
                        this.personaSelect.value = session.persona;
                        this.updateTitle();
                    }
                    await this.renderHistoryList();
                }
            });

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = `opacity-0 group-hover:opacity-100 transition text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-700/50 ${isActive ? '' : 'hidden'}`;
            delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
            delBtn.title = "Delete Chat";

            // Also show delete button if hovering over the row, even if not active
            item.addEventListener('mouseenter', () => delBtn.classList.remove('hidden'));
            item.addEventListener('mouseleave', () => { if (!isActive) delBtn.classList.add('hidden'); });

            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Delete this chat session?')) {
                    await StorageUtils.deleteSession(session.id);
                    // If we deleted the active one, pick whatever is active now
                    const newActiveId = StorageUtils.getCurrentSessionId();
                    if (newActiveId) {
                        await this.chatUI.loadSession(newActiveId);
                    } else {
                        // Create a new one
                        const fresh = await StorageUtils.createNewSession(this.personaSelect?.value);
                        await this.chatUI.loadSession(fresh.id);
                    }
                    await this.renderHistoryList();
                }
            });

            item.appendChild(titleSpan);
            item.appendChild(delBtn);
            this.historyListEl.appendChild(item);
        });
    }

    private applyTheme(theme: 'dark' | 'light') {
        const htmlEl = document.documentElement;
        StorageUtils.saveTheme(theme);

        if (theme === 'dark') {
            htmlEl.classList.add('dark');
        } else {
            htmlEl.classList.remove('dark');
        }

        if (this.themeToggleBtn) {
            const darkIcon = document.getElementById('theme-icon-dark');
            const lightIcon = document.getElementById('theme-icon-light');
            const textSpan = document.getElementById('theme-text');

            if (theme === 'dark') {
                darkIcon?.classList.replace('hidden', 'block');
                lightIcon?.classList.replace('block', 'hidden');
                if (textSpan) textSpan.textContent = 'Light Mode';
            } else {
                darkIcon?.classList.replace('block', 'hidden');
                lightIcon?.classList.replace('hidden', 'block');
                if (textSpan) textSpan.textContent = 'Dark Mode';
            }
        }
    }

    private async handleClearHistory() {
        if (confirm('Are you sure you want to delete ALL chat sessions? This cannot be undone.')) {
            const sessions = await StorageUtils.getSessions();
            for (const s of sessions) {
                await StorageUtils.deleteSession(s.id);
            }

            const fresh = await StorageUtils.createNewSession(this.personaSelect?.value);
            await this.chatUI.loadSession(fresh.id);
            await this.renderHistoryList();
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
