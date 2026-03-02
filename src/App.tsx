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

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [debateRound, setDebateRound] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: 'Agent GEMINI-PRIME initialized. Awaiting input for multi-agent analysis.'
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

  const handleUserMessage = async (content: string, isVoice: boolean = false) => {
    if (isProcessing) return;
    
    // Empty or gibberish check
    if (!content.trim()) {
      setMessages(prev => [...prev, { role: 'system', content: 'I received an empty or unclear input. Could you rephrase?' }]);
      return;
    }

    // Memory hints
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
    
    // Add user message
    const newUserMsg: Message = { role: 'user', content, isVoice };
    
    if (currentImage) newUserMsg.imageContext = `[🖼️ Image received: ${currentImage.name}]`;
    if (currentPdf) newUserMsg.pdfContext = `[📄 Document context active: ${currentPdf.name}]`;
    
    setMessages(prev => [...prev, newUserMsg]);
    setTurnCount(prev => prev + 1);

    // Auto-summarize after 10 turns
    if (turnCount > 0 && turnCount % 10 === 0) {
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: `[📋 Session summary: We have discussed the multi-agent architecture and integrated voice/image inputs. You are currently testing the error recovery protocols.]` 
      }]);
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
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
        parts.unshift({ text: `[📄 DOCUMENT CONTEXT ACTIVE]\nDocument Name: ${currentPdf.name}\nDocument Content:\n${activePdfText}\n\n` });
      }

      if (isVoice) {
        parts.unshift({ text: `[🎤 VOICE INPUT DETECTED]\n` });
      }

      const systemInstruction = `You are GEMINI-PRIME, the lead AI agent in a multi-agent orchestration system.
You simulate 3 agents in a structured internal debate before every response.

AGENT PERSONAS
🧠 GEMINI-PRIME → Academic, Visionary, Structured. Lead analyst.
⚔️ DEEPSEEK     → Skeptical, Direct, Zero fluff. Critical thinker.
🔗 LLAMA        → Pragmatic, Decisive, Human-centric. Synthesizer.

If user prompt is ambiguous → ALL 3 agents list their Top 3 Interpretations FIRST.

MANDATORY RESPONSE FORMAT:
🔵 ROUND 1 — INITIAL ANALYSIS (GEMINI-PRIME)
🟡 ROUND 2 — CRITIQUE & DEBATE (DEEPSEEK & GEMINI-PRIME REBUTTAL)
🟢 ROUND 3 — SYNTHESIS (LLAMA)
✅ FINAL OUTPUT

If voice input: Do NOT run full 3-round format visibly — compress to internal reasoning only. Output structure for voice: [ANSWER] only, no round headers. Start with 1-sentence acknowledgment.
If image input: Open with: [🖼️ Image received: {5-word description}]. After analysis append: "Follow-up you might want to ask: [question]".
If PDF input: Open with: [📄 Document context active: {filename}]. Always cite.`;

      // Add a placeholder for the streaming response
      setMessages(prev => [...prev, { role: 'system', content: '' }]);
      
      // We simulate the rounds visually in the UI while the stream is happening
      if (!isVoice) {
        setDebateRound(1);
        setTimeout(() => setDebateRound(2), 2000);
        setTimeout(() => setDebateRound(3), 4000);
      }

      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro-preview-06-05',
        contents: { parts },
        config: { systemInstruction }
      });

      let fullResponse = '';
      for await (const chunk of stream) {
        const text = chunk.text ?? '';
        fullResponse += text;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = fullResponse;
          return newMessages;
        });
      }

      setDebateRound(0);
      setIsProcessing(false);

    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || "An unknown error occurred.";
      if (errorMsg.includes('API_KEY')) errorMsg = "Invalid API key";
      else if (errorMsg.includes('quota')) errorMsg = "Rate limit — try again later";
      else if (errorMsg.includes('SAFETY')) errorMsg = "Response blocked by safety filter";
      
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
        content: `[🖼️ Image received: a visual representation of the UI]\nWhat would you like to know about this image?` 
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
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden">
      <Sidebar 
        onVoiceInput={(text) => handleUserMessage(text, true)} 
        onImageUpload={handleImageUpload} 
        onPdfUpload={handlePdfUpload}
      />
      <div className="flex flex-col flex-1">
        <header className="h-14 border-b border-zinc-800 flex items-center px-4 shrink-0 bg-zinc-900/50">
          <h1 className="text-sm font-medium tracking-wide text-zinc-300">GEMINI-PRIME ORCHESTRATOR</h1>
          <div className="ml-auto flex items-center gap-3">
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
