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

    static getSessions(): ChatSession[] {
        this.migrateLegacyHistory(); // Ensure old users don't lose data
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        try {
            return JSON.parse(data) as ChatSession[];
        } catch (e) {
            console.error('Failed to parse chat sessions', e);
            return [];
        }
    }

    static getSession(id: string): ChatSession | undefined {
        return this.getSessions().find(s => s.id === id);
    }

    static saveSession(session: ChatSession): void {
        const sessions = this.getSessions();
        const index = sessions.findIndex(s => s.id === session.id);
        if (index >= 0) {
            sessions[index] = session;
        } else {
            sessions.push(session);
        }
        // Save back sorted by newest first
        sessions.sort((a, b) => b.createdAt - a.createdAt);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }

    static deleteSession(id: string): void {
        let sessions = this.getSessions();
        sessions = sessions.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

        if (this.getCurrentSessionId() === id) {
            const nextBest = sessions[0]?.id || null;
            if (nextBest) {
                this.setCurrentSessionId(nextBest);
            } else {
                localStorage.removeItem(CURRENT_SESSION_KEY);
            }
        }
    }

    static createNewSession(persona: string = 'assistant'): ChatSession {
        const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'New Chat',
            persona: persona,
            messages: [],
            createdAt: Date.now()
        };
        this.saveSession(newSession);
        this.setCurrentSessionId(newSession.id);
        return newSession;
    }

    static getCurrentSessionId(): string | null {
        return localStorage.getItem(CURRENT_SESSION_KEY);
    }

    static setCurrentSessionId(id: string): void {
        localStorage.setItem(CURRENT_SESSION_KEY, id);
    }

    static getActiveHistory(): ChatSession {
        const currentId = this.getCurrentSessionId();
        let session = currentId ? this.getSession(currentId) : null;

        if (!session) {
            // Pick most recent or create new
            const sessions = this.getSessions();
            if (sessions.length > 0) {
                session = sessions[0];
                this.setCurrentSessionId(session.id);
            } else {
                session = this.createNewSession();
            }
        }
        return session;
    }

    private static migrateLegacyHistory(): void {
        const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyData) {
            try {
                // Parse old ChatHistory format
                const oldHistory = JSON.parse(legacyData);
                // Create a new session out of it if it has messages
                if (oldHistory.messages && oldHistory.messages.length > 0) {
                    const migratedSession: ChatSession = {
                        id: Date.now().toString(),
                        title: 'Imported Chat',
                        persona: oldHistory.persona || 'assistant',
                        messages: oldHistory.messages,
                        createdAt: Date.now() - 1000 // Ensure it's slightly older
                    };

                    const sessions = localStorage.getItem(STORAGE_KEY);
                    let newSessions: ChatSession[] = sessions ? JSON.parse(sessions) : [];
                    newSessions.push(migratedSession);

                    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSessions));
                    if (!this.getCurrentSessionId()) {
                        this.setCurrentSessionId(migratedSession.id);
                    }
                }
            } catch (e) {
                console.error('Failed to migrate legacy history', e);
            } finally {
                // Clear the old key so we don't migrate again
                localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
        }
    }
}
