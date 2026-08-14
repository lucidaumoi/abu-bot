import { Message } from 'discord.js';

import { EventData } from '../models/internal-models.js';
import { GeminiChatServiceLike } from '../services/gemini-chat-service.js';
import { DefaultChatMemoryService, StoredMessage } from '../services/chat-memory-service.js';
import { Trigger } from './trigger.js';

export class GeminiChatTrigger implements Trigger {
    public requireGuild = false;

    constructor(private readonly service: GeminiChatServiceLike) {}

    public triggered(msg: Message): boolean {
        if (msg.author.bot || !msg.content) {
            return false;
        }

        const botUserId = msg.client.user?.id;
        if (!botUserId) {
            return false;
        }

        const botMentioned = msg.mentions?.has(botUserId) ?? false;
        if (!botMentioned) {
            return false;
        }

        const cleaned = this.removeBotMention(msg.content, botUserId);
        return cleaned.trim().length > 0;
    }

    public async execute(msg: Message, _data: EventData): Promise<void> {
        const botUserId = msg.client.user?.id;
        if (!botUserId) {
            return;
        }

        const rawContent = msg.content ?? '';
        const cleanedContent = this.removeBotMention(rawContent, botUserId).trim();

        if (!cleanedContent) {
            return;
        }

        const sessionKey = `${msg.channelId}:${msg.author.id}`;
        const isResetCommand = /^(?:reset|clear)$/i.test(cleanedContent);

        if (isResetCommand) {
            this.service.resetSession(sessionKey);
            DefaultChatMemoryService.resetSession(sessionKey);
            await msg.reply('Đã reset cuộc trò chuyện của bạn.');
            return;
        }

        if (!this.service.hasApiKey()) {
            await msg.reply('API key Gemini chưa được cấu hình.');
            return;
        }

        try {
            if ('sendTyping' in msg.channel && typeof msg.channel.sendTyping === 'function') {
                await msg.channel.sendTyping();
            }

            // collect metadata
            try {
                DefaultChatMemoryService.setMetadata(sessionKey, {
                    username: msg.author.username,
                    displayName:
                        msg.member && 'displayName' in msg.member
                            ? (msg.member as any).displayName
                            : msg.author.username,
                    avatarUrl: msg.author.displayAvatarURL?.() ?? null,
                    guildName: msg.guild?.name ?? null,
                });
            } catch (err) {
                // ignore metadata failures
            }

            // If session has no messages yet, or user's request seems to reference prior messages,
            // fetch recent channel messages proactively and append them to memory.
            const session = DefaultChatMemoryService.getSession(sessionKey);
            const shouldFetchHistory =
                session.recentMessages.length === 0 || this.isRelatedToHistory(cleanedContent);
            if (shouldFetchHistory) {
                try {
                    const fetched = await this.fetchRecentChannelMessages(msg, 50);
                    for (const m of fetched) {
                        // avoid duplicating the invoking message
                        if (m.timestamp === msg.createdTimestamp && m.authorId === msg.author.id)
                            continue;
                        DefaultChatMemoryService.appendMessage(sessionKey, m);
                    }
                } catch (err) {
                    // ignore fetch errors
                }
            }

            const userMsg: StoredMessage = {
                authorId: msg.author.id,
                content: cleanedContent,
                timestamp: Date.now(),
            };
            DefaultChatMemoryService.appendMessage(sessionKey, userMsg);

            // build prompt including summary and recent messages
            const summary = DefaultChatMemoryService.getSummary(sessionKey);
            const recent = DefaultChatMemoryService.getRecentMessages(sessionKey, 20);
            const meta = DefaultChatMemoryService.getSession(sessionKey).metadata || {};

            let promptParts: string[] = [];
            if (meta.username || meta.displayName || meta.guildName) {
                promptParts.push(
                    `Context: user=${meta.username ?? ''}, displayName=${meta.displayName ?? ''}, guild=${meta.guildName ?? ''}`
                );
            }
            if (summary) {
                promptParts.push(`Summary of prior conversation:\n${summary}`);
            }
            if (recent && recent.length) {
                const recentText = recent
                    .map(m => {
                        const who =
                            m.authorId === msg.author.id
                                ? (meta.displayName ?? meta.username ?? 'User')
                                : m.authorId === (msg.client.user?.id ?? 'bot')
                                  ? 'Bot'
                                  : m.authorId;
                        return `${who}: ${m.content}`;
                    })
                    .join('\n');
                promptParts.push(`Recent messages:\n${recentText}`);
            }

            promptParts.push(`User: ${cleanedContent}`);
            const prompt = promptParts.join('\n\n');

            const response = await this.service.sendMessage(sessionKey, prompt);

            const botAuthorId = msg.client.user?.id ?? 'bot';
            const botMsg: StoredMessage = {
                authorId: botAuthorId,
                content: response,
                timestamp: Date.now(),
            };
            DefaultChatMemoryService.appendMessage(sessionKey, botMsg);

            await this.sendDiscordSafeReply(msg, response);
        } catch (error) {
            await msg.reply('Xin lỗi, tôi gặp sự cố khi trả lời. Vui lòng thử lại sau.');
            console.error('GeminiChatTrigger error:', error);
        }
    }

