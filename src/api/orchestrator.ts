import { GoogleGenAI } from '@google/genai';
import { StorageUtils } from '../utils/storage';

export class OrchestratorAPI {
    /**
     * Helper function to call the Groq completions endpoint.
     */
    private static async callGroq(model: string, systemPrompt: string, userPrompt: string, onUpdate?: (chunk: string) => void, temperature?: number, agentId?: string): Promise<string> {
        const groqKey = StorageUtils.getGroqKey();
        if (!groqKey) throw new Error("Groq API Key is missing.");

        let startTime = 0;
        if (agentId) {
            this.emitTelemetry(agentId, 0, 0, 'active');
            startTime = performance.now();
        }

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
            if (agentId) {
                const endTime = performance.now();
                const estTokens = Math.ceil((systemPrompt.length + userPrompt.length + fullContent.length) / 4);
                this.emitTelemetry(agentId, estTokens, endTime - startTime, 'done');
            }
            return fullContent;
        } else {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content || "";
            if (agentId) {
                const endTime = performance.now();
                const estTokens = Math.ceil((systemPrompt.length + userPrompt.length + text.length) / 4);
                this.emitTelemetry(agentId, estTokens, endTime - startTime, 'done');
            }
            return text;
        }
    }

    /**
     * Helper to emit telemetry to the DashboardUI
     */
    private static emitTelemetry(agent: string, tokens: number, latencyMs: number, status: 'pending' | 'active' | 'done' | 'error') {
        const event = new CustomEvent('telemetry-update', {
            detail: { agent, tokens, latencyMs, status }
        });
        window.dispatchEvent(event);
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
        fileContext: string | undefined,
        onStateUpdate: (state: string, output?: string) => void,
        onFinalToken: (text: string) => void,
        executePython?: (code: string) => Promise<string>,
        debateFormat: string = 'standard'
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
        const session = await StorageUtils.getActiveHistory();
        let historyContext = "";
        if (session.messages.length > 0) {
            historyContext = "CONVERSATION HISTORY:\n";
            session.messages.forEach(m => {
                historyContext += `[${m.role.toUpperCase()}]: ${m.parts[0].text}\n`;
            });
        }

        let fullPrompt = `${historyContext}\n\nCURRENT USER PROMPT: ${newMessage}`;

        // Inject attached file content if provided
        if (fileContext) {
            fullPrompt = `${fileContext}\n\n${fullPrompt}`;
        }

        // Debate Format Modifiers
        let formatModifier = "";
        if (debateFormat === 'courtroom') {
            formatModifier = " [ROLEPLAY ENFORCED: COURTROOM TRIAL. You must act as a legal counsel. Argue your perspective vehemently as if convincing a jury. Provide evidence, cite precedents, and aggressively cross-examine flaws in the user's premise or other agents.]";
        } else if (debateFormat === 'socratic') {
            formatModifier = " [ROLEPLAY ENFORCED: SOCRATIC DIALOGUE. Instead of just giving the answer, heavily utilize the Socratic method. Ask profound, guiding questions that force the user and other agents to deeply question their fundamental assumptions.]";
        } else if (debateFormat === 'brainstorm') {
            formatModifier = " [ROLEPLAY ENFORCED: RAPID BRAINSTORM. Ignore perfection. Throw out as many wild, creative, and unconstrained ideas as possible in a rapid-fire list format.]";
        }

        try {
            // -----------------------------------------------------
            // ROUND 1: GEMINI-PRIME (Lead Analyst)
            // -----------------------------------------------------
            onStateUpdate('gemini');
            this.emitTelemetry('gemini', 0, 0, 'active');
            const startTime = performance.now();
            
            const geminiInstruction = `You are GEMINI-PRIME, an elite lead analyst and architectural thinker. Provide a comprehensive, multi-dimensional ANALYSIS of the user's prompt. Break down the core intent, analyze constraints, and propose a clear, structured theoretical approach. Do NOT just give the final answer; your goal is to establish the absolute best foundational context and step-by-step logic for other agents to build upon. Be precise, logical, and highly structured.${formatModifier}`;

            let r1Output = '';
            let contents: any[] = [{ role: 'user', parts: [{ text: fullPrompt }] }];

            while (true) {
                const stream = await ai.models.generateContentStream({
                    model: 'gemini-2.5-flash',
                    contents: contents,
                    config: {
                        systemInstruction: geminiInstruction,
                        tools: [{ googleSearch: {} }, {
                            functionDeclarations: [{
                                name: 'run_python',
                                description: 'Executes Python code in a secure Pyodide environment. Use this to perform calculations, data analysis, or execute algorithms. Print all outputs.',
                                parameters: {
                                    type: 'OBJECT' as any,
                                    properties: {
                                        code: {
                                            type: 'STRING' as any,
                                            description: 'The Python code to execute'
                                        }
                                    },
                                    required: ['code']
                                }
                            }]
                        }]
                    }
                });

                let currentCalls: any[] = [];
                for await (const chunk of stream) {
                    if (chunk.text) {
                        r1Output += chunk.text;
                        onStateUpdate('gemini_chunk', chunk.text);
                    }
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        currentCalls.push(...chunk.functionCalls);
                    }
                }

                if (currentCalls.length > 0) {
                    contents.push({ role: 'model', parts: currentCalls.map(call => ({ functionCall: call })) });

                    const toolResponses: any[] = [];
                    for (const call of currentCalls) {
                        if (call.name === 'run_python' && executePython) {
                            const code = call.args?.code as string || '';
                            onStateUpdate('gemini_chunk', `\n\n> Executing Python Code...\n\`\`\`python\n${code}\n\`\`\`\n`);
                            try {
                                const result = await executePython(code);
                                toolResponses.push({ functionResponse: { name: call.name, response: { result } } });
                                onStateUpdate('gemini_chunk', `> Result:\n\`\`\`\n${result}\n\`\`\`\n\n`);
                            } catch (e: any) {
                                toolResponses.push({ functionResponse: { name: call.name, response: { error: e.toString() } } });
                                onStateUpdate('gemini_chunk', `> Error:\n\`\`\`\n${e.toString()}\n\`\`\`\n\n`);
                            }
                        } else {
                            toolResponses.push({ functionResponse: { name: call.name, response: { error: "Tool not found or disabled" } } });
                        }
                    }
                    contents.push({ role: 'user', parts: toolResponses });
                } else {
                    break;
                }
            }
            const endTime = performance.now();
            const estTokens = Math.ceil((fullPrompt.length + r1Output.length) / 4);
            this.emitTelemetry('gemini', estTokens, endTime - startTime, 'done');
            onStateUpdate('gemini_done', '');

            // -----------------------------------------------------
            // ROUND 2-4: PARALLEL EXECUTION (DeepSeek, Qwen, Mixtral)
            // -----------------------------------------------------
            const promises: Promise<string>[] = [];

            if (settings.useDeepSeek) {
                onStateUpdate('deepseek');
                promises.push(
                    this.callGroq(
                        settings.models.deepSeek,
                        `You are DEEPSEEK-REASONER, a rigorous, analytical, and highly logical AI. Your objective is to peer-review the initial analysis provided by GEMINI-PRIME against the user's prompt. Identify logical gaps, invalid assumptions, edge cases, and potential inefficiencies. Provide highly optimized, constructive alternatives. Output ONLY your review and proposed optimizations.${formatModifier}`,
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`,
                        (chunk) => onStateUpdate('deepseek_chunk', chunk),
                        undefined,
                        'deepseek'
                    ).then(res => {
                        onStateUpdate('deepseek_done');
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
                        `You are QWEN-ARCHITECT, an incredibly thorough, detail-oriented engineering expert. Review the USER PROMPT and GEMINI ANALYSIS. Provide a grounded, structured perspective focusing on practical execution. Detail exactly how to implement the best ideas, focusing on modern best practices, clean code/patterns, scalability, and handling edge cases.${formatModifier}`,
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`,
                        (chunk) => onStateUpdate('qwen_chunk', chunk),
                        undefined,
                        'qwen'
                    ).then(res => {
                        onStateUpdate('qwen_done');
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
                        `You are MIXTRAL-CREATOR, an outside-the-box thinker and security expert. You look at the problem from an entirely different angle. Review the USER PROMPT and GEMINI ANALYSIS. Point out any massive blind spots, security vulnerabilities, or drastically simpler/more creative ways to solve the problem that earlier analysis missed.${formatModifier}`,
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`,
                        (chunk) => onStateUpdate('mixtral_chunk', chunk),
                        undefined,
                        'mixtral'
                    ).then(res => {
                        onStateUpdate('mixtral_done');
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
                `USER PROMPT:\n${fullPrompt}\n\nDEBATE TRANSCRIPT:\nGemini: ${r1Output}\nDeepSeek: ${r2Output}\nQwen: ${r3Output}\nMixtral: ${r4Output}`,
                undefined,
                undefined,
                'gemma'
            );
            onStateUpdate('gemma_done', r5Output);

            // -----------------------------------------------------
            // PARALLEL ROUND: CONFLICT MATRIX GENERATOR
            // -----------------------------------------------------
            // Create a background job to quickly analyze the transcripts and output a JSON conflict matrix
            // This runs concurrently with Gemma/Llama so it costs zero perceivable time to the user.
            const matrixPrompt = `You are a strict data-extraction AI. Analyze the Debate Transcript. Your ONLY goal is to score how much the agents disagree or conflict with each other mathematically on a scale of 0 to 100 (0=Total Agreement/Same Ideas, 100=Total Disagreement/Opposite Ideas).

Analyze: Gemini, DeepSeek, Qwen, Mixtral.

You MUST output ONLY a pure JSON object mapping the lowercase agent pairs to their integer score. No markdown blocks, no text, just JSON.
Example format:
{ "gemini_deepseek": 25, "gemini_qwen": 10, "gemini_mixtral": 80, "deepseek_qwen": 45, "deepseek_mixtral": 90, "qwen_mixtral": 75 }`;
            
            this.callGroq(
                'llama-3.1-8b-instant', 
                matrixPrompt,
                `DEBATE TRANSCRIPT:\nGemini: ${r1Output}\nDeepSeek: ${r2Output}\nQwen: ${r3Output}\nMixtral: ${r4Output}`,
                undefined,
                0.1
            ).then(matrixJsonStr => {
                try {
                    // Strip any accidental markdown formatting the model might spit out
                    const cleanJson = matrixJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
                    const matrixData = JSON.parse(cleanJson);
                    window.dispatchEvent(new CustomEvent('matrix-update', { detail: matrixData }));
                } catch (e) {
                    console.error("Failed to parse matrix JSON", e, matrixJsonStr);
                }
            }).catch(e => console.error("Matrix generation failed", e));

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
                settings.temperature,
                'llama'
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
