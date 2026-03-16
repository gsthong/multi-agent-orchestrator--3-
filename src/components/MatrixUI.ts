export interface MatrixData {
    gemini_deepseek: number;
    gemini_qwen: number;
    gemini_mixtral: number;
    deepseek_qwen: number;
    deepseek_mixtral: number;
    qwen_mixtral: number;
}

export class MatrixUI {
    private containerEl: HTMLElement | null;
    private visualContainerEl: HTMLElement | null;
    private emptyStateEl: HTMLElement | null;
    private canvasEl: HTMLCanvasElement | null;
    private toggleBtn: HTMLButtonElement | null;
    private closeBtn: HTMLButtonElement | null;

    private agents = ['Gemini', 'DeepSeek', 'Qwen', 'Mixtral'];

    constructor() {
        this.containerEl = document.getElementById('matrix-dashboard');
        this.visualContainerEl = document.getElementById('matrix-visual-container');
        this.emptyStateEl = document.getElementById('matrix-empty');
        this.canvasEl = document.getElementById('matrix-canvas') as HTMLCanvasElement;
        this.toggleBtn = document.getElementById('toggle-matrix-btn') as HTMLButtonElement;
        this.closeBtn = document.getElementById('close-matrix-btn') as HTMLButtonElement;

        this.bindEvents();

        window.addEventListener('matrix-update', ((e: CustomEvent) => {
            this.renderMatrix(e.detail);
        }) as EventListener);

        window.addEventListener('telemetry-reset', () => {
            this.reset();
        });
    }

    private bindEvents() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
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
        setTimeout(() => {
            this.containerEl!.classList.remove('translate-x-[120%]');
        }, 10);
    }

    public hide() {
        if (!this.containerEl) return;
        this.containerEl.classList.add('translate-x-[120%]');
        setTimeout(() => {
            this.containerEl!.classList.add('hidden');
        }, 300);
    }

    public reset() {
        if (this.emptyStateEl) this.emptyStateEl.style.display = 'block';
        if (this.canvasEl) this.canvasEl.classList.add('hidden');
    }

    public renderMatrix(data: MatrixData) {
        if (!this.canvasEl || !this.visualContainerEl) return;
        if (this.emptyStateEl) this.emptyStateEl.style.display = 'none';
        
        this.canvasEl.classList.remove('hidden');
        
        const ctx = this.canvasEl.getContext('2d');
        if (!ctx) return;

        // Configuration
        const size = this.canvasEl.width;
        const cellSize = size / 5; // 4 agents + 1 header row/col
        
        ctx.clearRect(0, 0, size, size);
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Helper to get score
        const getScore = (a1: string, a2: string): number => {
            if (a1 === a2) return 0; // Self agreement = 0 conflict
            const k1 = `${a1.toLowerCase()}_${a2.toLowerCase()}`;
            const k2 = `${a2.toLowerCase()}_${a1.toLowerCase()}`;
            return (data as any)[k1] ?? (data as any)[k2] ?? 0;
        };

        // Helper to get color based on conflict score (0-100)
        // 0 = Green (Agreement), 50 = Yellow (Neutral), 100 = Red (Conflict)
        const getColor = (score: number) => {
            if (score <= 33) {
                // Green area map (emerald-900 to emerald-400)
                const intensity = Math.max(0.1, 1 - (score/33));
                return `rgba(16, 185, 129, ${intensity})`; 
            } else if (score <= 66) {
                // Yellow/Orange map 
                const intensity = Math.max(0.2, (score-33)/33);
                return `rgba(245, 158, 11, ${intensity})`;
            } else {
                // Red map
                const intensity = Math.max(0.3, (score-66)/34);
                return `rgba(239, 68, 68, ${Math.min(1, intensity + 0.2)})`;
            }
        };

        // Draw Headers
        ctx.fillStyle = '#71717a'; // zinc-500
        for (let i = 0; i < 4; i++) {
            // Top headers
            ctx.fillText(this.agents[i].substring(0, 3).toUpperCase(), cellSize * (i + 1) + cellSize / 2, cellSize / 2);
            // Left headers
            ctx.fillText(this.agents[i].substring(0, 3).toUpperCase(), cellSize / 2, cellSize * (i + 1) + cellSize / 2);
        }

        // Draw Matrix Cells
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const x = cellSize * (col + 1);
                const y = cellSize * (row + 1);
                
                const score = getScore(this.agents[row], this.agents[col]);
                
                // Draw Cell Background
                ctx.fillStyle = row === col ? '#18181b' : getColor(score);
                ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
                
                // Draw Cell Border
                ctx.strokeStyle = '#27272a'; // zinc-800
                ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

                // Draw Text
                ctx.fillStyle = '#e4e4e7'; // zinc-200
                if (row === col) {
                    ctx.fillText('-', x + cellSize / 2, y + cellSize / 2);
                } else {
                    ctx.fillText(score.toString(), x + cellSize / 2, y + cellSize / 2);
                }
            }
        }
        
        // Add legend below
        ctx.fillStyle = '#71717a';
        ctx.font = '9px sans-serif';
        ctx.fillText('0=Agrees, 100=Conflicts', size / 2, size - 10);
    }
}
