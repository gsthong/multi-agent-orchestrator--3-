import { GoogleGenAI } from '@google/genai';
import { StorageUtils } from '../utils/storage';

export class OrchestratorAPI {
    /**
     * Helper function to call the Groq completions endpoint.
     */
    private static async callGroq(model: string, systemPrompt: string, userPrompt: string, onUpdate?: (chunk: string) => void): Promise<string> {
        const groqKey = StorageUtils.getGroqKey();
        if (!groqKey) throw new Error("Groq API Key is missing.");

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: !!onUpdate
            })
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Groq API Error (${res.status}): ${errorText}`);
        }

        if (onUpdate) {
            let fullContent = '';
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) return '';

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
                            if (text) {
                                fullContent += text;
                                onUpdate(text);
                            }
                        } catch (e) {
                            // Ignore partial JSON parse errors inherently caused by chunk splits
                        }
                    }
                }
            }
            return fullContent;
        } else {
            const data = await res.json();
            return data.choices?.[0]?.message?.content || "";
        }
    }

    /**
     * The 6 Agent Pipeline
     * @param newMessage The user prompt
     * @param onStateUpdate Callback for when a new agent starts thinking
     * @param onFinalToken Callback for streaming the final Llama response to the UI
     */
    static async startDebate(
        newMessage: string,
        onStateUpdate: (state: string) => void,
        onFinalToken: (text: string) => void,
    ): Promise<string> {

        // Check both keys
        const geminiKey = StorageUtils.getApiKey();
        const groqKey = StorageUtils.getGroqKey();

        if (!geminiKey || !groqKey) {
            throw new Error("API Keys are missing. Please configure both Gemini and Groq keys in settings.");
        }

        const ai = new GoogleGenAI({ apiKey: geminiKey });

        // Get conversation history to provide context (we'll format it as a single string for simplicity in the hidden debate)
        const history = StorageUtils.getHistory();
        let historyContext = "";
        if (history.messages.length > 0) {
            historyContext = "CONVERSATION HISTORY:\n";
            history.messages.forEach(m => {
                historyContext += `[${m.role.toUpperCase()}]: ${m.parts[0].text}\n`;
            });
        }

        const fullPrompt = `${historyContext}\n\nCURRENT USER PROMPT: ${newMessage}`;

        try {
            // -----------------------------------------------------
            // ROUND 1: GEMINI-PRIME (Lead Analyst)
            // -----------------------------------------------------
            onStateUpdate('gemini');
            const geminiInstruction = `You are GEMINI-PRIME, an elite lead analyst and architectural thinker. Provide a comprehensive, multi-dimensional ANALYSIS of the user's prompt. Break down the core intent, analyze constraints, and propose a clear, structured theoretical approach. Do NOT just give the final answer; your goal is to establish the absolute best foundational context and step-by-step logic for other agents to build upon. Be precise, logical, and highly structured.`;

            const geminiRes = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                config: { systemInstruction: geminiInstruction }
            });
            const r1Output = geminiRes.text || '';

            // -----------------------------------------------------
            // ROUND 2: DEEPSEEK (Critique)
            // -----------------------------------------------------
            onStateUpdate('deepseek');
            const r2Output = await this.callGroq(
                'deepseek-r1-distill-llama-70b',
                'You are DEEPSEEK-REASONER, a rigorous, analytical, and highly logical AI. Your objective is to peer-review the initial analysis provided by GEMINI-PRIME against the user\'s prompt. Identify logical gaps, invalid assumptions, edge cases, and potential inefficiencies. Provide highly optimized, constructive alternatives. Output ONLY your review and proposed optimizations.',
                `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`
            );

            // -----------------------------------------------------
            // ROUND 3: QWEN (Practical Execution)
            // -----------------------------------------------------
            onStateUpdate('qwen');
            const r3Output = await this.callGroq(
                'qwen-2.5-32b',
                'You are QWEN-ARCHITECT, an incredibly thorough, detail-oriented engineering expert. Review the USER PROMPT, GEMINI ANALYSIS, and DEEPSEEK CRITIQUE. Provide a grounded, structured perspective focusing on practical execution. Detail exactly how to implement the best ideas from both prior agents, focusing on modern best practices, clean code/patterns, scalability, and handling edge cases.',
                `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}\n\nDEEPSEEK CRITIQUE:\n${r2Output}`
            );

            // -----------------------------------------------------
            // ROUND 4: MIXTRAL (Creative / Security Alternative)
            // -----------------------------------------------------
            onStateUpdate('mixtral');
            const r4Output = await this.callGroq(
                'mixtral-8x7b-32768',
                'You are MIXTRAL-CREATOR, an outside-the-box thinker and security expert. You look at the problem from an entirely different angle. Review the entire debate so far. Point out any massive blind spots, security vulnerabilities, or drastically simpler/more creative ways to solve the problem that earlier agents missed.',
                `USER PROMPT:\n${fullPrompt}\n\nGEMINI:\n${r1Output}\n\nDEEPSEEK:\n${r2Output}\n\nQWEN:\n${r3Output}`
            );

            // -----------------------------------------------------
            // ROUND 5: GEMMA (Formatting & LaTeX Architect)
            // -----------------------------------------------------
            onStateUpdate('gemma');
            const r5Output = await this.callGroq(
                'gemma2-9b-it',
                'You are GEMMA-FORMATTER, a technical documentation specialist. You will review the chaotic debate and organize the absolute best technical concepts into a strict structural template. You MUST structure math logic using proper LaTeX formatting ($ inline and $$ block). Output pure structured logic without fluff.',
                `USER PROMPT:\n${fullPrompt}\n\nDEBATE TRANSCRIPT:\nGemini: ${r1Output}\nDeepSeek: ${r2Output}\nQwen: ${r3Output}\nMixtral: ${r4Output}`
            );

            // -----------------------------------------------------
            // ROUND 6: LLAMA (Ultimate Synthesizer - Streamed to UI)
            // -----------------------------------------------------
            onStateUpdate('llama');

            const finalSystemPrompt = `You are the ULTIMATE SYNTHESIZER LLAMA-PRIME. You have access to: the User Prompt and a massive multi-agent debate transcript containing architectural design, critiques, alternative approaches, and LaTeX formatting guidelines. 

CRITICAL INSTRUCTIONS:
1. Your ENTIRE response MUST be in fluent, natural Vietnamese.
2. Synthesize all the genius insights seamlessly into the actual final perfect solution.
3. NEVER mention the other agents (do not say "Gemini said", "DeepSeek found", etc.). Speak as a single omnipotent entity.
4. Format your response beautifully using Markdown. Use **bolding**, tables, and bullet points.
5. If math is involved, use STRICT LaTeX formatting ($ inline $, $$ block $$).
6. If code is involved, provide production-ready, highly optimized, and well-commented code in Markdown blocks.
7. Be direct, brilliant, and eliminate all fluff.`;

            const debateContext = `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}\n\nDEEPSEEK CRITIQUE:\n${r2Output}\n\nQWEN IMPLEMENTATION:\n${r3Output}\n\nMIXTRAL BLINDSPOTS:\n${r4Output}\n\nGEMMA STRUCTURE:\n${r5Output}`;

            // This call is streamed directly to the frontend via the callback
            const finalSynthesizedOutput = await this.callGroq(
                'llama-3.3-70b-versatile',
                finalSystemPrompt,
                debateContext,
                onFinalToken
            );

            return finalSynthesizedOutput;

        } catch (err: any) {
            console.error("Orchestrator Sequence Error:", err);
            let errorMsg = "An unexpected error occurred during the multi-agent debate.";

            if (err.message) {
                if (err.message.includes("API_KEY_INVALID") || err.message.includes("401")) errorMsg = "Invalid API Key provided. Please check settings.";
                else if (err.message.includes("quota") || err.message.includes("429")) errorMsg = "Rate limit exceeded on one of the APIs. Please try again.";
                else errorMsg = err.message;
            }
            throw new Error(errorMsg);
        }
    }
}
