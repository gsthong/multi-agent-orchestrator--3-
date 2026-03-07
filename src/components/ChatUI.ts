import { StorageUtils, Message } from '../utils/storage';
import { OrchestratorAPI } from '../api/orchestrator';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-latex';
import 'prismjs/themes/prism-tomorrow.css'; // Dark theme

export class ChatUI {
    private containerEl: HTMLElement | null;
    private inputEl: HTMLTextAreaElement | null;
    private sendBtn: HTMLButtonElement | null;
    private micBtn: HTMLButtonElement | null;
    private isProcessing: boolean = false;
    private recognition: any = null;
    private isListening: boolean = false;
    private markdownWorker: Worker;

    constructor() {
        this.containerEl = document.getElementById('chat-container');
        this.inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
        this.micBtn = document.getElementById('mic-btn') as HTMLButtonElement;

        // Initialize Web Worker for Markdown Parsing
        this.markdownWorker = new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), { type: 'module' });
        this.markdownWorker.onmessage = (e: MessageEvent) => {
            const { id, html } = e.data;
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = html;
                this.scrollToBottom();
                Prism.highlightAllUnder(element);
            }
        };

        this.init();
        this.bindEvents();
        this.bindGlobalDelegation();
    }

    private bindGlobalDelegation() {
        if (!this.containerEl) return;

        this.containerEl.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const copyBtn = target.closest('.copy-code-btn') as HTMLButtonElement | null;
            if (copyBtn) {
                const codeToCopy = copyBtn.getAttribute('data-code');
                if (codeToCopy) {
                    navigator.clipboard.writeText(codeToCopy).then(() => {
                        const originalHtml = copyBtn.innerHTML;
                        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400"><polyline points="20 6 9 17 4 12"></polyline></svg> <span class="text-green-400">Copied!</span>`;
                        setTimeout(() => {
                            copyBtn.innerHTML = originalHtml;
                        }, 2000);
                    }).catch(err => {
                        console.error("Failed to copy text: ", err);
                    });
                }
            }
        });
    }

    private init() {
        // Load initial history
        const history = StorageUtils.getHistory();
        if (history.messages.length > 0) {
            this.renderHistory(history.messages);
        } else {
            this.showWelcomeMessage();
        }

        this.initSpeechRecognition();
    }

    private initSpeechRecognition() {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = navigator.language || 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                if (this.micBtn) this.micBtn.classList.add('text-red-500', 'animate-pulse');
            };

            this.recognition.onresult = (event: any) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }

                if (this.inputEl && finalTranscript) {
                    this.inputEl.value += (this.inputEl.value && !this.inputEl.value.endsWith(' ') ? ' ' : '') + finalTranscript;
                    this.inputEl.dispatchEvent(new Event('input'));
                }
            };

            this.recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                this.stopListening();
            };

            this.recognition.onend = () => {
                this.stopListening();
            };
        } else {
            if (this.micBtn) this.micBtn.style.display = 'none';
            console.warn("Speech Recognition not supported in this browser.");
        }
    }

    private toggleListening() {
        if (!this.recognition) return;
        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    private stopListening() {
        this.isListening = false;
        if (this.micBtn) this.micBtn.classList.remove('text-red-500', 'animate-pulse');
    }

    private speakText(text: string, buttonEl: HTMLElement) {
        if (!('speechSynthesis' in window)) return;

        window.speechSynthesis.cancel();

        const plainText = text
            .replace(/[#*_~`>]/g, '')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

        const utterance = new SpeechSynthesisUtterance(plainText);

        const originalHtml = buttonEl.innerHTML;
        buttonEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-pulse text-blue-400"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

        utterance.onend = () => { buttonEl.innerHTML = originalHtml; };
        utterance.onerror = () => { buttonEl.innerHTML = originalHtml; };

        window.speechSynthesis.speak(utterance);
    }

    private bindEvents() {
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.handleSend());
        }

        if (this.micBtn) {
            this.micBtn.addEventListener('click', () => this.toggleListening());
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
            // 4. Send request and handle stream output
            currentModelResponse = await OrchestratorAPI.startDebate(
                text,
                (state, output) => {
                    this.updateTypingIndicatorState(typingId, state, output);
                },
                (textChunk) => {
                    // Update accordion title on first token from the FINAL agent
                    const typingSpinner = document.getElementById(`${typingId}-spinner`);
                    if (typingSpinner) typingSpinner.remove();

                    const typingTitle = document.getElementById(`${typingId}-title`);
                    if (typingTitle) {
                        typingTitle.textContent = "VIEW DEBATE MONOLOGUES (UNDER THE HOOD)";
                        typingTitle.className = "text-zinc-500";
                    }

                    // Render accumulated markdown chunk via Web Worker
                    if (contentElement) {
                        this.markdownWorker.postMessage({ id: contentElementId, text: currentModelResponse + textChunk });
                    }
                }
            );

            // 5. Stream complete, format finally and save history
            if (contentElement && currentModelResponse) {
                this.markdownWorker.postMessage({ id: contentElementId, text: currentModelResponse });
                this.saveMessageToHistory('model', currentModelResponse);

                const speakerBtn = document.getElementById(`speaker-btn-${contentElementId}`);
                if (speakerBtn) {
                    speakerBtn.classList.remove('hidden');
                    speakerBtn.addEventListener('click', () => this.speakText(currentModelResponse, speakerBtn));
                }
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
        const header = document.createElement('div');
        header.className = "text-xs font-medium text-zinc-500 flex items-center justify-between w-full mb-1";
        const titleSpan = document.createElement('span');
        titleSpan.className = "flex items-center gap-1";

        // Avatar icons
        if (role === 'user') {
            const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            titleSpan.innerHTML = `${iconSvg} USER`;
            header.appendChild(titleSpan);
        } else {
            const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>`;
            titleSpan.innerHTML = `${iconSvg} AGENT`;
            header.appendChild(titleSpan);

            const speakerBtn = document.createElement('button');
            speakerBtn.className = "hover:text-blue-400 transition ml-4 focus:outline-none";
            speakerBtn.title = "Read aloud";
            speakerBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
            speakerBtn.addEventListener('click', () => this.speakText(text, speakerBtn));
            header.appendChild(speakerBtn);
        }

        // Bubble Styles
        const bubbleWrapper = document.createElement('div');

        if (role === 'user') {
            bubbleWrapper.className = "text-sm p-3 rounded-lg border max-w-[85%] whitespace-pre-wrap bg-blue-600/20 border-blue-500/30 text-blue-50";
            bubbleWrapper.textContent = text; // User input is raw text, no markdown translation needed.
        } else {
            const bubbleId = `history-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            bubbleWrapper.id = bubbleId;
            bubbleWrapper.className = "text-sm p-4 rounded-lg border max-w-[90%] w-full bg-zinc-900/80 border-zinc-800/80 prose prose-invert break-words";
            // Request html from web worker
            bubbleWrapper.innerHTML = '<span class="text-zinc-500 animate-pulse">Rendering...</span>';
            this.markdownWorker.postMessage({ id: bubbleId, text });
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

        const header = document.createElement('div');
        header.className = "text-xs font-medium text-zinc-500 flex items-center justify-between w-full mb-1";

        const titleSpan = document.createElement('span');
        titleSpan.className = "flex items-center gap-1";
        titleSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg> AGENT`;
        header.appendChild(titleSpan);

        const speakerBtn = document.createElement('button');
        speakerBtn.id = `speaker-btn-${id}`;
        speakerBtn.className = "hover:text-blue-400 transition ml-4 focus:outline-none hidden";
        speakerBtn.title = "Read aloud";
        speakerBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        header.appendChild(speakerBtn);

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
        const wrapper = document.createElement('details');
        wrapper.id = id;
        wrapper.className = "w-full my-4 bg-zinc-900/40 border border-zinc-800/50 rounded-lg overflow-hidden";
        // Auto-open so users see the debate happening in real time
        wrapper.open = true;

        wrapper.innerHTML = `
            <summary class="px-4 py-3 cursor-pointer text-xs font-medium text-emerald-400 flex items-center gap-2 outline-none hover:bg-zinc-800/50 transition">
                <svg id="${id}-spinner" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> 
                <span id="${id}-title" class="tracking-wide">MULTI-AGENT DEBATE INITIALIZING...</span>
            </summary>
            <div id="${id}-states" class="p-4 border-t border-zinc-800/50 text-sm font-mono flex flex-col gap-4 text-zinc-300">
               <!-- States injected dynamically -->
            </div>
        `;

        this.containerEl.appendChild(wrapper);
        this.scrollToBottom();
        return id;
    }

    private updateTypingIndicatorState(typingId: string, state: string, output?: string) {
        const stateContainer = document.getElementById(`${typingId}-states`);
        if (!stateContainer) return;

        if (state.endsWith('_done')) {
            const agent = state.replace('_done', '');
            const contentBox = document.getElementById(`${typingId}-${agent}-content`);
            const dot = document.getElementById(`${typingId}-${agent}-dot`);

            if (dot) dot.classList.remove('animate-ping');
            if (contentBox && output) {
                // Populate the agent monologue
                contentBox.textContent = output;
                this.scrollToBottom();
            }
            return;
        }

        let iconColor = 'bg-blue-500';
        let msg = '';

        switch (state) {
            case 'gemini': iconColor = 'bg-blue-500'; msg = 'Gemini Initializing Foundational Architecture...'; break;
            case 'deepseek': iconColor = 'bg-orange-500'; msg = 'DeepSeek running Logical Critiques...'; break;
            case 'qwen': iconColor = 'bg-purple-500'; msg = 'Qwen analyzing Engineering constraints...'; break;
            case 'mixtral': iconColor = 'bg-emerald-500'; msg = 'Mixtral proposing Creative Alternatives...'; break;
            case 'gemma': iconColor = 'bg-yellow-500'; msg = 'Gemma restructuring into strict Markdown & LaTeX...'; break;
            case 'llama': iconColor = 'bg-rose-500'; msg = 'Llama-Prime Synthesizing Final Output...'; break;
        }

        // Add the new state visually
        const stateRow = document.createElement('div');
        stateRow.className = "flex flex-col gap-2 animate-fade-in";
        stateRow.innerHTML = `
            <div class="flex items-center gap-3 text-[12px] opacity-90">
                <div id="${typingId}-${state}-dot" class="h-1.5 w-1.5 ${iconColor} rounded-full animate-ping"></div>
                <span class="text-zinc-300 font-semibold">${msg}</span>
            </div>
            <div id="${typingId}-${state}-content" class="pl-5 border-l-2 border-zinc-800 ml-[3px] text-zinc-400 whitespace-pre-wrap text-xs"></div>
        `;

        // Fade previous rows slightly
        Array.from(stateContainer.children).forEach(child => {
            child.classList.add('opacity-70');
        });

        stateContainer.appendChild(stateRow);
        this.scrollToBottom();
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
