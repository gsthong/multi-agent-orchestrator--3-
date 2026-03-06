import { StorageUtils } from '../utils/storage';

export class ApiModal {
    private modalEl: HTMLElement | null;
    private inputEl: HTMLInputElement | null;
    private groqInputEl: HTMLInputElement | null;
    private saveBtn: HTMLButtonElement | null;
    private cancelBtn: HTMLButtonElement | null;
    private openBtn: HTMLElement | null;

    constructor() {
        this.modalEl = document.getElementById('api-modal');
        this.inputEl = document.getElementById('api-key-input') as HTMLInputElement;
        this.groqInputEl = document.getElementById('groq-key-input') as HTMLInputElement;
        this.saveBtn = document.getElementById('save-key-btn') as HTMLButtonElement;
        this.cancelBtn = document.getElementById('close-modal-btn') as HTMLButtonElement;
        this.openBtn = document.getElementById('api-key-btn');

        this.bindEvents();
    }

    private bindEvents() {
        // Open modal explicitly
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => {
                if (this.inputEl) this.inputEl.value = StorageUtils.getApiKey() || '';
                if (this.groqInputEl) this.groqInputEl.value = StorageUtils.getGroqKey() || '';
                this.show();
            });
        }

        // Save key action
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.save());
        }

        // Cancel / Close modal action
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.hide());
        }

        // Allow enter key to save inside inputs
        const handleEnter = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.save();
            }
        };

        if (this.inputEl) this.inputEl.addEventListener('keydown', handleEnter);
        if (this.groqInputEl) this.groqInputEl.addEventListener('keydown', handleEnter);
    }

    public hasApiKey(): boolean {
        return !!StorageUtils.getApiKey() && !!StorageUtils.getGroqKey();
    }

    public show() {
        if (this.modalEl) {
            this.modalEl.classList.remove('hidden');
            this.modalEl.classList.add('flex');
            // Focus input
            setTimeout(() => this.inputEl?.focus(), 100);
        }
    }

    public hide() {
        if (this.modalEl) {
            // Don't close if API keys are missing and trying to back out
            if (!this.hasApiKey()) {
                alert("Both a Gemini and Groq API Key are required to use the 6-agent debate system.");
                return;
            }
            this.modalEl.classList.add('hidden');
            this.modalEl.classList.remove('flex');
        }
    }

    private save() {
        if (!this.inputEl || !this.groqInputEl) return;

        const key = this.inputEl.value.trim();
        const groqKey = this.groqInputEl.value.trim();

        if (key && groqKey) {
            StorageUtils.saveApiKey(key);
            StorageUtils.saveGroqKey(groqKey);
            this.hide();
        } else {
            alert("Please provide both valid API keys.");
        }
    }
}
