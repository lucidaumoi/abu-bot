import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { GeminiChatTrigger } from '../../src/triggers/gemini-chat-trigger.js';
import { userBuilder } from '../builders/discord-builders.js';

describe('GeminiChatTrigger', () => {
    it('should trigger when the bot is mentioned with text', () => {
        const bot = userBuilder().withId('bot-123').isBot(true).build();
        const message = mockDeep<any>();

        message.author = userBuilder().withId('user-123').isBot(false).build();
        message.client = { user: bot };
        message.guildId = 'guild-123';
        message.channelId = 'channel-123';
        message.content = '<@bot-123> hello there';
        message.mentions = {
            has: vi.fn().mockReturnValue(true),
            users: new Map([[bot.id, bot]]),
        };

        const trigger = new GeminiChatTrigger({
            sendMessage: vi.fn(),
            resetSession: vi.fn(),
            getOrCreateChat: vi.fn(),
            hasApiKey: vi.fn().mockReturnValue(true),
        } as any);

        expect(trigger.triggered(message)).toBe(true);
    });

    it('should reset the session when the user asks to clear the conversation', async () => {
        const bot = userBuilder().withId('bot-123').isBot(true).build();
        const message = mockDeep<any>();
        const service = {
            sendMessage: vi.fn().mockResolvedValue('done'),
            resetSession: vi.fn(),
            getOrCreateChat: vi.fn(),
            hasApiKey: vi.fn().mockReturnValue(true),
        };

        message.author = userBuilder().withId('user-123').isBot(false).build();
        message.client = { user: bot };
        message.guildId = 'guild-123';
        message.channelId = 'channel-123';
        message.content = '<@bot-123> clear';
        message.mentions = {
            has: vi.fn().mockReturnValue(true),
            users: new Map([[bot.id, bot]]),
        };
        message.reply = vi.fn().mockResolvedValue({});

        const trigger = new GeminiChatTrigger(service as any);

        await trigger.execute(message, {} as any);

        expect(service.resetSession).toHaveBeenCalledWith('channel-123:user-123');
    });

    it('should mention the user only on the first long response chunk', async () => {
        const bot = userBuilder().withId('bot-123').isBot(true).build();
        const message = mockDeep<any>();
        const service = {
            sendMessage: vi.fn().mockResolvedValue('A'.repeat(5000)),
            resetSession: vi.fn(),
            getOrCreateChat: vi.fn(),
            hasApiKey: vi.fn().mockReturnValue(true),
        };

        message.author = userBuilder().withId('user-123').isBot(false).build();
        message.client = { user: bot };
        message.guildId = 'guild-123';
        message.channelId = 'channel-123';
        message.content = '<@bot-123> explain in detail';
        message.mentions = {
            has: vi.fn().mockReturnValue(true),
            users: new Map([[bot.id, bot]]),
        };
        message.channel = {
            sendTyping: vi.fn().mockResolvedValue({}),
            send: vi.fn().mockResolvedValue({}),
        };
        message.reply = vi.fn().mockResolvedValue({});

        const trigger = new GeminiChatTrigger(service as any);

        await trigger.execute(message, {} as any);

        expect(message.reply).toHaveBeenCalledTimes(1);
        expect(message.channel.send).toHaveBeenCalledTimes(2);
    });
});
