import { StorageUtils } from '../utils/storage';

declare const vis: any; // We load Vis-Network globally via CDN in index.html

export class GraphUI {
    private panel: HTMLElement;
    private openBtn: HTMLElement;
    private closeBtn: HTMLElement;
    private container: HTMLElement;
    private loadingEl: HTMLElement;
    private network: any = null;

    constructor() {
        this.panel = document.getElementById('knowledge-graph-panel')!;
        this.openBtn = document.getElementById('knowledge-graph-btn')!;
        this.closeBtn = document.getElementById('close-graph-btn')!;
        this.container = document.getElementById('graph-container')!;
        this.loadingEl = document.getElementById('graph-loading')!;

        this.bindEvents();
    }

    private bindEvents() {
        if (!this.openBtn || !this.panel) return;
        
        this.openBtn.addEventListener('click', () => {
            // Close sidebar automatically on mobile when opening graph
            const sidebar = document.getElementById('sidebar');
            if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
                sidebar.classList.add('-translate-x-full');
            }
            this.openPanel();
        });
        
        this.closeBtn.addEventListener('click', () => this.closePanel());
        
        // Listen for new memory extracted
        window.addEventListener('memory-updated', () => {
            if (!this.panel.classList.contains('hidden')) {
                this.loadGraph();
            }
        });
    }

    private openPanel() {
        this.panel.classList.remove('hidden');
        // Small delay to allow display block to apply before opacity transition
        setTimeout(() => this.panel.classList.remove('opacity-0'), 10);
        this.loadGraph();
    }

    private closePanel() {
        this.panel.classList.add('opacity-0');
        setTimeout(() => this.panel.classList.add('hidden'), 300);
    }

    private async loadGraph() {
        this.loadingEl.classList.remove('hidden');
        try {
            const res = await fetch('/api/memory');
            const data = await res.json();
            this.renderNetwork(data.nodes || [], data.edges || []);
        } catch (e) {
            console.error("Failed to load graph memory", e);
        } finally {
            this.loadingEl.classList.add('hidden');
        }
    }

    private renderNetwork(rawNodes: any[], rawEdges: any[]) {
        if (!this.container) return;
        
        // Transform the DB generic nodes into Vis.js format
        const nodes = new vis.DataSet(rawNodes.map((n: any) => ({
            id: n.id,
            label: n.label,
            group: n.type,
            shape: 'dot',
            size: 20,
            font: { color: '#e4e4e7', size: 14, strokeWidth: 3, strokeColor: '#09090b', face: 'monospace' },
            borderWidth: 2,
            shadow: {
                enabled: true,
                color: 'rgba(0,0,0,0.5)',
                size: 10,
                x: 0,
                y: 0
            }
        })));

        const edges = new vis.DataSet(rawEdges.map((e: any) => ({
            from: e.source,
            to: e.target,
            label: e.label,
            arrows: {
                to: { enabled: true, scaleFactor: 0.5 }
            },
            color: { color: '#52525b', highlight: '#059669', hover: '#34d399' },
            font: { color: '#a1a1aa', size: 11, face: 'monospace', align: 'horizontal', background: '#09090b' },
            smooth: {
                type: 'dynamic',
                roundness: 0.5
            }
        })));

        const data = { nodes, edges };
        const options = {
            nodes: {
                color: {
                    border: '#27272a',
                    background: '#3f3f46',
                    highlight: { border: '#10b981', background: '#059669' },
                    hover: { border: '#34d399', background: '#10b981' }
                }
            },
            groups: {
                person: { color: { background: '#ef4444', border: '#7f1d1d' } },
                concept: { color: { background: '#3b82f6', border: '#1e3a8a' } },
                technology: { color: { background: '#8b5cf6', border: '#4c1d95' } },
                project: { color: { background: '#10b981', border: '#064e3b' } },
                entity: { color: { background: '#f59e0b', border: '#78350f' } }
            },
            physics: {
                forceAtlas2Based: {
                    gravitationalConstant: -26,
                    centralGravity: 0.005,
                    springLength: 230,
                    springConstant: 0.18
                },
                maxVelocity: 146,
                solver: 'forceAtlas2Based',
                timestep: 0.35,
                stabilization: { iterations: 150 }
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                hideEdgesOnDrag: true
            }
        };

        if (this.network) {
            this.network.destroy();
        }
        
        let targetDiv = document.getElementById('vis-network-canvas-target');
        if (!targetDiv) {
            targetDiv = document.createElement('div');
            targetDiv.id = 'vis-network-canvas-target';
            targetDiv.className = 'w-full h-full';
            this.container.insertBefore(targetDiv, this.loadingEl);
        }
        
        this.network = new vis.Network(targetDiv, data, options);
    }
}
