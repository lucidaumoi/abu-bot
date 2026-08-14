import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Config = require('../../config/config.json');

export interface GeminiChatServiceLike {
    getOrCreateChat(sessionKey: string): any;
    sendMessage(sessionKey: string, message: string): Promise<string>;
    resetSession(sessionKey: string): void;
    hasApiKey(): boolean;
}

export class GeminiChatService implements GeminiChatServiceLike {
    private readonly ai: GoogleGenAI | null;
    private readonly chats = new Map<string, { chat: any; model: string }>();
    private readonly recommendedModelNames = [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite',
        'gemini-3.1-pro-preview',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.6-flash',
    ];

    constructor(
        apiKey?: string,
        private readonly model: string = 'gemini-2.5-flash'
    ) {
        this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    }

    public hasApiKey(): boolean {
        return this.ai !== null;
    }

    public getOrCreateChat(sessionKey: string): any {
        if (!this.ai) {
            throw new Error('GEMINI_API_KEY is not configured.');
        }

        const current = this.chats.get(sessionKey);
        if (current) {
            return current.chat;
        }

        const modelName = this.resolveAvailableModel();
        const systemInstruction =
            (Config?.gemini && Config.gemini.systemInstruction) ||
            `You are Abu, a helpful and concise assistant for a Discord server. Answer user questions directly and politely. If the user asks how to use bot features, instruct them to use /help. Keep responses brief, factual`;

        const chat = this.ai.chats.create({
            model: modelName,
            config: {
                systemInstruction,
            },
        });

        this.chats.set(sessionKey, { chat, model: modelName });
        return chat;
    }

    public resetSession(sessionKey: string): void {
        this.chats.delete(sessionKey);
    }

    public async sendMessage(sessionKey: string, message: string): Promise<string> {
        const candidates = this.getFallbackModels();
        let lastError: unknown;

        for (const modelName of candidates) {
            try {
                let current = this.chats.get(sessionKey);
                if (!current || current.model !== modelName) {
                    const systemInstructionLocal =
                        (Config?.gemini && Config.gemini.systemInstruction) ||
                        `You are Abu, a helpful and concise assistant for a Discord server. Answer user questions directly and politely. If the user asks how to use bot features, instruct them to use /help. Keep responses brief, factual`;

                    const chat = this.ai?.chats.create({
                        model: modelName,
                        config: {
                            systemInstruction: systemInstructionLocal,
                        },
                    });
                    this.chats.set(sessionKey, { chat, model: modelName });
                }

                const chat = this.chats.get(sessionKey)?.chat;
                if (!chat) {
                    throw new Error('Failed to initialize Gemini chat session.');
                }

                const response = await chat.sendMessage({ message });
                return response.text?.trim() || 'Tôi không có phản hồi cho tin nhắn này.';
            } catch (error) {
                lastError = error;
                if (
                    this.isRetryableModelError(error) &&
                    modelName !== candidates[candidates.length - 1]
                ) {
                    this.chats.delete(sessionKey);
                    continue;
                }
                throw error;
            }
        }

        throw lastError ?? new Error('Gemini chat failed.');
    }

    private resolveAvailableModel(): string {
        const preferred = this.getFallbackModels();
        return preferred[0] ?? this.recommendedModelNames[0];
    }

    private getFallbackModels(): string[] {
        const list = this.model
            ? [this.model, ...this.recommendedModelNames.filter(name => name !== this.model)]
            : [...this.recommendedModelNames];
        return [...new Set(list.filter(Boolean))];
    }

    private isRetryableModelError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error ?? '');
        return /429|quota|exhausted|RESOURCE_EXHAUSTED|rate limit|rate-limit|NOT_FOUND|404|model.*not.*available|no longer available|invalid model/i.test(
            message
        );
    }
}
