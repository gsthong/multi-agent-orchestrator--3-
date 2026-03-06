import { Send, User, Bot, Mic } from 'lucide-react';
import React, { useState } from 'react';
import { Message } from '../App';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Ensure you import the CSS for equations

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
            <div className={`text-sm p-3 rounded-lg border max-w-[80%] whitespace-pre-wrap ${msg.role === 'user'
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-100'
              : 'bg-zinc-900/50 border-zinc-800/50 text-zinc-300 w-full'
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
              {msg.role === 'system' ? (
                <div className="prose prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-lg prose-td:border prose-td:border-zinc-800 prose-th:border prose-th:border-zinc-800 prose-th:bg-zinc-900/50 prose-a:text-blue-400 max-w-none break-words text-[15px]">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '')
                        return !inline ? (
                          <div className="relative group">
                            <div className="absolute top-0 right-0 px-3 py-1 text-xs font-mono text-zinc-500 bg-zinc-800/50 rounded-bl-lg rounded-tr-lg border-b border-l border-zinc-700/50 uppercase tracking-wider backdrop-blur-sm">
                              {match?.[1] || 'text'}
                            </div>
                            <code className={`${className} block p-4 bg-[#0d1117] text-zinc-300 overflow-x-auto text-[13px] leading-relaxed font-mono rounded-lg border border-zinc-800/80 shadow-inner`} {...props}>
                              {children}
                            </code>
                          </div>
                        ) : (
                          <code className="bg-zinc-800/80 text-blue-300 px-1.5 py-0.5 rounded text-[13px] font-mono border border-zinc-700/50" {...props}>
                            {children}
                          </code>
                        )
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {isProcessing && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex flex-col gap-2 items-start animate-pulse">
            <span className="text-xs font-medium text-blue-400 flex items-center gap-1">
              <Bot size={12} className="animate-spin-slow" />
              SYSTEM THINKING...
            </span>
            <div className="bg-zinc-900/40 border border-zinc-800/50 text-zinc-400 p-4 rounded-lg w-3/4 text-sm font-mono flex flex-col gap-2 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-ping"></div>
                <span>Interrogating Prime Directive...</span>
              </div>
              <div className="flex items-center gap-3 opacity-60">
                <div className="h-1.5 w-1.5 bg-orange-500 rounded-full"></div>
                <span>Awaiting DeepSeek Validation...</span>
              </div>
              <div className="flex items-center gap-3 opacity-40">
                <div className="h-1.5 w-1.5 bg-purple-500 rounded-full"></div>
                <span>Qwen Architecture Review...</span>
              </div>
            </div>
          </div>
        )}
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
