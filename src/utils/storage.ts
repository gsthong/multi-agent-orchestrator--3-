// Define message structure
export interface Message {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export interface ChatHistory {
    persona: string;
    messages: Message[];
}

const STORAGE_KEY = 'ai_chat_history';
const API_KEY_STORAGE = 'gemini_api_key';
const GROQ_KEY_STORAGE = 'groq_api_key';

export class StorageUtils {
    // --- API Key Management ---

    static getApiKey(): string | null {
        return localStorage.getItem(API_KEY_STORAGE);
    }

    static saveApiKey(key: string): void {
        localStorage.setItem(API_KEY_STORAGE, key);
    }

    static clearApiKey(): void {
        localStorage.removeItem(API_KEY_STORAGE);
    }

    static getGroqKey(): string | null {
        return localStorage.getItem(GROQ_KEY_STORAGE);
    }

    static saveGroqKey(key: string): void {
        localStorage.setItem(GROQ_KEY_STORAGE, key);
    }

    static getTheme(): 'dark' | 'light' {
        return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    }

    static saveTheme(theme: 'dark' | 'light') {
        localStorage.setItem('theme', theme);
    }

    static clearGroqKey(): void {
        localStorage.removeItem(GROQ_KEY_STORAGE);
    }


    // --- Chat History Management ---

    static getHistory(): ChatHistory {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) {
            return { persona: 'assistant', messages: [] };
        }
        try {
            return JSON.parse(data) as ChatHistory;
        } catch (e) {
            console.error('Failed to parse chat history', e);
            return { persona: 'assistant', messages: [] };
        }
    }

    static saveHistory(history: ChatHistory): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }

    static clearHistory(): void {
        // Keep the current persona but clear messages
        const currentHistory = this.getHistory();
        currentHistory.messages = [];
        this.saveHistory(currentHistory);
    }
}
