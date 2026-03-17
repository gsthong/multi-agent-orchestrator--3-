/**
 * ScreenShareUI — Feature 2: Live Screen-Share / Multi-modal
 *
 * Captures the user's screen via getDisplayMedia, displays a live preview
 * thumbnail, and provides the latest frame as a base64 PNG for multimodal
 * injection into the Gemini context on the next message send.
 */
export class ScreenShareUI {
    private videoEl: HTMLVideoElement | null;
    private canvasEl: HTMLCanvasElement | null;
    private previewPanel: HTMLElement | null;
    private startBtn: HTMLElement | null;
    private stopBtn: HTMLElement | null;

    private stream: MediaStream | null = null;
    private captureInterval: ReturnType<typeof setInterval> | null = null;
    private lastFrameBase64: string | null = null;

    constructor() {
        this.videoEl = document.getElementById('screen-share-video') as HTMLVideoElement;
        this.canvasEl = document.getElementById('screen-share-canvas') as HTMLCanvasElement;
        this.previewPanel = document.getElementById('screen-share-preview');
        this.startBtn = document.getElementById('screen-share-btn');
        this.stopBtn = document.getElementById('stop-screen-share-btn');

        this.bindEvents();
    }

    private bindEvents() {
        this.startBtn?.addEventListener('click', () => this.startCapture());
        this.stopBtn?.addEventListener('click', () => this.stopCapture());
    }

    private async startCapture() {
        if (this.stream) {
            this.stopCapture();
            return;
        }

        try {
            this.stream = await (navigator.mediaDevices as any).getDisplayMedia({
                video: { frameRate: 5 },
                audio: false
            });

            if (!this.videoEl || !this.stream) return;

            this.videoEl.srcObject = this.stream;

            // Detect when user stops sharing from system UI
            this.stream.getTracks()[0].onended = () => this.stopCapture();

            if (this.previewPanel) {
                this.previewPanel.classList.remove('hidden');
            }

            // Mark start button as active
            if (this.startBtn) {
                this.startBtn.classList.add('text-emerald-400', 'bg-emerald-900/40');
                this.startBtn.title = 'Stop screen share';
            }

            // Start capturing a frame every 2 seconds so we always have fresh context
            this.captureInterval = setInterval(() => this.captureFrame(), 2000);
            // Capture immediately
            setTimeout(() => this.captureFrame(), 500);

        } catch (e: any) {
            if (e.name !== 'NotAllowedError') {
                console.error('Screen capture error:', e);
            }
        }
    }

    public stopCapture() {
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.videoEl) {
            this.videoEl.srcObject = null;
        }

        this.lastFrameBase64 = null;

        if (this.previewPanel) {
            this.previewPanel.classList.add('hidden');
        }

        if (this.startBtn) {
            this.startBtn.classList.remove('text-emerald-400', 'bg-emerald-900/40');
            this.startBtn.title = 'Share screen with agents';
        }
    }

    private captureFrame() {
        if (!this.videoEl || !this.canvasEl || !this.stream) return;
        if (this.videoEl.readyState < 2) return; // Not ready yet

        const { videoWidth, videoHeight } = this.videoEl;
        if (!videoWidth || !videoHeight) return;

        this.canvasEl.width = videoWidth;
        this.canvasEl.height = videoHeight;

        const ctx = this.canvasEl.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(this.videoEl, 0, 0, videoWidth, videoHeight);
        // Store as base64 PNG (strip the data:image/png;base64, prefix)
        this.lastFrameBase64 = this.canvasEl.toDataURL('image/jpeg', 0.7).split(',')[1];
    }

    /**
     * Called by ChatUI before sending a message.
     * Returns the base64 JPEG of the latest captured frame, or null if not sharing.
     */
    public getLatestFrame(): string | null {
        if (!this.stream) return null;
        // Force a fresh capture right before sending
        this.captureFrame();
        return this.lastFrameBase64;
    }

    public isSharing(): boolean {
        return !!this.stream;
    }
}
