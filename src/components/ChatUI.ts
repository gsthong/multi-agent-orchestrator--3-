import { marked } from 'marked';
import { StorageUtils, Message } from '../utils/storage';
import { GeminiAPI } from '../api/gemini';

export class ChatUI {
    private containerEl: HTMLElement | null;
    private inputEl: HTMLTextAreaElement | null;
    private sendBtn: HTMLButtonElement | null;
    private isProcessing: boolean = false;

    constructor() {
        this.containerEl = document.getElementById('chat-container');
        this.inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

        // Configure marked to use standard GitHub flavored markdown features
        marked.setOptions({
            breaks: true, // Convert \n to <br>
            gfm: true, // Use GitHub Flavored Markdown
        });

        this.init();
        this.bindEvents();
    }

    private init() {
        // Load initial history
        const history = StorageUtils.getHistory();
        if (history.messages.length > 0) {
            this.renderHistory(history.messages);
        } else {
            this.showWelcomeMessage();
        }
    }

    private bindEvents() {
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.handleSend());
        }

        if (this.inputEl) {
            // Auto-resize textarea logic
            this.inputEl.addEventListener('input', () => {
                this.inputEl!.style.height = 'auto'; // Reset height
                this.inputEl!.style.height = `${this.inputEl!.scrollHeight}px`; // Set to scroll height
            });

            // Handle Enter key (Shift+Enter for newline)
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            });
        }
    }

    private async handleSend() {
        if (!this.inputEl || this.isProcessing) return;

        const text = this.inputEl.value.trim();
        if (!text) return;

        // Reset input
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';

        // 1. Add user message visually
        this.appendMessage('user', text);

        // 2. Save user message to history
        this.saveMessageToHistory('user', text);

        this.isProcessing = true;
        this.updateUIState();

        // 3. Show typing indicator and create a target element for streaming
        const typingId = this.showTypingIndicator();
        let currentModelResponse = '';
        const contentElementId = `model-msg-${Date.now()}`;

        // Create the empty model bubble ready to accept stream
        this.createEmptyModelBubble(contentElementId);
        const contentElement = document.getElementById(contentElementId);

        try {
            const history = StorageUtils.getHistory();
            const currentPersona = history.persona || 'assistant';

            // 4. Send request and handle stream output
            currentModelResponse = await GeminiAPI.sendMessageStream(
                text,
                currentPersona,
                (textChunk) => {
                    // Remove typing indicator on first token
                    const typingEl = document.getElementById(typingId);
                    if (typingEl) typingEl.remove();

                    // Render accumulated markdown chunk in real-time
                    if (contentElement) {
                        // We re-parse the entire accumulated response to handle markdown blocks
                        // If performance drops, this is an area you optimize, but marked is fast
                        contentElement.innerHTML = marked.parse(currentModelResponse + textChunk) as string;
                        this.scrollToBottom();
                    }
                },
                (errorMsg) => {
                    const typingEl = document.getElementById(typingId);
                    if (typingEl) typingEl.remove();
                    this.showErrorBubble(errorMsg);
                }
            );

            // 5. Stream complete, format finally and save history
            if (contentElement && currentModelResponse) {
                contentElement.innerHTML = marked.parse(currentModelResponse) as string;
                this.saveMessageToHistory('model', currentModelResponse);
            }

        } catch (e) {
            // General error catch (e.g network down completely)
            console.error(e);
            // Ensure typing is hidden
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();

            // If no response was recorded, we show generic network error
            if (!currentModelResponse) {
                this.showErrorBubble("A network error occurred connecting to the AI.");
            }
        } finally {
            this.isProcessing = false;
            this.updateUIState();
            // Refocus input
            this.inputEl?.focus();
        }
    }

    // --- UI Helpers below ---

    public clearMessages() {
        if (this.containerEl) {
            this.containerEl.innerHTML = '';
            this.showWelcomeMessage();
        }
    }

    private saveMessageToHistory(role: 'user' | 'model', text: string) {
        const history = StorageUtils.getHistory();
        history.messages.push({ role, parts: [{ text }] });
        StorageUtils.saveHistory(history);
    }

    private renderHistory(messages: Message[]) {
        if (!this.containerEl) return;
        this.containerEl.innerHTML = ''; // clear first

        messages.forEach(msg => {
            this.appendMessage(msg.role, msg.parts[0].text);
        });

        this.scrollToBottom();
    }

    private showWelcomeMessage() {
        this.appendMessage('model', "Hello! I am your AI Assistant. How can I help you today?");
    }

    private appendMessage(role: 'user' | 'model', text: string) {
        if (!this.containerEl) return;

        const wrapper = document.createElement('div');
        wrapper.className = `flex flex-col gap-1 w-full ${role === 'user' ? 'items-end' : 'items-start'}`;

        // Header (User or Agent)
        const header = document.createElement('span');
        header.className = "text-xs font-medium text-zinc-500 flex items-center gap-1 mb-1";

        // Avatar icons
        let iconSvg = '';
        if (role === 'user') {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            header.innerHTML = `${iconSvg} USER`;
        } else {
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>`;
            header.innerHTML = `${iconSvg} AGENT`;
        }

        // Bubble Styles
        const bubbleWrapper = document.createElement('div');

        if (role === 'user') {
            bubbleWrapper.className = "text-sm p-3 rounded-lg border max-w-[85%] whitespace-pre-wrap bg-blue-600/20 border-blue-500/30 text-blue-50";
            bubbleWrapper.textContent = text; // User input is raw text, no markdown translation needed.
        } else {
            bubbleWrapper.className = "text-sm p-4 rounded-lg border max-w-[90%] w-full bg-zinc-900/80 border-zinc-800/80 prose prose-invert break-words";
            // Agent output uses marked library to render HTML from markdown
            bubbleWrapper.innerHTML = marked.parse(text) as string;
        }

        wrapper.appendChild(header);
        wrapper.appendChild(bubbleWrapper);
        this.containerEl.appendChild(wrapper);

        this.scrollToBottom();
    }

    // Creates the container structure that holds the incoming stream
    private createEmptyModelBubble(id: string) {
        if (!this.containerEl) return;

        const wrapper = document.createElement('div');
        wrapper.className = "flex flex-col gap-1 w-full items-start animate-fade-in";

        const header = document.createElement('span');
        header.className = "text-xs font-medium text-zinc-500 flex items-center gap-1 mb-1";
        header.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg> AGENT`;

        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.id = id; // Give ID so we can target innerHTML during stream
        bubbleWrapper.className = "text-sm p-4 rounded-lg border max-w-[90%] w-full bg-zinc-900/80 border-zinc-800/80 prose prose-invert break-words";

        wrapper.appendChild(header);
        wrapper.appendChild(bubbleWrapper);
        this.containerEl.appendChild(wrapper);
    }

    // Display a distinct red error bubble instead of just console logging
    private showErrorBubble(msg: string) {
        if (!this.containerEl) return;

        const wrapper = document.createElement('div');
        wrapper.className = `flex flex-col gap-1 w-full items-start mb-4`;

        const bubble = document.createElement('div');
        bubble.className = "text-sm p-3 rounded-lg border max-w-[85%] whitespace-pre-wrap bg-red-500/10 border-red-500/30 text-red-400 font-medium flex gap-2 items-center";

        bubble.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ${msg}`;

        wrapper.appendChild(bubble);
        this.containerEl.appendChild(wrapper);
        this.scrollToBottom();
    }

    // Display UI "AI is typing..."
    private showTypingIndicator(): string {
        if (!this.containerEl) return '';

        const id = `typing-${Date.now()}`;
        const wrapper = document.createElement('div');
        wrapper.id = id;
        wrapper.className = "flex items-center gap-2 text-xs font-medium text-emerald-400 my-2 px-2 animate-pulse";

        wrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> AI is typing...`;

        this.containerEl.appendChild(wrapper);
        this.scrollToBottom();
        return id;
    }

    private updateUIState() {
        if (this.sendBtn) {
            this.sendBtn.disabled = this.isProcessing;
        }
        if (this.inputEl) {
            this.inputEl.disabled = this.isProcessing;
        }
    }

    private scrollToBottom() {
        if (this.containerEl) {
            this.containerEl.scrollTop = this.containerEl.scrollHeight;
        }
    }
}
