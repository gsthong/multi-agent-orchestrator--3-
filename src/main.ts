import './style.css';
import { ApiModal } from './components/ApiModal';
import { Sidebar } from './components/Sidebar';
import { ChatUI } from './components/ChatUI';

// The main application class
class App {
    private apiModal: ApiModal;
    private sidebar: Sidebar;
    private chatUI: ChatUI;

    constructor() {
        this.apiModal = new ApiModal();
        this.chatUI = new ChatUI();
        this.sidebar = new Sidebar(this.chatUI);

        this.init();
    }

    private init() {
        // Check for API key on load
        if (!this.apiModal.hasApiKey()) {
            this.apiModal.show();
        }
    }
}

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
