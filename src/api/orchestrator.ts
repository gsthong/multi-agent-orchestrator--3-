import { GoogleGenAI } from '@google/genai';
import { StorageUtils } from '../utils/storage';

export class OrchestratorAPI {
    /**
     * Helper function to call the Groq completions endpoint.
     */
    private static async callGroq(model: string, systemPrompt: string, userPrompt: string, onUpdate?: (chunk: string) => void, temperature?: number): Promise<string> {
        const groqKey = StorageUtils.getGroqKey();
        if (!groqKey) throw new Error("Groq API Key is missing.");

        const body: any = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            stream: !!onUpdate
        };

        if (temperature !== undefined) {
            body.temperature = temperature;
        }

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
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
     * Generates a short 3-4 word title for a new chat session using Gemini
     */
    static async generateTitle(firstPrompt: string): Promise<string> {
        const geminiKey = StorageUtils.getApiKey();
        if (!geminiKey) return "New Chat";

        try {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const prompt = `Invent a very short, maximum 4-word descriptive title for a chat session that starts with this prompt:\n"${firstPrompt}"\n\nOutput strictly the title text, nothing else, no quotes.`;
            const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            return res.text?.trim()?.replace(/["']/g, '') || "New Chat";
        } catch (e) {
            console.error("Failed to generate title", e);
            return "New Chat";
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
        onStateUpdate: (state: string, output?: string) => void,
        onFinalToken: (text: string) => void,
    ): Promise<string> {

        // Check both keys
        const geminiKey = StorageUtils.getApiKey();
        const groqKey = StorageUtils.getGroqKey();
        const settings = StorageUtils.getAdvancedSettings();

        if (!geminiKey || !groqKey) {
            throw new Error("API Keys are missing. Please configure both Gemini and Groq keys in settings.");
        }

        const ai = new GoogleGenAI({ apiKey: geminiKey });

        // Get conversation history to provide context
        const session = StorageUtils.getActiveHistory();
        let historyContext = "";
        if (session.messages.length > 0) {
            historyContext = "CONVERSATION HISTORY:\n";
            session.messages.forEach(m => {
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
            onStateUpdate('gemini_done', r1Output);

            // -----------------------------------------------------
            // ROUND 2-4: PARALLEL EXECUTION (DeepSeek, Qwen, Mixtral)
            // -----------------------------------------------------
            const promises: Promise<string>[] = [];

            if (settings.useDeepSeek) {
                onStateUpdate('deepseek');
                promises.push(
                    this.callGroq(
                        settings.models.deepSeek,
                        'You are DEEPSEEK-REASONER, a rigorous, analytical, and highly logical AI. Your objective is to peer-review the initial analysis provided by GEMINI-PRIME against the user\'s prompt. Identify logical gaps, invalid assumptions, edge cases, and potential inefficiencies. Provide highly optimized, constructive alternatives. Output ONLY your review and proposed optimizations.',
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`
                    ).then(res => {
                        onStateUpdate('deepseek_done', res);
                        return `DEEPSEEK CRITIQUE:\n${res}`;
                    })
                );
            } else {
                promises.push(Promise.resolve('DEEPSEEK: SKIPPED BY USER LOGIC'));
            }

            if (settings.useQwen) {
                onStateUpdate('qwen');
                promises.push(
                    this.callGroq(
                        settings.models.qwen,
                        'You are QWEN-ARCHITECT, an incredibly thorough, detail-oriented engineering expert. Review the USER PROMPT and GEMINI ANALYSIS. Provide a grounded, structured perspective focusing on practical execution. Detail exactly how to implement the best ideas, focusing on modern best practices, clean code/patterns, scalability, and handling edge cases.',
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`
                    ).then(res => {
                        onStateUpdate('qwen_done', res);
                        return `QWEN IMPLEMENTATION:\n${res}`;
                    })
                );
            } else {
                promises.push(Promise.resolve('QWEN: SKIPPED BY USER LOGIC'));
            }

            if (settings.useMixtral) {
                onStateUpdate('mixtral');
                promises.push(
                    this.callGroq(
                        settings.models.mixtral,
                        'You are MIXTRAL-CREATOR, an outside-the-box thinker and security expert. You look at the problem from an entirely different angle. Review the USER PROMPT and GEMINI ANALYSIS. Point out any massive blind spots, security vulnerabilities, or drastically simpler/more creative ways to solve the problem that earlier analysis missed.',
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`
                    ).then(res => {
                        onStateUpdate('mixtral_done', res);
                        return `MIXTRAL BLINDSPOTS:\n${res}`;
                    })
                );
            } else {
                promises.push(Promise.resolve('MIXTRAL: SKIPPED BY USER LOGIC'));
            }

            const [r2Output, r3Output, r4Output] = await Promise.all(promises);

            // -----------------------------------------------------
            // ROUND 5: GEMMA (Formatting & LaTeX Architect)
            // -----------------------------------------------------
            onStateUpdate('gemma');
            const r5Output = await this.callGroq(
                settings.models.gemma,
                'You are GEMMA-FORMATTER, a technical documentation specialist. You will review the chaotic debate and organize the absolute best technical concepts into a strict structural template. You MUST structure math logic using proper LaTeX formatting ($ inline and $$ block). Output pure structured logic without fluff.',
                `USER PROMPT:\n${fullPrompt}\n\nDEBATE TRANSCRIPT:\nGemini: ${r1Output}\nDeepSeek: ${r2Output}\nQwen: ${r3Output}\nMixtral: ${r4Output}`
            );
            onStateUpdate('gemma_done', r5Output);

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

            const debateContext = `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}\n\n${r2Output}\n\n${r3Output}\n\n${r4Output}\n\nGEMMA STRUCTURE:\n${r5Output}`;

            // This call is streamed directly to the frontend via the callback
            const finalSynthesizedOutput = await this.callGroq(
                settings.models.llama,
                finalSystemPrompt,
                debateContext,
                onFinalToken,
                settings.temperature
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
