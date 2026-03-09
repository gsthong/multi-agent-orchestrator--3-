// Define message structure
export interface Message {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export interface ChatSession {
    id: string; // Unique timestamp or UUID
    title: string;
    persona: string;
    messages: Message[];
    createdAt: number;
}

const STORAGE_KEY = 'ai_chat_sessions';
const CURRENT_SESSION_KEY = 'ai_current_session_id';
const LEGACY_STORAGE_KEY = 'ai_chat_history'; // For migration
const API_KEY_STORAGE = 'gemini_api_key';
const GROQ_KEY_STORAGE = 'groq_api_key';
const ADVANCED_SETTINGS_KEY = 'ai_advanced_settings';

export interface AdvancedSettings {
    temperature: number;
    useDeepSeek: boolean;
    useQwen: boolean;
    useMixtral: boolean;
    models: {
        deepSeek: string;
        qwen: string;
        mixtral: string;
        gemma: string;
        llama: string;
    };
}

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

    static clearGroqKey(): void {
        localStorage.removeItem(GROQ_KEY_STORAGE);
    }

    static getTheme(): 'dark' | 'light' {
        return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    }

    static saveTheme(theme: 'dark' | 'light') {
        localStorage.setItem('theme', theme);
    }

    // --- Advanced Settings ---
    static getAdvancedSettings(): AdvancedSettings {
        const data = localStorage.getItem(ADVANCED_SETTINGS_KEY);
        if (data) {
            try {
                return JSON.parse(data) as AdvancedSettings;
            } catch (e) { }
        }
        return {
            temperature: 0.7,
            useDeepSeek: true,
            useQwen: true,
            useMixtral: true,
            models: {
                deepSeek: 'deepseek-r1-distill-llama-70b',
                qwen: 'qwen-2.5-32b',
                mixtral: 'mixtral-8x7b-32768',
                gemma: 'gemma2-9b-it',
                llama: 'llama-3.3-70b-versatile'
            }
        };
    }

    static saveAdvancedSettings(settings: AdvancedSettings): void {
        localStorage.setItem(ADVANCED_SETTINGS_KEY, JSON.stringify(settings));
    }


    // --- Multi-Session Chat History Management ---

    static async getSessions(): Promise<ChatSession[]> {
        try {
            const res = await fetch('/api/sessions');
            if (res.ok) return await res.json();
            return [];
        } catch (e) {
            return [];
        }
    }

    static async getSession(id: string): Promise<ChatSession | undefined> {
        try {
            const res = await fetch(`/api/sessions/${id}`);
            if (res.ok) return await res.json();
            return undefined;
        } catch (e) {
            return undefined;
        }
    }

    static async saveSession(session: ChatSession): Promise<void> {
        try {
            await fetch(`/api/sessions/${session.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: session.title, messages: session.messages })
            });
        } catch (e) {
            console.error('Failed to save session', e);
        }
    }

    static async deleteSession(id: string): Promise<void> {
        try {
            await fetch(`/api/sessions/${id}`, { method: 'DELETE' });

            if (this.getCurrentSessionId() === id) {
                const sessions = await this.getSessions();
                const nextBest = sessions[0]?.id || null;
                if (nextBest) {
                    this.setCurrentSessionId(nextBest);
                } else {
                    localStorage.removeItem(CURRENT_SESSION_KEY);
                }
            }
        } catch (e) {
            console.error('Failed to delete session', e);
        }
    }

    static async createNewSession(persona: string = 'assistant'): Promise<ChatSession> {
        const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'New Chat',
            persona: persona,
            messages: [],
            createdAt: Date.now()
        };
        try {
            await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSession)
            });
        } catch (e) {
            console.error('Failed to create session in backend', e);
        }

        this.setCurrentSessionId(newSession.id);
        return newSession;
    }

    static getCurrentSessionId(): string | null {
        return localStorage.getItem(CURRENT_SESSION_KEY);
    }

    static setCurrentSessionId(id: string): void {
        localStorage.setItem(CURRENT_SESSION_KEY, id);
    }

    static async getActiveHistory(): Promise<ChatSession> {
        const currentId = this.getCurrentSessionId();
        let session = currentId ? await this.getSession(currentId) : null;

        if (!session) {
            // Pick most recent or create new
            const sessions = await this.getSessions();
            if (sessions.length > 0) {
                session = await this.getSession(sessions[0].id);
                if (session) {
                    this.setCurrentSessionId(session.id);
                } else {
                    session = await this.createNewSession();
                }
            } else {
                session = await this.createNewSession();
            }
        }
        return session as ChatSession;
    }
}
