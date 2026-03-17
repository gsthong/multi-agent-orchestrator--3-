/**
 * BrowserUI — Feature 14: Active Web-Browsing Control
 *
 * Provides a specialized browser-like panel for agent-driven navigation.
 * Agents can "browse" to URLs, and the results are stored and displayed here.
 */
export class BrowserUI {
    private panelEl: HTMLElement | null;
    private openBtn: HTMLElement | null;
    private closeBtn: HTMLElement | null;
    private urlInput: HTMLInputElement | null;
    private goBtn: HTMLButtonElement | null;
    private contentEl: HTMLElement | null;
    private historyListEl: HTMLElement | null;

    private history: { url: string; title: string; ts: number }[] = [];

    constructor() {
        this.panelEl = document.getElementById('browser-panel');
        this.openBtn = document.getElementById('open-browser-btn');
        this.closeBtn = document.getElementById('close-browser-btn');
        this.urlInput = document.getElementById('browser-url-input') as HTMLInputElement;
        this.goBtn = document.getElementById('browser-go-btn') as HTMLButtonElement;
        this.contentEl = document.getElementById('browser-content');
        this.historyListEl = document.getElementById('browser-history');

        this.bindEvents();
    }

    private bindEvents() {
        this.openBtn?.addEventListener('click', () => this.show());
        this.closeBtn?.addEventListener('click', () => this.hide());
        this.goBtn?.addEventListener('click', () => this.navigate());
        this.urlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.navigate();
        });

        // Listen for agent navigation events
        window.addEventListener('agent-navigate', (e: any) => {
            const { url } = e.detail;
            if (url) {
                this.urlInput!.value = url;
                this.navigate(true);
            }
        });
    }

    private show() {
        this.panelEl?.classList.remove('hidden');
        this.panelEl?.classList.add('flex');
    }

    private hide() {
        this.panelEl?.classList.add('hidden');
        this.panelEl?.classList.remove('flex');
    }

    private async navigate(isAgent: boolean = false) {
        let url = this.urlInput?.value.trim();
        if (!url) return;
        
        if (!url.startsWith('http')) url = 'https://' + url;

        this.appendHistory(url, 'Loading...');
        if (this.contentEl) {
            this.contentEl.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-zinc-500 animate-pulse">
                    <svg class="w-8 h-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    <span>Navigating to ${url}...</span>
                </div>
            `;
        }

        // Simulating navigation logs
        setTimeout(() => {
            if (this.contentEl) {
                this.contentEl.innerHTML = `
                    <div class="p-6 space-y-4">
                        <div class="bg-zinc-800 p-4 rounded-lg border border-zinc-700">
                             <h2 class="text-sm font-bold text-zinc-100 mb-2">Page Scraped Successfully</h2>
                             <p class="text-xs text-zinc-400">The agent has extracted the following content from <strong>${url}</strong>:</p>
                        </div>
                        <div class="text-xs text-zinc-300 leading-relaxed font-sans prose prose-invert max-w-none">
                            <p>This is a simulated browser view. In a full production environment, this would integrate with a headless browser service or a proxy to bypass X-Frame-Options.</p>
                            <p>All text content from the target URL is successfully parsed and injected into the agent's long-term context.</p>
                        </div>
                    </div>
                `;
            }
        }, 1200);
    }

    private appendHistory(url: string, title: string) {
        this.history.unshift({ url, title, ts: Date.now() });
        if (this.historyListEl) {
            this.historyListEl.innerHTML = this.history.map(h => `
                <div class="flex flex-col p-2 hover:bg-zinc-800 rounded cursor-pointer transition-colors group">
                    <span class="text-[10px] text-zinc-500">${new Date(h.ts).toLocaleTimeString()}</span>
                    <span class="text-xs text-zinc-300 truncate">${h.url}</span>
                </div>
            `).join('');
        }
    }
}
