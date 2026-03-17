import { StorageUtils, Message } from '../utils/storage';
import { OrchestratorAPI } from '../api/orchestrator';
import { ScreenShareUI } from './ScreenShareUI';
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
    private isAgentSpeaking: boolean = false;
    private activeAudioSource: AudioBufferSourceNode | null = null;
    private markdownWorker: Worker;
    private pythonWorker: Worker;

    // File Attachments State
    private fileInputEl: HTMLInputElement | null;
    private attachBtn: HTMLButtonElement | null;
    private attachmentsContainer: HTMLElement | null;
    private audioContext: AudioContext | null = null;
    private pendingFiles: { name: string, content: string }[] = [];
    private screenShare: ScreenShareUI | null = null;
    private pendingPythonExecutions: Map<string, { resolve: (val: string) => void, reject: (err: any) => void, output: string }> = new Map();

    constructor(screenShare?: ScreenShareUI) {
        this.screenShare = screenShare || null;
        this.containerEl = document.getElementById('chat-container');
        this.inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
        this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
        this.micBtn = document.getElementById('mic-btn') as HTMLButtonElement;
        this.fileInputEl = document.getElementById('file-upload-input') as HTMLInputElement;
        this.attachBtn = document.getElementById('attach-file-btn') as HTMLButtonElement;
        this.attachmentsContainer = document.getElementById('file-attachments-container');

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

        this.pythonWorker = new Worker(new URL('../workers/python.worker.ts', import.meta.url), { type: 'module' });
        this.pythonWorker.onmessage = (e: MessageEvent) => {
            const { id, type, output } = e.data;

            if (this.pendingPythonExecutions.has(id)) {
                const exec = this.pendingPythonExecutions.get(id)!;
                if (type === 'stdout' || type === 'stderr') {
                    exec.output += output + '\n';
                } else if (type === 'error') {
                    exec.output += 'ERROR: ' + output + '\n';
                    exec.resolve(exec.output);
                    this.pendingPythonExecutions.delete(id);
                } else if (type === 'done') {
                    exec.resolve(exec.output || 'Execution completed with no output.');
                    this.pendingPythonExecutions.delete(id);
                }
                return;
            }

            const outputEl = document.getElementById(id);
            if (!outputEl) return;

            if (type === 'stdout') {
                const div = document.createElement('div');
                div.textContent = output;
                outputEl.appendChild(div);
            } else if (type === 'stderr' || type === 'error') {
                const div = document.createElement('div');
                div.className = 'text-red-400';
                div.textContent = output;
                outputEl.appendChild(div);
            } else if (type === 'done') {
                const div = document.createElement('div');
                div.className = 'text-zinc-500 italic mt-1';
                div.textContent = 'Execution completed.';
                outputEl.appendChild(div);
                this.scrollToBottom();
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

            // Handle Copy Buttons
            const copyBtn = target.closest('.copy-code-btn') as HTMLButtonElement | null;
            if (copyBtn) {
                const codeToCopy = copyBtn.getAttribute('data-code');
                if (codeToCopy) {
                    // Unescape the HTML character entities before copying
                    const unescapedCode = codeToCopy
                        .replace(/&amp;/g, "&")
                        .replace(/&lt;/g, "<")
                        .replace(/&gt;/g, ">")
                        .replace(/&quot;/g, "\"")
                        .replace(/&#039;/g, "'");

                    navigator.clipboard.writeText(unescapedCode).then(() => {
                        const originalHtml = copyBtn.innerHTML;
                        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400"><polyline points="20 6 9 17 4 12"></polyline></svg> <span class="text-green-400">Copied!</span>`;
                        setTimeout(() => copyBtn.innerHTML = originalHtml, 2000);
                    }).catch(err => console.error("Failed to copy text: ", err));
                }
            }

            // Handle Run Code Buttons
            const runBtn = target.closest('.run-code-btn') as HTMLButtonElement | null;
            if (runBtn) {
                const codeToRun = runBtn.getAttribute('data-code');
                const lang = runBtn.getAttribute('data-lang');
                if (codeToRun && lang) {
                    // Unescape
                    const code = codeToRun
                        .replace(/&amp;/g, "&")
                        .replace(/&lt;/g, "<")
                        .replace(/&gt;/g, ">")
                        .replace(/&quot;/g, "\"")
                        .replace(/&#039;/g, "'");

                    let outputContainer = runBtn.closest('.code-block-wrapper')?.querySelector('.terminal-output') as HTMLElement;
                    if (!outputContainer) {
                        outputContainer = document.createElement('div');
                        outputContainer.className = 'terminal-output bg-black text-green-400 font-mono text-sm p-4 border-t border-zinc-800 max-h-64 overflow-y-auto w-full block whitespace-pre-wrap';
                        runBtn.closest('.code-block-wrapper')?.appendChild(outputContainer);
                    }

                    outputContainer.innerHTML = `<div class="text-zinc-500 italic">Initializing ${lang} environment...</div>`;
                    const execId = 'exec-' + Date.now();
                    outputContainer.id = execId;

                    if (lang === 'python') {
                        this.runPythonCode(code, execId);
                    } else if (lang === 'javascript') {
                        this.runJavaScriptCode(code, outputContainer);
                    } else if (lang === 'html') {
                        this.runHtmlCode(code, outputContainer);
                    }
                }
            }
        });
    }

    private async init() {
        // Load initial history based on active session
        const session = await StorageUtils.getActiveHistory();
        if (session.messages.length > 0) {
            this.renderHistory(session.messages);
        } else {
            this.showWelcomeMessage();
        }

        this.initSpeechRecognition();
    }

    public async loadSession(sessionId: string) {
        if (this.isProcessing) return; // Prevent switching while generating

        StorageUtils.setCurrentSessionId(sessionId);
        const session = await StorageUtils.getSession(sessionId);
        if (!session) return;

        await this.clearMessages(false); // Clear DOM only
        if (session.messages.length > 0) {
            this.renderHistory(session.messages);
        } else {
            this.showWelcomeMessage();
        }
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

    private async speakText(text: string, buttonEl: HTMLElement) {
        if (this.isAgentSpeaking) {
            // Stop current speech if any
            if (this.activeAudioSource) {
                this.activeAudioSource.stop();
                this.activeAudioSource = null;
            }
            window.speechSynthesis.cancel();
        }

        this.isAgentSpeaking = true;

        // Initialize AudioContext on first interaction
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioContext();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Start listening for interruptions
        this.startVoiceInterruptionDetection();

        const plainText = text
            .replace(/[#*_~`>]/g, '')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

        const originalHtml = buttonEl.innerHTML;
        buttonEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-pulse text-emerald-400"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

        try {
            // Read user's preferred TTS language from sidebar selector
            const ttsLang = (document.getElementById('tts-language-selector') as HTMLSelectElement)?.value || 'en-US';
            // Extract the 2-letter language code for Google TTS (e.g. "en-US" -> "en")
            const ttsLangShort = ttsLang.split('-')[0];

            // Using a free TTS API to get audio data so we can route it through Web Audio API
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(plainText.substring(0, 200))}&tl=${ttsLangShort}&client=tw-ob`;
            
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            // Spatialize the Audio
            const panner = this.audioContext.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.maxDistance = 10000;
            panner.rolloffFactor = 1;
            
            // Randomly pan the agent to the left or right to simulate a "room" debate
            const isLeft = Math.random() > 0.5;
            panner.setPosition(isLeft ? -3 : 3, 0, -1);

            source.connect(panner);
            panner.connect(this.audioContext.destination);

            this.activeAudioSource = source;

            source.onended = () => {
                buttonEl.innerHTML = originalHtml;
                this.isAgentSpeaking = false;
            };

            source.start(0);
        } catch (e) {
            console.error("Spatial Audio TTS Failed falling back to native:", e);
            // Fallback to native
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(plainText);
                const ttsLang = (document.getElementById('tts-language-selector') as HTMLSelectElement)?.value || 'en-US';
                utterance.lang = ttsLang;
                utterance.onend = () => { buttonEl.innerHTML = originalHtml; this.isAgentSpeaking = false; };
                utterance.onerror = () => { buttonEl.innerHTML = originalHtml; this.isAgentSpeaking = false; };
                window.speechSynthesis.speak(utterance);
            } else {
                buttonEl.innerHTML = originalHtml;
                this.isAgentSpeaking = false;
            }
        }
    }

    private async startVoiceInterruptionDetection() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Need a context to analyze
            if (!this.audioContext) {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                this.audioContext = new AudioContext();
            }

            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                if (!this.isAgentSpeaking) {
                    // Turn off mic stream when not speaking to save CPU/Privacy
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                // Threshold for interruption
                if (average > 35) { // Empirically, normal mic noise is <10, speaking is >40
                    this.handleInterruption();
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                requestAnimationFrame(checkVolume);
            };

            checkVolume();
        } catch (e) {
            console.warn("Could not start microphone for interruption detection:", e);
        }
    }

    private handleInterruption() {
        if (!this.isAgentSpeaking) return;

        console.log("VOICE INTERRUPTION DETECTED!");
        this.isAgentSpeaking = false;

        // Cut off audio
        if (this.activeAudioSource) {
            this.activeAudioSource.stop();
            this.activeAudioSource = null;
        }
        window.speechSynthesis.cancel();

        // Optionally visual feedback
        this.showErrorBubble("Process interrupted by user voice.");

        // Re-open mic for them to speak
        setTimeout(() => {
            this.toggleListening();
        }, 300);
    }

    private bindEvents() {
        if (this.sendBtn && this.inputEl) {
            this.sendBtn.addEventListener('click', () => this.handleSend());
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            });

            // Auto-resize textarea
            this.inputEl.addEventListener('input', () => {
                this.inputEl!.style.height = 'auto';
                this.inputEl!.style.height = (this.inputEl!.scrollHeight) + 'px';
            });
        }

        if (this.micBtn) {
            this.micBtn.addEventListener('click', () => this.toggleListening());
        }

        if (this.attachBtn && this.fileInputEl) {
            this.attachBtn.addEventListener('click', () => {
                this.fileInputEl?.click();
            });

            this.fileInputEl.addEventListener('change', async (e) => {
                const target = e.target as HTMLInputElement;
                if (!target.files || target.files.length === 0) return;

                for (let i = 0; i < target.files.length; i++) {
                    const file = target.files[i];
                    try {
                        const content = await this.readFileAsText(file);
                        this.pendingFiles.push({ name: file.name, content });
                    } catch (err) {
                        console.error(`Error reading file ${file.name}:`, err);
                        alert(`Failed to read file ${file.name}. Ensure it is a text-based file.`);
                    }
                }

                // Clear the input so selecting the same file again triggers change
                target.value = '';
                this.renderAttachments();
            });
        }
    }

    private readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    private renderAttachments() {
        if (!this.attachmentsContainer) return;
        this.attachmentsContainer.innerHTML = '';

        this.pendingFiles.forEach((f, idx) => {
            const badge = document.createElement('div');
            badge.className = 'flex items-center gap-1 bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700';

            const nameEl = document.createElement('span');
            nameEl.className = 'truncate max-w-[120px]';
            nameEl.textContent = f.name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'text-zinc-500 hover:text-red-400 focus:outline-none';
            removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            removeBtn.onclick = () => {
                this.pendingFiles.splice(idx, 1);
                this.renderAttachments();
            };

            badge.appendChild(nameEl);
            badge.appendChild(removeBtn);
            this.attachmentsContainer!.appendChild(badge);
        });
    }

    private async handleSend() {
        if (!this.inputEl || this.isProcessing) return;

        const text = this.inputEl.value.trim();
        if (!text && this.pendingFiles.length === 0) return;

        // Compile file context
        let fileContextStr = "";
        let visualText = text;

        if (this.pendingFiles.length > 0) {
            fileContextStr = "### ATTACHED FILE CONTEXT ###\n";
            this.pendingFiles.forEach(f => {
                fileContextStr += `\n--- File: ${f.name} ---\n${f.content}\n`;
            });
            fileContextStr += "\n##############################\n\n";

            // Show attachments visually in the chat bubble
            const fileList = this.pendingFiles.map(f => `\`${f.name}\``).join(', ');
            visualText = text ? `${text}\n\n*(Attached: ${fileList})*` : `*(Attached files: ${fileList})*`;

            // Clear attachments from UI
            this.pendingFiles = [];
            this.renderAttachments();
        }

        // Reset input
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';

        // 1. Add user message visually
        this.appendMessage('user', visualText);

        // 2. Save user message to history
        await this.saveMessageToHistory('user', visualText);

        // 2.5 Generate title if this is the first message of a new session
        const session = await StorageUtils.getActiveHistory();
        if (session.messages.length === 1 && session.title === 'New Chat') {
            // Kick off background title generation, we don't wait for it
            OrchestratorAPI.generateTitle(text).then(async title => {
                const refreshedSession = await StorageUtils.getSession(session.id);
                if (refreshedSession) {
                    refreshedSession.title = title;
                    await StorageUtils.saveSession(refreshedSession);
                    // Emit event so sidebar can refresh it's list
                    window.dispatchEvent(new Event('session-title-updated'));
                }
            });
        }

        this.isProcessing = true;
        this.updateUIState();

        // Create the empty model bubble ready to accept stream
        // const contentElementId = `model-msg-${Date.now()}`; // This will be the typingId now
        // this.createEmptyModelBubble(contentElementId);
        // const contentElement = document.getElementById(contentElementId);

        let typingId = '';
        try {
            // Wait slightly for DOM to update
            await new Promise(resolve => setTimeout(resolve, 50));

            // Create typing indicator UI 
            typingId = this.showTypingIndicator();

            const onStateUpdate = (state: string, output?: string) => {
                this.updateTypingIndicatorState(typingId, state, output);
            };

            let firstChunk = true;
            let fullStreamText = '';

            const onFinalToken = (chunk: string) => {
                if (firstChunk) {
                    // Remove typing indicator on first real token
                    const el = document.getElementById(typingId);
                    if (el) el.remove();
                    this.createEmptyModelBubble(typingId); // Re-create as a normal bubble with the same ID
                    firstChunk = false;
                }
                fullStreamText += chunk;

                // Send chunk to Markdown Worker
                this.markdownWorker.postMessage({ id: typingId, text: fullStreamText });
            };

            // Read selected debate format
            const debateFormat = (document.getElementById('debate-format-selector') as HTMLSelectElement)?.value || 'standard';

            // Capture screen share frame if active
            let screenFrameBase64: string | null = null;
            if (this.screenShare?.isSharing()) {
                screenFrameBase64 = this.screenShare.getLatestFrame();
                if (screenFrameBase64) {
                    fileContextStr += `\n\n### SCREEN SHARE CONTEXT ###\nA screenshot of the user's screen has been captured. Analyze the screen content along with the user's prompt.\n[IMAGE_DATA:${screenFrameBase64}]\n###########################\n`;
                }
            }

            // Call the Orchestrator with fileContext included
            const finalResponse = await OrchestratorAPI.startDebate(
                text,
                fileContextStr,
                onStateUpdate,
                onFinalToken,
                this.executePythonHidden.bind(this),
                debateFormat,
                this.duckduckgoSearch.bind(this)
            );

            // 5. Stream complete, format finally and save history
            this.markdownWorker.postMessage({ id: typingId, text: finalResponse });
            await this.saveMessageToHistory('model', finalResponse);
            
            // 6. Background Concept Extraction
            OrchestratorAPI.extractMemoryGraph(`USER PROMPT:\n${text}\n\nAGENT DEBATE FINAL:\n${finalResponse}`);

            // 7. Fire webhooks with debate result (Feature 16)
            window.dispatchEvent(new CustomEvent('debate-complete', {
                detail: { prompt: text, result: finalResponse }
            }));

            const speakerBtn = document.getElementById(`speaker-btn-${typingId}`);
            if (speakerBtn) {
                speakerBtn.classList.remove('hidden');
                speakerBtn.addEventListener('click', () => this.speakText(finalResponse, speakerBtn));
            }

        } catch (e) {
            // General error catch (e.g network down completely)
            console.error(e);
            // Ensure typing is hidden
            if (typingId) {
                const typingEl = document.getElementById(typingId);
                if (typingEl) typingEl.remove();
            }

            this.showErrorBubble("A network error occurred connecting to the AI.");
        } finally {
            this.isProcessing = false;
            this.updateUIState();
            // Refocus input
            this.inputEl?.focus();
        }
    }

    // --- UI Helpers below ---

    public async generateAutoReport() {
        if (this.isProcessing) return;

        const session = await StorageUtils.getActiveHistory();
        if (session.messages.length === 0) {
            this.showErrorBubble("No chat history to summarize. Please start a debate first.");
            return;
        }

        this.isProcessing = true;
        this.updateUIState();

        const typingId = this.showTypingIndicator();
        this.updateTypingIndicatorState(typingId, 'gemma', 'Synthesizing Executive Report...');

        try {
            // Wait slightly for DOM to update
            await new Promise(resolve => setTimeout(resolve, 50));

            const transcript = session.messages.map(m => `${m.role.toUpperCase()}:\n${m.parts[0].text}`).join('\n\n');

            let firstChunk = true;
            let fullStreamText = '';

            const onFinalToken = (chunk: string) => {
                if (firstChunk) {
                    const el = document.getElementById(typingId);
                    if (el) el.remove();
                    this.createEmptyModelBubble(typingId);
                    firstChunk = false;
                }
                fullStreamText += chunk;
                this.markdownWorker.postMessage({ id: typingId, text: fullStreamText });
            };

            const report = await OrchestratorAPI.generateReport(transcript, onFinalToken);

            this.markdownWorker.postMessage({ id: typingId, text: report });
            await this.saveMessageToHistory('model', `**EXECUTIVE SUMMARY REPORT**\n\n${report}`);

            const speakerBtn = document.getElementById(`speaker-btn-${typingId}`);
            if (speakerBtn) {
                speakerBtn.classList.remove('hidden');
                speakerBtn.addEventListener('click', () => this.speakText(report, speakerBtn));
            }

        } catch (e: any) {
            console.error('Report Generation Error', e);
            const el = document.getElementById(typingId);
            if (el) el.remove();
            this.showErrorBubble(`Failed to generate report: ${e.message}`);
        } finally {
            this.isProcessing = false;
            this.updateUIState();
        }
    }

    public async clearMessages(createEmptySession: boolean = true) {
        if (this.containerEl) {
            this.containerEl.innerHTML = '';
            if (createEmptySession) {
                await StorageUtils.createNewSession();
            }
            this.showWelcomeMessage();
        }
    }

    private async saveMessageToHistory(role: 'user' | 'model', text: string) {
        const session = await StorageUtils.getActiveHistory();
        session.messages.push({ role, parts: [{ text }] });
        await StorageUtils.saveSession(session);
    }

    private renderHistory(messages: Message[]) {
        if (!this.containerEl) return;
        this.containerEl.innerHTML = ''; // clear first

        messages.forEach(msg => {
            this.appendMessage(msg.role, msg.parts[0].text);
        });

        this.scrollToBottom();
    }

    /**
     * Feature 11: Branch conversation from a specific message.
     * Forks the current session history up to (and including) the given user message
     * into a brand new session, making it the active one.
     */
    public async branchFromMessage(userMessageText: string) {
        const session = await StorageUtils.getActiveHistory();
        const messages = session.messages;

        // Find the last message index that matches the user input
        let cutIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user' && messages[i].parts[0].text === userMessageText) {
                cutIdx = i;
                break;
            }
        }

        if (cutIdx === -1) return;

        // Clone messages up to and including this user message
        const forkedMessages = messages.slice(0, cutIdx + 1);

        // Create a new branch session
        const branchedSession = await StorageUtils.createNewSession(session.persona);
        branchedSession.title = `🌿 Branch: ${userMessageText.substring(0, 30)}...`;
        branchedSession.messages = forkedMessages;
        await StorageUtils.saveSession(branchedSession);

        // Load the branch as the active session
        await this.loadSession(branchedSession.id);
        window.dispatchEvent(new Event('session-title-updated'));

        // Show a notification bubble
        this.showErrorBubble(`🌿 Branched! You're now in an alternate timeline. Continue from here.`);
    }

    private showWelcomeMessage() {
        this.appendMessage('model', "Hello! I am your AI Assistant. How can I help you today?");
    }

    private appendMessage(role: 'user' | 'model', text: string) {
        if (!this.containerEl) return;

        const wrapper = document.createElement('div');
        wrapper.className = `flex flex-col gap-1 w-full ${role === 'user' ? 'items-end' : 'items-start'} animate-slide-up`;

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
            bubbleWrapper.className = "text-sm p-3 rounded-lg border max-w-[85%] whitespace-pre-wrap bg-blue-600/20 shadow-lg shadow-blue-500/10 border-blue-500/30 text-blue-50 hover-glow transition-all";
            bubbleWrapper.textContent = text;
            
            // Branch button — forks a new session up to this message
            const branchBtn = document.createElement('button');
            branchBtn.className = 'mt-2 text-xs text-zinc-500 hover:text-emerald-400 transition flex items-center gap-1 opacity-0 group-hover/msg:opacity-100';
            branchBtn.title = 'Branch conversation from this point';
            branchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg> Branch here`;
            branchBtn.addEventListener('click', () => this.branchFromMessage(text));
            bubbleWrapper.appendChild(branchBtn);
        } else {
            const bubbleId = `history-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            bubbleWrapper.id = bubbleId;
            bubbleWrapper.className = "text-sm p-4 rounded-lg border max-w-[90%] w-full glass-panel prose prose-invert break-words hover-glow transition-all";
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
        wrapper.className = "flex flex-col gap-1 w-full items-start animate-slide-up";

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
        bubbleWrapper.className = "text-sm p-4 rounded-lg border max-w-[90%] w-full glass-panel prose prose-invert break-words hover-glow transition-all";

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
        wrapper.className = "w-full my-4 glass-panel rounded-lg overflow-hidden animate-slide-up shadow-xl shadow-black/50 hover-glow transition-all";
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

        if (state.endsWith('_chunk')) {
            const agent = state.replace('_chunk', '');
            const contentBox = document.getElementById(`${typingId}-${agent}-content`);
            if (contentBox && output) {
                contentBox.textContent += output;
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

    public scrollToBottom() {
        if (this.containerEl) {
            this.containerEl.scrollTop = this.containerEl.scrollHeight;
        }
    }

    private executePythonHidden(code: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const execId = 'exec-hidden-' + Date.now() + Math.random();
            this.pendingPythonExecutions.set(execId, { resolve, reject, output: '' });
            this.runPythonCode(code, execId);
        });
    }

    private runPythonCode(code: string, execId: string) {
        this.pythonWorker.postMessage({ id: execId, pythonCode: code });
    }

    private runHtmlCode(code: string, outputEl: HTMLElement) {
        outputEl.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'w-full rounded-md overflow-hidden border border-zinc-700 bg-white/5 mt-2';
        
        const header = document.createElement('div');
        header.className = 'bg-zinc-800/80 px-3 py-1 flex items-center justify-between text-xs text-zinc-400 font-mono';
        header.innerHTML = `<span>Generative UI Sandbox</span><div class="flex gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span><span class="w-2 h-2 rounded-full bg-yellow-500"></span><span class="w-2 h-2 rounded-full bg-green-500"></span></div>`;
        
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '400px';
        iframe.style.border = 'none';
        iframe.style.background = 'white'; // Default back to white for generic HTML renders
        
        // Inject some basic Tailwind from CDN just in case the agent tried to use it without importing
        const tailwindScript = `<script src="https://cdn.tailwindcss.com"></script>`;
        const hasTailwind = code.includes('tailwindcss.com');
        
        iframe.srcdoc = hasTailwind ? code : `${tailwindScript}\n${code}`;
        
        wrapper.appendChild(header);
        wrapper.appendChild(iframe);
        outputEl.appendChild(wrapper);
        this.scrollToBottom();
    }

    private runJavaScriptCode(code: string, outputEl: HTMLElement) {
        outputEl.innerHTML = `<div class="text-zinc-500 italic">Executing JavaScript...</div>`;
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';

        const id = 'iframe-' + Date.now();
        iframe.id = id;

        // Message listener for the iframe
        const listener = (e: MessageEvent) => {
            if (e.data.source === id) {
                if (e.data.type === 'log') {
                    const div = document.createElement('div');
                    div.textContent = e.data.args.join(' ');
                    outputEl.appendChild(div);
                } else if (e.data.type === 'error') {
                    const div = document.createElement('div');
                    div.className = 'text-red-400';
                    div.textContent = e.data.error;
                    outputEl.appendChild(div);
                } else if (e.data.type === 'done') {
                    const div = document.createElement('div');
                    div.className = 'text-zinc-500 italic mt-1';
                    div.textContent = 'Execution completed.';
                    outputEl.appendChild(div);
                    this.scrollToBottom();

                    window.removeEventListener('message', listener);
                    // Slight delay to ensure final logs are captured before cleanup
                    setTimeout(() => {
                        if (document.body.contains(iframe)) {
                            document.body.removeChild(iframe);
                        }
                    }, 500);
                }
            }
        };

        window.addEventListener('message', listener);
        document.body.appendChild(iframe);

        const html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <script>
                        const targetId = '${id}';
                        const proxyConsole = (type) => (...args) => {
                            window.parent.postMessage({ source: targetId, type: 'log', args: args.map(a => {
                                if (typeof a === 'object') return JSON.stringify(a);
                                return String(a);
                            }) }, '*');
                        };
                        console.log = proxyConsole('log');
                        console.info = proxyConsole('info');
                        console.warn = proxyConsole('warn');
                        console.error = proxyConsole('error');
                        window.onerror = (msg, url, line, col, error) => {
                            window.parent.postMessage({ source: targetId, type: 'error', error: msg }, '*');
                        };
                    </script>
                </head>
                <body>
                    <script type="module">
                        try {
                            ${code}
                        } catch (e) {
                            console.error(e.toString());
                        }
                        window.parent.postMessage({ source: targetId, type: 'done' }, '*');
                    </script>
                </body>
            </html>
        `;

        iframe.srcdoc = html;
    }

    private async duckduckgoSearch(query: string): Promise<string> {
        try {
            // Using DuckDuckGo HTML version which is easier to scrape than the dynamic JS version.
            // Using a cors proxy since we are running in browser. In a real app, this should be a backend route.
            const url = `https://corsproxy.io/?${encodeURIComponent('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query))}`;
            const response = await fetch(url);
            if (!response.ok) {
                return `Search failed: HTTP ${response.status}`;
            }
            const html = await response.text();
            
            // Simple fast scraping via DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const results = doc.querySelectorAll('.result');
            
            if (results.length === 0) return "No web search results found.";

            let summary = "";
            for (let i = 0; i < Math.min(results.length, 5); i++) {
                const title = results[i].querySelector('.result__title')?.textContent?.trim() || 'No Title';
                const snippet = results[i].querySelector('.result__snippet')?.textContent?.trim() || 'No Snippet';
                const link = (results[i].querySelector('.result__url') as HTMLAnchorElement)?.href || 'No Link';
                summary += `[${i+1}] ${title}\n${snippet}\nURL: ${link}\n\n`;
            }
            
            return summary;
        } catch (e: any) {
            console.error("DuckDuckGo search error:", e);
            return `Search failed: ${e.toString()}`;
        }
    }
}
