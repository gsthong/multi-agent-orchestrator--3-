import { GoogleGenAI } from '@google/genai';
import { StorageUtils, Message } from '../utils/storage';

export class GeminiAPI {
    // Define persona prompts
    private static personaPrompts: Record<string, string> = {
        assistant: "You are a helpful, extremely capable general AI assistant.",
        coder: "You are a Senior System Architect and Principal Developer. Provide exact, highly optimized, and well-commented code. Focus on best practices, performance, and clear, structured explanations.",
        tutor: "You are an empathetic, patient English language tutor. Correct mistakes gently, explain grammar concepts simply, and encourage conversational practice."
    };

    /**
     * Sends a message to the Gemini API and streams the response back.
     * @param newMessage The new user message content
     * @param persona The current selected persona
     * @param onToken Callback function that receives text chunks as they arrive
     * @param onError Callback function for error handling
     * @returns The complete synthesized response
     */
    static async sendMessageStream(
        newMessage: string,
        persona: string,
        onToken: (text: string) => void,
        onError: (error: string) => void
    ): Promise<string> {
        const apiKey = StorageUtils.getApiKey();

        if (!apiKey) {
            onError("API Key is missing. Please configure it in settings.");
            return "";
        }

        try {
            // Initialize the SDK
            const ai = new GoogleGenAI({ apiKey });

            // Get conversation history to provide context
            const history = StorageUtils.getHistory();

            // Build the system instruction from the persona
            const systemInstruction = this.personaPrompts[persona] || this.personaPrompts['assistant'];

            // Start the streaming request
            const responseStream = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: [
                    ...history.messages, // Pass prior history context
                    { role: 'user', parts: [{ text: newMessage }] } // Append new message
                ],
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7, // Balance between creativity and precision
                }
            });

            let fullResponse = '';

            // Iterate through the stream chunks
            for await (const chunk of responseStream) {
                if (chunk.text) {
                    fullResponse += chunk.text;
                    onToken(chunk.text); // Pass token to UI directly
                }
            }

            return fullResponse;

        } catch (err: any) {
            console.error("Gemini API Error:", err);
            let errorMsg = "An unexpected error occurred.";

            // Basic error pattern matching to help the user
            if (err.message) {
                if (err.message.includes("API_KEY_INVALID")) errorMsg = "Invalid API Key. Please update it in settings.";
                else if (err.message.includes("quota") || err.message.includes("429")) errorMsg = "Rate limit exceeded. Please wait a moment.";
                else errorMsg = err.message;
            }

            onError(errorMsg);
            throw err;
        }
    }
}
