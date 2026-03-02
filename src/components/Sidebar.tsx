import { Settings } from 'lucide-react';
import { PdfUpload } from './PdfUpload';
import { ImageUpload } from './ImageUpload';
import { VoicePanel } from './VoicePanel';

export function Sidebar({ onVoiceInput, onImageUpload, onPdfUpload }: { onVoiceInput?: (text: string) => void, onImageUpload?: (file: File) => void, onPdfUpload?: (file: File | null, text?: string) => void }) {
  return (
    <div className="w-72 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-500 tracking-wider uppercase mb-4">Input Sources</h2>
        <PdfUpload onPdfUpload={onPdfUpload} />
        <ImageUpload onImageUpload={onImageUpload} />
      </div>
      <div className="p-4 border-b border-zinc-800">
        <VoicePanel onVoiceInput={onVoiceInput} />
      </div>
      <div className="mt-auto p-4 border-t border-zinc-800">
        <button className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors w-full p-2 rounded-md hover:bg-zinc-800/50">
          <Settings size={16} />
          <span>System Configuration</span>
        </button>
      </div>
    </div>
  );
}
