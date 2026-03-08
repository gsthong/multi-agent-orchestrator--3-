import { StorageUtils, AdvancedSettings } from '../utils/storage';

export class SettingsModal {
    private modalEl: HTMLElement | null;
    private openBtn: HTMLElement | null;
    private closeBtn: HTMLElement | null;
    private saveBtn: HTMLButtonElement | null;

    // Inputs
    private tempSlider: HTMLInputElement | null;
    private tempValue: HTMLElement | null;

    private dsToggle: HTMLInputElement | null;
    private qwenToggle: HTMLInputElement | null;
    private mixToggle: HTMLInputElement | null;

    private dsModel: HTMLInputElement | null;
    private qwenModel: HTMLInputElement | null;
    private mixModel: HTMLInputElement | null;
    private gemmaModel: HTMLInputElement | null;
    private llamaModel: HTMLInputElement | null;

    constructor() {
        this.openBtn = document.getElementById('settings-btn');
        this.modalEl = document.getElementById('settings-modal');
        this.closeBtn = document.getElementById('close-settings-btn');
        this.saveBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;

        this.tempSlider = document.getElementById('temp-slider') as HTMLInputElement;
        this.tempValue = document.getElementById('temp-value');

        this.dsToggle = document.getElementById('toggle-deepseek') as HTMLInputElement;
        this.qwenToggle = document.getElementById('toggle-qwen') as HTMLInputElement;
        this.mixToggle = document.getElementById('toggle-mixtral') as HTMLInputElement;

        this.dsModel = document.getElementById('model-deepseek') as HTMLInputElement;
        this.qwenModel = document.getElementById('model-qwen') as HTMLInputElement;
        this.mixModel = document.getElementById('model-mixtral') as HTMLInputElement;
        this.gemmaModel = document.getElementById('model-gemma') as HTMLInputElement;
        this.llamaModel = document.getElementById('model-llama') as HTMLInputElement;

        this.bindEvents();
    }

    private bindEvents() {
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => {
                this.loadSettings();
                this.show();
            });
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
        }

        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.save());
        }

        if (this.tempSlider && this.tempValue) {
            this.tempSlider.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                this.tempValue!.textContent = target.value;
            });
        }
    }

    private loadSettings() {
        const settings = StorageUtils.getAdvancedSettings();

        if (this.tempSlider && this.tempValue) {
            this.tempSlider.value = settings.temperature.toString();
            this.tempValue.textContent = settings.temperature.toString();
        }

        if (this.dsToggle) this.dsToggle.checked = settings.useDeepSeek;
        if (this.qwenToggle) this.qwenToggle.checked = settings.useQwen;
        if (this.mixToggle) this.mixToggle.checked = settings.useMixtral;

        if (this.dsModel) this.dsModel.value = settings.models.deepSeek;
        if (this.qwenModel) this.qwenModel.value = settings.models.qwen;
        if (this.mixModel) this.mixModel.value = settings.models.mixtral;
        if (this.gemmaModel) this.gemmaModel.value = settings.models.gemma;
        if (this.llamaModel) this.llamaModel.value = settings.models.llama;
    }

    public show() {
        if (this.modalEl) {
            this.modalEl.classList.remove('hidden');
            this.modalEl.classList.add('flex');
        }
    }

    public hide() {
        if (this.modalEl) {
            this.modalEl.classList.add('hidden');
            this.modalEl.classList.remove('flex');
        }
    }

    private save() {
        const settings: AdvancedSettings = {
            temperature: parseFloat(this.tempSlider?.value || '0.7'),
            useDeepSeek: !!this.dsToggle?.checked,
            useQwen: !!this.qwenToggle?.checked,
            useMixtral: !!this.mixToggle?.checked,
            models: {
                deepSeek: this.dsModel?.value || '',
                qwen: this.qwenModel?.value || '',
                mixtral: this.mixModel?.value || '',
                gemma: this.gemmaModel?.value || '',
                llama: this.llamaModel?.value || ''
            }
        };

        StorageUtils.saveAdvancedSettings(settings);
        this.hide();
    }
}
