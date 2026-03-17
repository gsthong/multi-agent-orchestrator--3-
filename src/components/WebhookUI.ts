/**
 * WebhookUI — Feature 16: Workflow Hook Integrations
 *
 * Allows users to register external webhook URLs. After every debate completes,
 * the final synthesized output + metadata is POSTed to all registered webhooks
 * in a Zapier/Make-compatible JSON format.
 */
export class WebhookUI {
    private panelEl: HTMLElement | null;
    private openBtn: HTMLElement | null;
    private closeBtn: HTMLElement | null;
    private addBtn: HTMLButtonElement | null;
    private urlInput: HTMLInputElement | null;
    private listEl: HTMLElement | null;

    private webhooks: { id: string; url: string; label: string }[] = [];
    private readonly STORAGE_KEY = 'orchestrator_webhooks';

    constructor() {
        this.panelEl = document.getElementById('webhook-panel');
        this.openBtn = document.getElementById('open-webhooks-btn');
        this.closeBtn = document.getElementById('close-webhooks-btn');
        this.addBtn = document.getElementById('add-webhook-btn') as HTMLButtonElement;
        this.urlInput = document.getElementById('webhook-url-input') as HTMLInputElement;
        this.listEl = document.getElementById('webhook-list');

        this.loadFromStorage();
        this.renderList();
        this.bindEvents();
    }

    private bindEvents() {
        this.openBtn?.addEventListener('click', () => this.show());
        this.closeBtn?.addEventListener('click', () => this.hide());
        this.addBtn?.addEventListener('click', () => this.addWebhook());

        this.urlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addWebhook();
        });

        // Listen for debate completion to trigger webhooks
        window.addEventListener('debate-complete', (e: any) => {
            this.triggerAll(e.detail);
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

    private addWebhook() {
        const url = this.urlInput?.value.trim();
        if (!url || !url.startsWith('http')) {
            if (this.urlInput) this.urlInput.style.borderColor = 'red';
            setTimeout(() => { if (this.urlInput) this.urlInput.style.borderColor = ''; }, 1500);
            return;
        }

        const hook = {
            id: Date.now().toString(),
            url,
            label: new URL(url).hostname
        };
        this.webhooks.push(hook);
        this.saveToStorage();
        this.renderList();
        if (this.urlInput) this.urlInput.value = '';
    }

    private removeWebhook(id: string) {
        this.webhooks = this.webhooks.filter(h => h.id !== id);
        this.saveToStorage();
        this.renderList();
    }

    private renderList() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';

        if (this.webhooks.length === 0) {
            this.listEl.innerHTML = '<p class="text-zinc-500 text-xs text-center italic py-3">No webhooks configured.</p>';
            return;
        }

        this.webhooks.forEach(hook => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between gap-2 bg-zinc-800/60 rounded-lg px-3 py-2 border border-zinc-700/50';

            const info = document.createElement('div');
            info.className = 'flex-1 min-w-0';
            info.innerHTML = `<p class="text-xs font-medium text-zinc-200 truncate">${hook.label}</p><p class="text-xs text-zinc-500 truncate">${hook.url}</p>`;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'text-zinc-500 hover:text-red-400 transition shrink-0';
            removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            removeBtn.addEventListener('click', () => this.removeWebhook(hook.id));

            row.appendChild(info);
            row.appendChild(removeBtn);
            this.listEl!.appendChild(row);
        });
    }

    /**
     * Fires all registered webhooks with the debate result payload.
     * Compatible with Zapier / Make / n8n catch-hook format.
     */
    public async triggerAll(payload: { prompt: string; result: string; agent?: string }) {
        if (this.webhooks.length === 0) return;

        const body = JSON.stringify({
            source: 'multi-agent-orchestrator',
            timestamp: new Date().toISOString(),
            prompt: payload.prompt,
            result: payload.result,
            agent: payload.agent || 'llama-prime',
            resultLength: payload.result.length
        });

        const results = await Promise.allSettled(
            this.webhooks.map(hook =>
                fetch(hook.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body
                })
            )
        );

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`Webhooks fired: ${successCount}/${this.webhooks.length} succeeded`);
    }

    private saveToStorage() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.webhooks));
    }

    private loadFromStorage() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) this.webhooks = JSON.parse(raw);
        } catch { this.webhooks = []; }
    }
}
