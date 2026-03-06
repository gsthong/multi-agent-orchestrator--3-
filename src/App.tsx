import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { AgentDebateView } from './components/AgentDebateView';
import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

export type Message = {
  role: 'system' | 'user';
  content: string;
  isVoice?: boolean;
  imageContext?: string;
  pdfContext?: string;
};

async function streamGroqRequest(model: string, apiKey: string, systemPrompt: string, userPrompt: string, onToken: (t: string) => void) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: true
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API Error (${res.status}): ${errorText}`);
  }

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) return;

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim().startsWith('data: ')) {
        const dataStr = line.trim().slice(6);
        if (dataStr === '[DONE]') continue;
        try {
          const data = JSON.parse(dataStr);
          const text = data.choices[0]?.delta?.content || '';
          if (text) onToken(text);
        } catch (e) {
          // Ignore partial parse
        }
      }
    }
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');

  const [showApiKeyModal, setShowApiKeyModal] = useState(true);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [groqKeyInput, setGroqKeyInput] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [debateRound, setDebateRound] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Agent GEMINI-PRIME initialized. Awaiting input for multi-agent synthesis.'
    }
  ]);
  const [activeImage, setActiveImage] = useState<File | null>(null);
  const [activePdf, setActivePdf] = useState<File | null>(null);
  const [activePdfText, setActivePdfText] = useState<string>('');
  const [turnCount, setTurnCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleClearChat = () => {
    setMessages([
      {
        role: 'system',
        content: 'Agent GEMINI-PRIME initialized. Awaiting input for multi-agent synthesis.'
      }
    ]);
    setTurnCount(0);
    setActiveImage(null);
    setActivePdf(null);
    setActivePdfText('');
  };

  const handleExportChat = () => {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    let md = `# GEMINI-PRIME Session Export\n## [${timestamp}]\n\n`;
    messages.forEach(msg => {
      md += `**${msg.role === 'user' ? 'USER' : 'AGENT'}:**\n${msg.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUserMessage = async (content: string, isVoice: boolean = false) => {
    if (isProcessing) return;

    if (!apiKey || !groqApiKey) {
      setShowApiKeyModal(true);
      return;
    }

    if (!content.trim()) {
      setMessages(prev => [...prev, { role: 'system', content: 'I received an empty or unclear input. Could you rephrase?' }]);
      return;
    }

    const lowerContent = content.toLowerCase();
    let currentImage = activeImage;
    let currentPdf = activePdf;

    if (lowerContent.includes("forget that")) {
      setActiveImage(null);
      setActivePdf(null);
      setActivePdfText('');
      currentImage = null;
      currentPdf = null;
    }

    setIsProcessing(true);
    setDebateRound(1);

    const newUserMsg: Message = { role: 'user', content, isVoice };
    if (currentImage) newUserMsg.imageContext = `[🖼️ Image received: ${currentImage.name}]`;
    if (currentPdf) newUserMsg.pdfContext = `[📄 Document context active: ${currentPdf.name}]`;

    setMessages(prev => [...prev, newUserMsg, { role: 'system', content: '' }]);
    setTurnCount(prev => prev + 1);

    try {
      // -----------------------------------------------------
      // ROUND 1: GEMINI-PRIME (Lead Analyst)
      // -----------------------------------------------------
      const geminiClient = new GoogleGenAI({ apiKey });
      const parts: any[] = [{ text: content }];

      if (currentImage) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(currentImage!);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
        });
        parts.unshift({ inlineData: { mimeType: currentImage.type, data: base64 } });
      }

      if (currentPdf) {
        const pdfBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(currentPdf!);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
        });
        parts.unshift({ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } });
        parts.unshift({ text: `[📄 DOCUMENT CONTEXT ACTIVE]\nDocument Name: ${currentPdf.name}\n\n` });
      }

      if (isVoice) {
        parts.unshift({ text: `[🎤 VOICE INPUT DETECTED]\n` });
      }

      const geminiInstruction = `You are GEMINI-PRIME, an elite lead analyst and architectural thinker. Provide a comprehensive, multi-dimensional ANALYSIS of the user's prompt (and any attached context). Break down the core intent, analyze constraints, and propose a clear, structured theoretical approach. Focus on structural integrity, clarity, and laying out the problem space accurately. Do NOT just give the final answer; your goal is to establish the absolute best foundational context and step-by-step logic for other agents to build upon. Be precise, logical, and highly structured (use headings and bullet points).`;

      // Set empty placeholder for the final answer
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = 'Đang phân tích và tổng hợp thông tin từ đa tác vụ... (Analyzing and synthesizing...)';
        return newMessages;
      });

      const geminiStream = await geminiClient.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: parts,
        config: { systemInstruction: geminiInstruction }
      });

      let r1Output = '';

      for await (const chunk of geminiStream) {
        const text = chunk.text ?? '';
        r1Output += text;
      }

      // -----------------------------------------------------
      // ROUND 2: DEEPSEEK (Critique via Groq)
      // -----------------------------------------------------
      setDebateRound(2);

      let r2ActualContent = '';
      await streamGroqRequest(
        'deepseek-r1-distill-llama-70b',
        groqApiKey,
        'You are DEEPSEEK-REASONER, a rigorous, analytical, and highly logical AI. Your objective is to peer-review the initial analysis provided by GEMINI-PRIME against the user\'s prompt. Identify logical gaps, invalid assumptions, edge cases, and potential inefficiencies. Instead of just tearing down ideas, provide highly optimized, constructive alternatives and point out exactly how to improve the approach. Be direct, objective, and focus on practical improvements. Output ONLY your review and proposed optimizations.',
        `USER PROMPT:\n${content}\n\nGEMINI ANALYSIS:\n${r1Output}`,
        (text) => {
          r2ActualContent += text;
        }
      );

      // -----------------------------------------------------
      // ROUND 3: QWEN (Detail Analysis via Groq)
      // -----------------------------------------------------
      setDebateRound(3);

      let r3ActualContent = '';
      await streamGroqRequest(
        'qwen-2.5-32b',
        groqApiKey,
        'You are QWEN-ARCHITECT, an incredibly thorough, detail-oriented engineering and implementation expert. Review the USER PROMPT, GEMINI ANALYSIS, and DEEPSEEK CRITIQUE. Provide a grounded, structured perspective focusing on practical execution. Detail exactly how to implement the best ideas from both prior agents, focusing on modern best practices, clean code/patterns, scalability, and handling edge cases. Bring harmony to the theoretical and critical perspectives by providing concrete, actionable implementation steps or detailed explanations.',
        `USER PROMPT:\n${content}\n\nGEMINI ANALYSIS:\n${r1Output}\n\nDEEPSEEK CRITIQUE:\n${r2ActualContent}`,
        (text) => {
          r3ActualContent += text;
        }
      );

      // -----------------------------------------------------
      // ROUND 4: LLAMA (Synthesis via Groq)
      // -----------------------------------------------------
      setDebateRound(4);
      let r4Output = '';

      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = '';
        return newMessages;
      });

      await streamGroqRequest(
        'llama-3.3-70b-versatile',
        groqApiKey,
        'You are the ULTIMATE SYNTHESIZER LLAMA-PRIME. You have access to: the User Prompt, Gemini\'s foundational analysis, DeepSeek\'s rigorous review, and Qwen\'s implementation details. Your ONLY job is to synthesize all of this intelligence into a single, PERFECT, COMPREHENSIVE, AND DIRECT response for the User.\n\nCRITICAL INSTRUCTIONS:\n1. Be highly natural, empathetic, and professional. Respond directly to the user as a single, incredibly intelligent entity. DO NOT mention the other agents (e.g., do not say "Gemini said", "Based on my analysis", or "I have synthesized").\n2. Synthesize the insights seamlessly into the actual final solution, explanation, or code derived from their debate.\n3. Your ENTIRE response MUST be in fluent, remarkably natural Vietnamese phrasing. Avoid robotic translation tones. DO NOT output ANY Chinese characters under any circumstances.\n4. Format your response elegantly using Markdown (clear headings, bullet points, bold text for emphasis).\n5. If code is needed, provide production-ready, highly optimized, and well-commented code in Markdown blocks.\n6. Be highly precise, cutting out fluff, but remain incredibly helpful and thorough.',
        `USER PROMPT:\n${content}\n\nGEMINI ANALYSIS:\n${r1Output}\n\nDEEPSEEK CRITIQUE:\n${r2ActualContent}\n\nQWEN ANALYSIS:\n${r3ActualContent}`,
        (text) => {
          r4Output += text;
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = r4Output;
            return newMessages;
          });
        }
      );

      setDebateRound(0);
      setIsProcessing(false);

    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || "An unknown error occurred.";
      if (errorMsg.includes('API_KEY')) errorMsg = "Invalid API key";
      else if (errorMsg.includes('quota') || errorMsg.includes('429')) errorMsg = "Rate limit hit on one of the APIs — try again later";

      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages[newMessages.length - 1].content === '') {
          newMessages[newMessages.length - 1].content = `[⚠️ ERROR] ${errorMsg}`;
        } else {
          newMessages.push({ role: 'system', content: `[⚠️ ERROR] ${errorMsg}` });
        }
        return newMessages;
      });
      setIsProcessing(false);
      setDebateRound(0);
    }
  };

  const handleImageUpload = (file: File) => {
    setActiveImage(file);
    if (file) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `[🖼️ Image received: ${file.name}]\nWhat would you like to know about this image?`
      }]);
    }
  };

  const handlePdfUpload = (file: File | null, text?: string) => {
    setActivePdf(file);
    setActivePdfText(text || '');
    if (file) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `[📄 Document context active: ${file.name}]\nI have loaded the document. What specific information are you looking for?`
      }]);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden relative">
      {showApiKeyModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl w-[400px] shadow-2xl">
            <h2 className="text-lg font-bold text-zinc-100 mb-2">Welcome to Multi-Agent Pro</h2>
            <p className="text-sm text-zinc-400 mb-4">Please enter your API Keys to continue. They are stored temporarily for this session.</p>

            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs text-zinc-400 font-medium mb-1 block">Google Gemini API Key (Gemini-Prime)</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 font-medium mb-1 block">Groq API Key (DeepSeek / Qwen / Llama 3)</label>
                <input
                  type="password"
                  placeholder="gsk_..."
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="hover:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                disabled={!apiKey || !groqApiKey}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (apiKeyInput.trim() && groqKeyInput.trim()) {
                    setApiKey(apiKeyInput.trim());
                    setGroqApiKey(groqKeyInput.trim());
                    setShowApiKeyModal(false);
                  }
                }}
                disabled={!apiKeyInput.trim() || !groqKeyInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Save Keys
              </button>
            </div>
          </div>
        </div>
      )}
      <Sidebar
        onVoiceInput={(text) => handleUserMessage(text, true)}
        onImageUpload={handleImageUpload}
        onPdfUpload={handlePdfUpload}
      />
      <div className="flex flex-col flex-1">
        <header className="h-14 border-b border-zinc-800 flex items-center px-4 shrink-0 bg-zinc-900/50">
          <h1 className="text-sm font-medium tracking-wide text-zinc-300">MULTI-AGENT ORCHESTRATOR</h1>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={handleClearChat} className="text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition">Clear</button>
            <button onClick={handleExportChat} className="text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition">Export Chat</button>
            <button onClick={() => {
              setApiKeyInput(apiKey);
              setGroqKeyInput(groqApiKey);
              setShowApiKeyModal(true);
            }}
              className="text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition flex items-center gap-1"
            >
              🔑 API Keys
            </button>
            <span className="w-px h-4 bg-zinc-700 mx-1"></span>

            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isProcessing ? 'bg-orange-400' : 'bg-emerald-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isProcessing ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              {isProcessing ? 'Processing...' : 'System Online'}
            </span>
          </div>
        </header>
        <main className="flex-1 flex overflow-hidden">
          <ChatPanel
            messages={messages}
            onSendMessage={(msg) => handleUserMessage(msg, false)}
            isProcessing={isProcessing}
            messagesEndRef={messagesEndRef}
          />
          <AgentDebateView round={debateRound} isProcessing={isProcessing} />
        </main>
      </div>
    </div>
  );
}
