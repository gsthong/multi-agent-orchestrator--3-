export interface AgentTelemetry {
    agent: string;
    tokens: number;
    latencyMs: number;
    cost: number;
    status: 'pending' | 'active' | 'done' | 'error';
}

export class DashboardUI {
    private containerEl: HTMLElement | null;
    private metricsEl: HTMLElement | null;
    private emptyStateEl: HTMLElement | null;
    private totalCostEl: HTMLElement | null;
    private toggleBtn: HTMLButtonElement | null;
    private closeBtn: HTMLButtonElement | null;
    
    private metrics: Map<string, AgentTelemetry> = new Map();

    // Cost estimates per 1k IN + OUT tokens (approximate blended rates)
    private costRates: Record<string, number> = {
        'gemini': 0.00015,
        'deepseek': 0.00014,
        'qwen': 0.0004,
        'mixtral': 0.0006,
        'gemma': 0.0002,
        'llama': 0.0008,
    };

    constructor() {
        this.containerEl = document.getElementById('telemetry-dashboard');
        this.metricsEl = document.getElementById('telemetry-metrics');
        this.emptyStateEl = document.getElementById('telemetry-empty');
        this.totalCostEl = document.getElementById('total-cost-display');
        this.toggleBtn = document.getElementById('toggle-dashboard-btn') as HTMLButtonElement;
        this.closeBtn = document.getElementById('close-dashboard-btn') as HTMLButtonElement;

        this.bindEvents();
        
        // Listen for global telemetry events emitted by Orchestrator
        window.addEventListener('telemetry-update', ((e: CustomEvent) => {
            this.updateMetric(e.detail);
        }) as EventListener);
        
        window.addEventListener('telemetry-reset', () => {
            this.reset();
        });
    }

    private bindEvents() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => {
                this.toggle();
            });
        }
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }
    }

    public toggle() {
        if (!this.containerEl) return;
        if (this.containerEl.classList.contains('hidden')) {
            this.show();
        } else {
            this.hide();
        }
    }

    public show() {
        if (!this.containerEl) return;
        this.containerEl.classList.remove('hidden');
        // Small delay to allow display flex to apply before opacity/transform transitions
        setTimeout(() => {
            this.containerEl!.classList.remove('translate-x-[120%]');
        }, 10);
    }

    public hide() {
        if (!this.containerEl) return;
        this.containerEl.classList.add('translate-x-[120%]');
        setTimeout(() => {
            this.containerEl!.classList.add('hidden');
        }, 300); // match duration-300
    }

    public reset() {
        this.metrics.clear();
        if (this.metricsEl) this.metricsEl.innerHTML = '';
        if (this.emptyStateEl) {
            this.emptyStateEl.style.display = 'block';
            this.metricsEl?.appendChild(this.emptyStateEl);
        }
        this.updateTotalCost();
    }

    public updateMetric(data: Partial<AgentTelemetry> & { agent: string }) {
        if (this.emptyStateEl && this.emptyStateEl.style.display !== 'none') {
            this.emptyStateEl.style.display = 'none';
        }

        const existing = this.metrics.get(data.agent) || {
            agent: data.agent,
            tokens: 0,
            latencyMs: 0,
            cost: 0,
            status: 'pending'
        };

        const updated = { ...existing, ...data };
        
        // Calculate abstract cost based on tokens
        const rate = this.costRates[data.agent] || 0.0005;
        updated.cost = (updated.tokens / 1000) * rate;

        this.metrics.set(data.agent, updated);
        this.renderMetric(updated);
        this.updateTotalCost();
    }

    private renderMetric(metric: AgentTelemetry) {
        if (!this.metricsEl) return;

        let el = document.getElementById(`telemetry-${metric.agent}`);
        if (!el) {
            el = document.createElement('div');
            el.id = `telemetry-${metric.agent}`;
            el.className = 'bg-black/40 border border-zinc-700/50 rounded-lg p-3 text-xs flex flex-col gap-2';
            this.metricsEl.appendChild(el);
        }

        let statusColor = 'text-zinc-500';
        let statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-pulse"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
        
        if (metric.status === 'active') {
            statusColor = 'text-blue-400';
            statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
        } else if (metric.status === 'done') {
            statusColor = 'text-green-400';
            statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        } else if (metric.status === 'error') {
            statusColor = 'text-red-400';
            statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        }

        const formatMs = (ms: number) => ms > 0 ? (ms / 1000).toFixed(2) + 's' : '--';
        const formatTokens = (t: number) => t > 0 ? t.toLocaleString() : '--';

        el.innerHTML = `
            <div class="flex justify-between items-center mb-1 border-b border-zinc-800/50 pb-1">
                <span class="font-bold text-zinc-300 uppercase tracking-wide">${metric.agent}</span>
                <span class="flex items-center gap-1 ${statusColor} font-medium tracking-wide">
                    ${statusIcon} ${metric.status.toUpperCase()}
                </span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-zinc-400">
                <div class="bg-zinc-900 rounded p-1">
                    <div class="text-[10px] text-zinc-500 uppercase">Tokens</div>
                    <div class="font-mono text-zinc-300">${formatTokens(metric.tokens)}</div>
                </div>
                <div class="bg-zinc-900 rounded p-1">
                    <div class="text-[10px] text-zinc-500 uppercase">Latency</div>
                    <div class="font-mono text-zinc-300">${formatMs(metric.latencyMs)}</div>
                </div>
                <div class="bg-zinc-900 rounded p-1">
                    <div class="text-[10px] text-zinc-500 uppercase">Cost</div>
                    <div class="font-mono text-emerald-400">$${metric.cost.toFixed(4)}</div>
                </div>
            </div>
        `;
    }

    private updateTotalCost() {
        if (!this.totalCostEl) return;
        let total = 0;
        this.metrics.forEach(m => total += m.cost);
        this.totalCostEl.textContent = `$${total.toFixed(4)}`;
    }
}
