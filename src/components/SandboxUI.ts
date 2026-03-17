/**
 * SandboxUI — Feature 13: WebContainer Live Code Sandbox
 *
 * Provides an in-browser code editor and live preview environment.
 * Users can write HTML/CSS/JS and see results instantly.
 * Formatted for a premium "IDE" feel.
 */
export class SandboxUI {
    private panelEl: HTMLElement | null;
    private openBtn: HTMLElement | null;
    private closeBtn: HTMLElement | null;
    private editorEl: HTMLTextAreaElement | null;
    private previewEl: HTMLIFrameElement | null;
    private tabBtns: NodeListOf<HTMLElement> | null;
    private runBtn: HTMLButtonElement | null;

    private files: Record<string, string> = {
        'index.html': '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #18181b; color: #fff; }\n    h1 { color: #3b82f6; }\n  </style>\n</head>\n<body>\n  <h1>Hello from Sandbox!</h1>\n  <p id="time"></p>\n  <script src="script.js"></script>\n</body>\n</html>',
        'script.js': 'setInterval(() => {\n  document.getElementById("time").innerText = new Date().toLocaleTimeString();\n}, 1000);',
        'style.css': '/* Add your styles here */'
    };
    private currentFile: string = 'index.html';

    constructor() {
        this.panelEl = document.getElementById('sandbox-panel');
        this.openBtn = document.getElementById('open-sandbox-btn');
        this.closeBtn = document.getElementById('close-sandbox-btn');
        this.editorEl = document.getElementById('sandbox-editor') as HTMLTextAreaElement;
        this.previewEl = document.getElementById('sandbox-preview') as HTMLIFrameElement;
        this.tabBtns = document.querySelectorAll('.sandbox-tab');
        this.runBtn = document.getElementById('run-sandbox-btn') as HTMLButtonElement;

        this.bindEvents();
        this.loadFile(this.currentFile);
    }

    private bindEvents() {
        this.openBtn?.addEventListener('click', () => this.show());
        this.closeBtn?.addEventListener('click', () => this.hide());
        
        this.tabBtns?.forEach(btn => {
            btn.addEventListener('click', () => {
                const file = btn.getAttribute('data-file');
                if (file) this.loadFile(file);
            });
        });

        this.editorEl?.addEventListener('input', () => {
            this.files[this.currentFile] = this.editorEl!.value;
        });

        this.runBtn?.addEventListener('click', () => this.run());
    }

    private show() {
        this.panelEl?.classList.remove('hidden');
        this.panelEl?.classList.add('flex');
        this.run();
    }

    private hide() {
        this.panelEl?.classList.add('hidden');
        this.panelEl?.classList.remove('flex');
    }

    private loadFile(fileName: string) {
        // Save current
        if (this.editorEl) this.files[this.currentFile] = this.editorEl.value;
        
        this.currentFile = fileName;
        if (this.editorEl) this.editorEl.value = this.files[fileName];
        
        this.tabBtns?.forEach(btn => {
            btn.classList.toggle('bg-zinc-700', btn.getAttribute('data-file') === fileName);
            btn.classList.toggle('text-white', btn.getAttribute('data-file') === fileName);
        });
    }

    private run() {
        if (!this.previewEl) return;

        const html = this.files['index.html'];
        const js = this.files['script.js'];
        const css = this.files['style.css'];

        const fullHtml = html
            .replace('</head>', `<style>${css}</style></head>`)
            .replace('<script src="script.js"></script>', `<script>${js}</script>`);

        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        this.previewEl.src = url;
    }

    public updateCode(fileName: string, content: string) {
        if (this.files[fileName] !== undefined) {
            this.files[fileName] = content;
            if (this.currentFile === fileName && this.editorEl) {
                this.editorEl.value = content;
            }
            this.run();
        }
    }
}
