import { Mic, Square } from 'lucide-react';
import { useState, useRef } from 'react';

export function VoicePanel({ onVoiceInput }: { onVoiceInput?: (text: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [language, setLanguage] = useState<'vi-VN' | 'en-US'>('vi-VN');
  const recognitionRef = useRef<any>(null);

  const handleToggleRecord = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = language;

      recognition.onresult = (e: any) => {
        const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
        onVoiceInput?.(transcript);
        setIsRecording(false);
      };

      recognition.onerror = (e: any) => {
        console.error("Speech recognition error", e);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-300 flex items-center gap-2">
          <Mic size={16} className="text-emerald-400" />
          Voice Input
        </span>
        {isRecording && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setLanguage(lang => lang === 'vi-VN' ? 'en-US' : 'vi-VN')}
          className="flex-shrink-0 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          title="Toggle Language"
        >
          {language === 'vi-VN' ? '🇻🇳 VI' : '🇺🇸 EN'}
        </button>
        <button
          onClick={handleToggleRecord}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors ${isRecording
              ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
        >
          {isRecording ? <Square size={14} /> : <Mic size={14} />}
          {isRecording ? 'Stop' : 'Record'}
        </button>
      </div>
    </div>
  );
}
