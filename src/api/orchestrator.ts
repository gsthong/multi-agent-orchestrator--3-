import { GoogleGenAI } from '@google/genai';
import { StorageUtils } from '../utils/storage';

export class OrchestratorAPI {
    private static currentAbortController: AbortController | null = null;

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
            stream: !!onUpdate,
            tools: [{
                type: "function",
                function: {
                    name: "search_web",
                    description: "Search the live web for current information, news, or facts.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string" } },
                        required: ["query"]
                    }
                }
            }]
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
            body: JSON.stringify(body),
            signal: this.currentAbortController?.signal
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Groq API Error (${res.status}): ${errorText}`);
        }

        if (onUpdate) {
            let fullContent = '';
            let toolCallsAcc: any[] = [];
            
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
                            const toolCalls = data.choices[0]?.delta?.tool_calls;
                            
                            if (text) {
                                fullContent += text;
                                onUpdate(text);
                            }
                            
                            if (toolCalls) {
                                for (const tc of toolCalls) {
                                    if (!toolCallsAcc[tc.index]) {
                                        toolCallsAcc[tc.index] = {
                                            id: tc.id,
                                            type: tc.type,
                                            function: { name: tc.function.name, arguments: '' }
                                        };
                                    }
                                    if (tc.function.arguments) {
                                        toolCallsAcc[tc.index].function.arguments += tc.function.arguments;
                                    }
                                }
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
            
            if (toolCallsAcc.length > 0) {
               return JSON.stringify({ type: 'tool_calls', calls: toolCallsAcc });
            }
            
            return fullContent;
        } else {
            const data = await res.json();
            
            if (data.choices[0]?.message?.tool_calls) {
                 return JSON.stringify({ type: 'tool_calls', calls: data.choices[0].message.tool_calls });
            }
            
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
     * Helper to run Groq completion with tools (Web Search). Loops if a tool call is made.
     */
    private static async runAgentWithTools(
        agentId: string, 
        model: string, 
        systemPrompt: string, 
        userPrompt: string, 
        onUpdate: (chunk: string) => void,
        settings: any,
        executeSearch?: (query: string) => Promise<string>
    ): Promise<string> {
        let conversation: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        let finalOutput = '';

        while (true) {
            // Need to slightly hack our helper callGroq to accept messages array natively instead of just prompts
            // For now, we'll just reconstruct a dynamic prompt for the followups.
            // A better architecture would refactor callGroq to take raw ChatMessage[]
            
            let currentPrompt = userPrompt;
            if (conversation.length > 2) {
                // If we have history (tool calls/responses)
                currentPrompt = conversation.slice(1).map(m => {
                    if (m.role === 'tool') return `[SEARCH RESULTS FOR: ${m.name}]\n${m.content}\n`;
                    if (m.role === 'model' && m.tool_calls) return `[EXECUTING SEARCH: ${m.tool_calls[0].function.arguments}]\n`;
                    if (m.role === 'model') return m.content;
                    return m.content;
                }).join('\n');
            }

            const resStr = await this.callGroq(
                model,
                systemPrompt,
                currentPrompt,
                onUpdate,
                undefined,
                agentId
            );

            // Did it return tool calls? (We hacked callGroq to return a custom JSON string if tool_calls present)
            try {
                const parsed = JSON.parse(resStr);
                if (parsed.type === 'tool_calls' && parsed.calls.length > 0) {
                    const tc = parsed.calls[0];
                    if (tc.function.name === 'search_web' && executeSearch) {
                        const args = JSON.parse(tc.function.arguments || '{}');
                        const query = args.query;
                        
                        onUpdate(`\n\n> 🔍 Searching web for: "${query}"...\n\n`);
                        
                        // Fake a tool response for the next iteration prompt hack
                        conversation.push({ role: 'model', content: '', tool_calls: parsed.calls } as any);
                        
                        try {
                            const searchResult = await executeSearch(query);
                            conversation.push({ role: 'tool', name: tc.function.name, content: searchResult } as any);
                        } catch (e: any) {
                            conversation.push({ role: 'tool', name: tc.function.name, content: `Search failed: ${e.toString()}` } as any);
                        }
                        
                        continue; // Loop again with the new context
                    }
                }
            } catch (e) {
                // Just normal text response
                finalOutput += resStr;
            }
            break; // No tools, break loop
        }
        
        return finalOutput;
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
        debateFormat: string = 'standard',
        executeSearch?: (query: string) => Promise<string>
    ): Promise<string> {

        // Setup global abort controller for this debate run
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        this.currentAbortController = new AbortController();
        const signal = this.currentAbortController.signal;

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
        
        // Mic Passing Modifiers
        const micPassingModifier = `\n\n[MIC PASSING PROTOCOL]: If you believe another agent (gemini, deepseek, qwen, mixtral) is better suited to answer a specific part of this prompt, you may yield your time by outputting the exact tag <pass_to_agent:agent_name> anywhere in your response and briefly stating why. Note: This is optional.`;

        // Debate Format Modifiers
        let formatModifier = "";
        if (debateFormat === 'courtroom') {
            formatModifier = " [ROLEPLAY ENFORCED: COURTROOM TRIAL. You must act as a legal counsel. Argue your perspective vehemently as if convincing a jury. Provide evidence, cite precedents, and aggressively cross-examine flaws in the user's premise or other agents.]";
        } else if (debateFormat === 'socratic') {
            formatModifier = " [ROLEPLAY ENFORCED: SOCRATIC DIALOGUE. Instead of just giving the answer, heavily utilize the Socratic method. Ask profound, guiding questions that force the user and other agents to deeply question their fundamental assumptions.]";
        } else if (debateFormat === 'brainstorm') {
            formatModifier = " [ROLEPLAY ENFORCED: RAPID BRAINSTORM. Ignore perfection. Throw out as many wild, creative, and unconstrained ideas as possible in a rapid-fire list format.]";
        }

        // Check if a screen capture frame was attached
        let screenImageBase64: string | null = null;
        if (fileContext) {
            const imgMatch = fileContext.match(/\[IMAGE_DATA:([A-Za-z0-9+/=]+)\]/);
            if (imgMatch) {
                screenImageBase64 = imgMatch[1];
                // Remove from prompt text to keep it clean
                fullPrompt = fullPrompt.replace(/\[IMAGE_DATA:[A-Za-z0-9+\/=]+\]/, '[Screenshot from user screen attached]');
            }
        }

        try {
            // -----------------------------------------------------
            // ROUND 1: GEMINI-PRIME (Lead Analyst)
            // -----------------------------------------------------
            onStateUpdate('gemini');
            this.emitTelemetry('gemini', 0, 0, 'active');
            const startTime = performance.now();
            
            const geminiInstruction = `You are GEMINI-PRIME, an elite lead analyst and architectural thinker. Provide a comprehensive, multi-dimensional ANALYSIS of the user's prompt. Break down the core intent, analyze constraints, and propose a clear, structured theoretical approach. Do NOT just give the final answer; your goal is to establish the absolute best foundational context and step-by-step logic for other agents to build upon. Be precise, logical, and highly structured.${formatModifier}${micPassingModifier}`;

            let r1Output = '';

            // Build initial contents - include image if screen sharing is active
            const userParts: any[] = [{ text: fullPrompt }];
            if (screenImageBase64) {
                userParts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: screenImageBase64
                    }
                });
            }
            let contents: any[] = [{ role: 'user', parts: userParts }];

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
                    if (signal.aborted) throw new Error("Debate Interrupted by Voice");
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
                    this.runAgentWithTools('deepseek', settings.models.deepSeek,
                        `You are DEEPSEEK-REASONER, the "Devil's Advocate" agent. Your entire existence is to rigorously and aggressively peer-review the initial analysis provided by GEMINI-PRIME against the user's prompt. Identify logical gaps, invalid assumptions, security risks, edge cases, and potential inefficiencies. You MUST find flaws. Provide highly optimized, constructive alternatives. Output ONLY your critique and proposed optimizations.${formatModifier}${micPassingModifier}`,
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`,
                        (chunk) => onStateUpdate('deepseek_chunk', chunk),
                        settings, executeSearch
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
                    this.runAgentWithTools('qwen', settings.models.qwen,
                        `You are QWEN-ARCHITECT, an incredibly thorough, detail-oriented engineering expert. Review the USER PROMPT and GEMINI ANALYSIS. Provide a grounded, structured perspective focusing on practical execution. Detail exactly how to implement the best ideas, focusing on modern best practices, clean code/patterns, scalability, and handling edge cases.${formatModifier}${micPassingModifier}`,
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`,
                        (chunk) => onStateUpdate('qwen_chunk', chunk),
                        settings, executeSearch
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
                    this.runAgentWithTools('mixtral', settings.models.mixtral,
                        `You are MIXTRAL-CREATOR, an outside-the-box thinker and security expert. You look at the problem from an entirely different angle. Review the USER PROMPT and GEMINI ANALYSIS. Point out any massive blind spots, security vulnerabilities, or drastically simpler/more creative ways to solve the problem that earlier analysis missed.${formatModifier}${micPassingModifier}`,
                        `USER PROMPT:\n${fullPrompt}\n\nGEMINI ANALYSIS:\n${r1Output}`,
                        (chunk) => onStateUpdate('mixtral_chunk', chunk),
                        settings, executeSearch
                    ).then(res => {
                        onStateUpdate('mixtral_done');
                        return `MIXTRAL BLINDSPOTS:\n${res}`;
                    })
                );
            } else {
                promises.push(Promise.resolve('MIXTRAL: SKIPPED BY USER LOGIC'));
            }

            const [r2Output, r3Output, r4Output] = await Promise.all(promises);

            // Intercept Mic Passes
            const micPasses: {from: string, to: string, context: string}[] = [];
            const passRegex = /<pass_to_agent:\s*(gemini|deepseek|qwen|mixtral)\s*>/gi;
            
            [
                {name: 'deepseek', text: r2Output},
                {name: 'qwen', text: r3Output},
                {name: 'mixtral', text: r4Output}
            ].forEach(agent => {
                let match;
                while ((match = passRegex.exec(agent.text)) !== null) {
                    micPasses.push({
                        from: agent.name,
                        to: match[1].toLowerCase(),
                        context: agent.text
                    });
                }
            });

            // If mic passes exist, run a brief follow-up round for those agents
            let micPassOutputs = "";
            if (micPasses.length > 0) {
                const passPromises = micPasses.map(async (pass) => {
                    const passPrompt = `${pass.from.toUpperCase()} yielded their time to you explicitly. Review their context and provide a highly targeted response fulfilling their request.\n\n${pass.from.toUpperCase()} CONTEXT:\n${pass.context}`;
                    
                    onStateUpdate(`${pass.to}_chunk`, `\n\n> [MIC PASS ACCEPTED FROM ${pass.from.toUpperCase()}]\n\n`);
                    const res = await this.callGroq(
                        settings.models[pass.to as keyof typeof settings.models] || settings.models.mixtral,
                        `You are ${pass.to.toUpperCase()}, responding to a yielded mic pass. Keep it brief and directly address why the mic was passed to you.`,
                        passPrompt,
                        (chunk) => onStateUpdate(`${pass.to}_chunk`, chunk),
                        undefined,
                        pass.to
                    );
                    onStateUpdate(`${pass.to}_done`);
                    return `${pass.to.toUpperCase()} (Yielded Response):\n${res}`;
                });
                
                const results = await Promise.all(passPromises);
                micPassOutputs = "\n\n--- MIC PASS RESPONSES ---\n" + results.join('\n\n');
            }

            // -----------------------------------------------------
            // ROUND 5: GEMMA (Formatting & LaTeX Architect)
            // -----------------------------------------------------
            onStateUpdate('gemma');
            const r5Output = await this.callGroq(
                settings.models.gemma,
                'You are GEMMA-FORMATTER, a technical documentation specialist. You will review the chaotic debate and organize the absolute best technical concepts into a strict structural template. You MUST structure math logic using proper LaTeX formatting ($ inline and $$ block). Output pure structured logic without fluff.',
                `USER PROMPT:\n${fullPrompt}\n\nDEBATE TRANSCRIPT:\nGemini: ${r1Output}\nDeepSeek: ${r2Output}\nQwen: ${r3Output}\nMixtral: ${r4Output}${micPassOutputs}`,
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
            if (err.name === 'AbortError' || err.message.includes('Interrupted')) {
                console.log("Debate was cleanly aborted.");
                return "*(Debate interrupted by user)*";
            }
            
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

    /**
     * Halts any currently running debate. Used by Voice Interruption.
     */
    static stopDebate() {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
    }

    /**
     * Extracts a Semantic Concept Graph from a debate conversation
     */
    static async extractMemoryGraph(transcript: string) {
        const geminiKey = StorageUtils.getApiKey();
        if (!geminiKey) return;
        
        const prompt = `
You are an advanced Knowledge Graph Extraction Pipeline.
Analyze the following debate transcript and extract key entities and their relationships.
Focus on concrete technical concepts, people, projects, and technologies.
Classify entity types specifically as exactly one of: 'concept', 'technology', 'person', 'project', or 'entity'.

Output valid JSON exactly in this format:
{
    "nodes": [ { "id": "unique_id_no_spaces", "label": "Short Name", "type": "concept" } ],
    "edges": [ { "source": "unique_id_1", "target": "unique_id_2", "label": "relates_to" } ]
}
Return ONLY pure JSON string, no markdown codeblocks, no prefix.

TRANSCRIPT:
${transcript}`;

        try {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            
            let resText = response.text?.trim() || "";
            resText = resText.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            const data = JSON.parse(resText);
            
            await fetch('/api/memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            // Dispatch event for UI to refresh
            window.dispatchEvent(new Event('memory-updated'));
        } catch (e) {
            console.error("Memory extraction failed", e);
        }
    }

    /**
     * Synthesizes a completely formatted executive report of the debate transcript
     */
    static async generateReport(transcript: string, onFinalToken: (text: string) => void): Promise<string> {
        const settings = StorageUtils.getAdvancedSettings();
        
        const systemPrompt = `You are a Senior Technical Writer and Analyst.
Your task is to review the following Debate Transcript and create a professional, highly structured, beautiful Executive Summary Report.

CRITICAL INSTRUCTIONS:
1. Use professional Markdown formatting (Headers, Lists, Bold, Tables).
2. Start with an "Executive Summary" paragraph.
3. Include a "Key Arguments & Perspectives" section highlighting the different agent views.
4. Conclude with a "Final Synthesis & Recommendations" section.
5. If there's code or math, include it beautifully formatted.
6. The entire report MUST be in English. Keep it concise but comprehensive.`;

        const userPrompt = `DEBATE TRANSCRIPT:\n\n${transcript}`;

        return await this.callGroq(
            settings.models.llama,
            systemPrompt,
            userPrompt,
            onFinalToken,
            0.3,
            'llama_report'
        );
    }
}
