import './style.css';
import { ApiModal } from './components/ApiModal';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { ChatUI } from './components/ChatUI';
import { DashboardUI } from './components/DashboardUI';
import { MatrixUI } from './components/MatrixUI';
import { GraphUI } from './components/GraphUI';
import { ScreenShareUI } from './components/ScreenShareUI';
import { WebhookUI } from './components/WebhookUI';
import { MultiPlayerUI } from './components/MultiPlayerUI';
import { CanvasUI } from './components/CanvasUI';
import { SandboxUI } from './components/SandboxUI';
import { BrowserUI } from './components/BrowserUI';

// The main application class
class App {
    private apiModal: ApiModal;
    private settingsModal: SettingsModal;
    private sidebar: Sidebar;
    private chatUI: ChatUI;
    private dashboardUI: DashboardUI;
    private matrixUI: MatrixUI;
    private graphUI: GraphUI;
    private screenShareUI: ScreenShareUI;
    private webhookUI: WebhookUI;
    private multiPlayerUI: MultiPlayerUI;
    private canvasUI: CanvasUI;
    private sandboxUI: SandboxUI;
    private browserUI: BrowserUI;

    constructor() {
        this.screenShareUI = new ScreenShareUI();
        this.webhookUI = new WebhookUI();
        this.multiPlayerUI = new MultiPlayerUI();
        this.canvasUI = new CanvasUI();
        this.sandboxUI = new SandboxUI();
        this.browserUI = new BrowserUI();
        this.apiModal = new ApiModal();
        this.settingsModal = new SettingsModal();
        this.chatUI = new ChatUI(this.screenShareUI);
        this.sidebar = new Sidebar(this.chatUI);
        this.dashboardUI = new DashboardUI();
        this.matrixUI = new MatrixUI();
        this.graphUI = new GraphUI();

        this.init();
    }

    private init() {
        // Check for API key on load
        if (!this.apiModal.hasApiKey()) {
            this.apiModal.show();
        }

        this.registerServiceWorker();
    }

    private registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then(
                    (registration) => console.log('ServiceWorker registration successful:', registration.scope),
                    (err) => console.log('ServiceWorker registration failed:', err)
                );
            });
        }
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
