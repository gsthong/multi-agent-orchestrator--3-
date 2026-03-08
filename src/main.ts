import './style.css';
import { ApiModal } from './components/ApiModal';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { ChatUI } from './components/ChatUI';

// The main application class
class App {
    private apiModal: ApiModal;
    private settingsModal: SettingsModal;
    private sidebar: Sidebar;
    private chatUI: ChatUI;

    constructor() {
        this.apiModal = new ApiModal();
        this.settingsModal = new SettingsModal();
        this.chatUI = new ChatUI();
        this.sidebar = new Sidebar(this.chatUI);

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
