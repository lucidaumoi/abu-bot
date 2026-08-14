import { describe, it, expect } from 'vitest';
import { ChatMemoryService, StoredMessage } from '../../src/services/chat-memory-service.js';

describe('ChatMemoryService', () => {
    it('append and retrieve recent messages', () => {
        const svc = new ChatMemoryService(3);
        const key = 'c:u';
        svc.appendMessage(key, { authorId: 'u', content: 'hello', timestamp: 1 });
        svc.appendMessage(key, { authorId: 'b', content: 'hi', timestamp: 2 });
        const recent = svc.getRecentMessages(key, 10);
        expect(recent.length).toBe(2);
        expect(recent[0].content).toBe('hello');
    });

    it('truncates and creates summary when exceeding max', () => {
        const svc = new ChatMemoryService(2);
        const key = 'c:u2';
        svc.appendMessage(key, { authorId: 'u', content: 'm1', timestamp: 1 });
        svc.appendMessage(key, { authorId: 'u', content: 'm2', timestamp: 2 });
        svc.appendMessage(key, { authorId: 'u', content: 'm3', timestamp: 3 });
        const recent = svc.getRecentMessages(key, 10);
        expect(recent.length).toBe(2);
        const summary = svc.getSummary(key);
        expect(summary).toBeTruthy();
        expect(summary).toContain('m1');
    });

    it('resetSession clears data', () => {
        const svc = new ChatMemoryService(5);
        const key = 'c:u3';
        svc.appendMessage(key, { authorId: 'a', content: 'x', timestamp: 1 });
        svc.resetSession(key);
        const recent = svc.getRecentMessages(key, 10);
        expect(recent.length).toBe(0);
    });
});
