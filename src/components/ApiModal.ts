import { StorageUtils } from '../utils/storage';

export class ApiModal {
    private modalEl: HTMLElement | null;
    private inputEl: HTMLInputElement | null;
    private saveBtn: HTMLButtonElement | null;
    private cancelBtn: HTMLButtonElement | null;
    private openBtn: HTMLElement | null;

    constructor() {
        this.modalEl = document.getElementById('api-modal');
        this.inputEl = document.getElementById('api-key-input') as HTMLInputElement;
        this.saveBtn = document.getElementById('save-key-btn') as HTMLButtonElement;
        this.cancelBtn = document.getElementById('close-modal-btn') as HTMLButtonElement;
        this.openBtn = document.getElementById('api-key-btn');

        this.bindEvents();
    }

    private bindEvents() {
        // Open modal explicitly
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => {
                this.inputEl!.value = StorageUtils.getApiKey() || '';
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

        // Allow enter key to save inside input
        if (this.inputEl) {
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.save();
                }
            });
        }
    }

    public hasApiKey(): boolean {
        return !!StorageUtils.getApiKey();
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
            // Don't close if API key is empty and trying to back out
            if (!this.hasApiKey()) {
                alert("An API Key is required to use the application.");
                return;
            }
            this.modalEl.classList.add('hidden');
            this.modalEl.classList.remove('flex');
        }
    }

    private save() {
        if (!this.inputEl) return;

        const key = this.inputEl.value.trim();
        if (key) {
            StorageUtils.saveApiKey(key);
            this.hide();
        } else {
            alert("Please enter a valid API key.");
        }
    }
}
