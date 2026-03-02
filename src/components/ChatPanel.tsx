import { Send, User, Bot, Mic } from 'lucide-react';
import React, { useState } from 'react';
import { Message } from '../App';

export function ChatPanel({ messages, onSendMessage, isProcessing, messagesEndRef }: { messages: Message[], onSendMessage: (msg: string) => void, isProcessing: boolean, messagesEndRef: React.RefObject<HTMLDivElement | null> }) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex-1 flex flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <span className="text-xs font-medium text-zinc-500 flex items-center gap-1">
              {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
              {msg.role.toUpperCase()}
            </span>
            <div className={`text-sm p-3 rounded-lg border max-w-[80%] whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'bg-blue-500/10 border-blue-500/20 text-blue-100' 
                : 'bg-zinc-900/50 border-zinc-800/50 text-zinc-300'
            }`}>
              {msg.isVoice && (
                <div className="flex items-center gap-1 text-emerald-400 mb-1 font-semibold text-xs">
                  <Mic size={12} /> [🎤 VOICE]
                </div>
              )}
              {msg.imageContext && (
                <div className="text-purple-400 mb-1 font-mono text-xs">
                  {msg.imageContext}
                </div>
              )}
              {msg.pdfContext && (
                <div className="text-blue-400 mb-1 font-mono text-xs">
                  {msg.pdfContext}
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="relative flex items-center">
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Enter query for multi-agent analysis..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-4 pr-12 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-12"
            rows={1}
          />
          <button 
            onClick={handleSend}
            disabled={isProcessing}
            className={`absolute right-2 p-2 transition-colors ${isProcessing ? 'text-zinc-600' : 'text-zinc-400 hover:text-blue-400'}`}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
