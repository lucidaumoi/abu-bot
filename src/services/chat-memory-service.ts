export interface StoredMessage {
    authorId: string;
    content: string;
    timestamp: number;
}

export interface ChatSession {
    sessionKey: string; // channelId:userId
    guildId?: string | null;
    channelId?: string | null;
    userId?: string | null;
    recentMessages: StoredMessage[];
    summary?: string | null;
    metadata?: Record<string, any> | null;
    updatedAt: number;
}

export class ChatMemoryService {
    private sessions = new Map<string, ChatSession>();
    private readonly maxMessages: number;

    constructor(maxMessages: number = 50) {
        this.maxMessages = maxMessages;
    }

    public getSession(sessionKey: string): ChatSession {
        let s = this.sessions.get(sessionKey);
        if (!s) {
            s = {
                sessionKey,
                recentMessages: [],
                summary: null,
                metadata: null,
                updatedAt: Date.now(),
            } as ChatSession;
            this.sessions.set(sessionKey, s);
        }
        return s;
    }

    public appendMessage(sessionKey: string, message: StoredMessage): void {
        const s = this.getSession(sessionKey);
        s.recentMessages.push(message);
        if (s.recentMessages.length > this.maxMessages) {
            const removeCount = s.recentMessages.length - this.maxMessages;
            const removed = s.recentMessages.splice(0, removeCount);
            this.compactOldMessages(s, removed);
        }
        s.updatedAt = Date.now();
    }

    private compactOldMessages(session: ChatSession, removed: StoredMessage[]): void {
        try {
            const texts = removed.map(m => `${m.authorId}: ${m.content}`).join('\n');
            const existing = session.summary ? `${session.summary}\n` : '';
            // Simple compaction: append removed messages to summary, but keep summary length bounded
            const appended = `${existing}[compacted]\n${texts}`;
            session.summary = appended.length > 2000 ? appended.slice(-2000) : appended;
        } catch (err) {
            // never throw from compaction
            console.error('ChatMemoryService.compactOldMessages error:', err);
        }
    }

    public getRecentMessages(sessionKey: string, count: number = 20): StoredMessage[] {
        const s = this.getSession(sessionKey);
        return s.recentMessages.slice(-count);
    }

    public setSummary(sessionKey: string, summary: string | null): void {
        const s = this.getSession(sessionKey);
        s.summary = summary;
        s.updatedAt = Date.now();
    }

    public getSummary(sessionKey: string): string | null {
        const s = this.getSession(sessionKey);
        return s.summary ?? null;
    }

    public setMetadata(sessionKey: string, metadata: Record<string, any>): void {
        const s = this.getSession(sessionKey);
        s.metadata = { ...(s.metadata ?? {}), ...metadata };
        s.updatedAt = Date.now();
    }

    public resetSession(sessionKey: string): void {
        this.sessions.delete(sessionKey);
    }

    public clearAll(): void {
        this.sessions.clear();
    }
}

export const DefaultChatMemoryService = new ChatMemoryService();
