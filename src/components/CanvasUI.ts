/**
 * CanvasUI — Feature 9: Infinite Canvas / Spatial Whiteboard
 *
 * Provides a zoomable, pannable 2D work area where agents can "drop"
 * cards containing text, code, or images.
 */
export class CanvasUI {
    private panelEl: HTMLElement | null;
    private openBtn: HTMLElement | null;
    private closeBtn: HTMLElement | null;
    private viewportEl: HTMLElement | null;
    private contentEl: HTMLElement | null;
    private addStickyBtn: HTMLButtonElement | null;

    private scale: number = 1;
    private posX: number = 0;
    private posY: number = 0;
    private isPanning: boolean = false;
    private startX: number = 0;
    private startY: number = 0;

    constructor() {
        this.panelEl = document.getElementById('canvas-panel');
        this.openBtn = document.getElementById('open-canvas-btn');
        this.closeBtn = document.getElementById('close-canvas-btn');
        this.viewportEl = document.getElementById('canvas-viewport');
        this.contentEl = document.getElementById('canvas-content');
        this.addStickyBtn = document.getElementById('add-sticky-btn') as HTMLButtonElement;

        this.bindEvents();
    }

    private bindEvents() {
        this.openBtn?.addEventListener('click', () => this.show());
        this.closeBtn?.addEventListener('click', () => this.hide());
        this.addStickyBtn?.addEventListener('click', () => this.addCard('Sticky Note', 'Type something here...', 100, 100));

        // Panning
        this.viewportEl?.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+Left
                this.isPanning = true;
                this.startX = e.clientX - this.posX;
                this.startY = e.clientY - this.posY;
                this.viewportEl!.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.posX = e.clientX - this.startX;
                this.posY = e.clientY - this.startY;
                this.updateTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
            if (this.viewportEl) this.viewportEl.style.cursor = '';
        });

        // Zooming
        this.viewportEl?.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.001;
            const delta = -e.deltaY;
            const factor = Math.pow(1.1, delta / 100);
            
            const newScale = Math.min(Math.max(0.1, this.scale * factor), 5);
            
            // Adjust X/Y to zoom towards cursor
            const rect = this.viewportEl!.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            this.posX = mouseX - (mouseX - this.posX) * (newScale / this.scale);
            this.posY = mouseY - (mouseY - this.posY) * (newScale / this.scale);
            
            this.scale = newScale;
            this.updateTransform();
        }, { passive: false });

        // Listen for agent "drops" (Custom Event)
        window.addEventListener('canvas-drop', (e: any) => {
            const { title, content, x, y, type } = e.detail;
            this.addCard(title, content, x || 100, y || 100, type);
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

    private updateTransform() {
        if (this.contentEl) {
            this.contentEl.style.transform = `translate(${this.posX}px, ${this.posY}px) scale(${this.scale})`;
        }
    }

    public addCard(title: string, content: string, x: number, y: number, type: 'text' | 'code' | 'image' = 'text') {
        if (!this.contentEl) return;

        const card = document.createElement('div');
        card.className = 'absolute bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-3 min-w-[200px] cursor-move flex flex-col gap-2 hover:border-blue-500/50 transition-colors group';
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;

        const header = document.createElement('div');
        header.className = 'flex justify-between items-center border-b border-zinc-700 pb-1 mb-1';
        header.innerHTML = `<span class="text-[10px] font-bold uppercase text-zinc-400 tracking-widest">${title}</span>`;
        
        const close = document.createElement('button');
        close.className = 'text-zinc-500 hover:text-red-400 transition opacity-0 group-hover:opacity-100';
        close.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        close.onclick = () => card.remove();
        header.appendChild(close);

        const body = document.createElement('div');
        body.className = 'text-xs text-zinc-200 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono';
        body.textContent = content;

        card.appendChild(header);
        card.appendChild(body);
        this.contentEl.appendChild(card);

        // Make draggable on the canvas
        let isDragging = false;
        let startX = 0, startY = 0;

        card.addEventListener('mousedown', (e) => {
            if (e.target === close || e.target instanceof SVGSVGElement) return;
            e.stopPropagation();
            isDragging = true;
            startX = e.clientX - card.offsetLeft;
            startY = e.clientY - card.offsetTop;
            card.style.zIndex = '1000';
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                card.style.left = `${e.clientX - startX}px`;
                card.style.top = `${e.clientY - startY}px`;
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            card.style.zIndex = '';
        });
    }
}
