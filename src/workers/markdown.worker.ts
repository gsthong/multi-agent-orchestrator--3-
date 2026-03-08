import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';

const renderer = new marked.Renderer();

renderer.code = ({ text, lang }) => {
    const languageClass = lang ? `language-${lang}` : 'language-txt';
    const escapedCode = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    return `
<div class="code-block-wrapper relative group bg-zinc-950 rounded-lg my-4 border border-zinc-800 overflow-hidden">
    <div class="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 font-mono">
        <span>${lang || 'text'}</span>
        <button class="copy-code-btn hover:text-white transition flex items-center gap-1" data-code="${escapedCode}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy
        </button>
    </div>
    <div class="p-4 overflow-x-auto text-sm">
        <pre><code class="${languageClass}">${escapedCode}</code></pre>
    </div>
</div>`;
};

// Configure marked to use standard GitHub flavored markdown features
marked.setOptions({
    breaks: true, // Convert \n to <br>
    gfm: true, // Use GitHub Flavored Markdown
    renderer: renderer
});

// Add KaTeX support
marked.use(markedKatex({
    throwOnError: false,
    displayMode: true
}));

self.onmessage = (e: MessageEvent) => {
    const { id, text } = e.data;
    try {
        const html = marked.parse(text) as string;
        self.postMessage({ id, html });
    } catch (err) {
        console.error("Markdown parsing error in worker:", err);
    }
};