    private removeBotMention(content: string, botUserId?: string): string {
        let normalized = content;

        if (botUserId) {
            normalized = normalized.replace(
                new RegExp(
                    `<@!?${this.escapeRegExp(botUserId)}>|<@&${this.escapeRegExp(botUserId)}>|${this.escapeRegExp(botUserId)}`,
                    'g'
                ),
                ''
            );
        }

        normalized = normalized
            .replace(/<@!?[A-Za-z0-9_-]+>/g, '')
            .replace(/<@&[A-Za-z0-9_-]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return normalized;
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private async sendDiscordSafeReply(msg: Message, response: string): Promise<void> {
        const chunks = this.chunkText(response, 2000);

        for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
                await msg.reply(chunks[i]);
                continue;
            }

            if ('send' in msg.channel && typeof msg.channel.send === 'function') {
                await msg.channel.send(chunks[i]);
            } else {
                await msg.reply(chunks[i]);
            }
        }
    }

    private chunkText(text: string, maxLength: number): string[] {
        if (text.length <= maxLength) {
            return [text];
        }

        const chunks: string[] = [];
        let current = '';

        for (const line of text.split(/\n/)) {
            if ((current + line).length + 1 <= maxLength) {
                current = current ? `${current}\n${line}` : line;
            } else {
                if (current) {
                    chunks.push(current);
                }
                current = line;
            }
        }

        if (current) {
            chunks.push(current);
        }

        const finalChunks: string[] = [];
        for (const chunk of chunks) {
            if (chunk.length <= maxLength) {
                finalChunks.push(chunk);
                continue;
            }

            for (let i = 0; i < chunk.length; i += maxLength) {
                finalChunks.push(chunk.slice(i, i + maxLength));
            }
        }

        return finalChunks;
    }

    private isRelatedToHistory(content: string): boolean {
        if (!content) return false;
        const keywords = [
            'trước',
            'vừa',
            'vừa rồi',
            'nhớ',
            'nhắc',
            'lúc trước',
            'nói',
            'ở trên',
            'trước đó',
            'cái đó',
            'cái này',
            'những tin',
            'tin nhắn',
            'refer',
            'liên quan',
            'liên hệ',
        ];
        const low = content.toLowerCase();
        return keywords.some(k => low.includes(k));
    }

    private async fetchRecentChannelMessages(msg: Message, limit = 50): Promise<StoredMessage[]> {
        try {
            const channelAny: any = msg.channel;
            if (
                !channelAny ||
                !channelAny.messages ||
                typeof channelAny.messages.fetch !== 'function'
            ) {
                return [];
            }
            const coll = await channelAny.messages.fetch({ limit });
            const arr: StoredMessage[] = [];
            coll.forEach((m: any) => {
                try {
                    if (m.author && m.content && !m.author.bot) {
                        arr.push({
                            authorId: m.author.id,
                            content: m.content,
                            timestamp: m.createdTimestamp,
                        });
                    }
                } catch (err) {
                    // ignore
                }
            });
            // sort oldest -> newest
            arr.sort((a, b) => a.timestamp - b.timestamp);
            return arr;
        } catch (err) {
            return [];
        }
    }
}
