import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class CountdownCommand implements Command {
    public names = [Lang.getRef('chatCommands.settime', Language.Default)];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const durationStr =
            intr.options.getString(Lang.getRef('arguments.duration', Language.Default)) ??
            intr.options.getString('duration');
        if (!durationStr) {
            await InteractionUtils.send(intr, {
                content: 'Please provide a duration (e.g. 1h, 30m, 10s).',
            });
            return;
        }

        let ms: number;
        try {
            ms = this.parseDuration(durationStr);
        } catch (err) {
            await InteractionUtils.send(intr, {
                content: 'Invalid duration format. Use e.g. 1h, 30m, 10s, or combined like 1h1m1s.',
            });
            return;
        }

        const replyText = `Tao sẽ gọi mày sau ${durationStr}. Nhớ để ý discord sv! `;
        const reason =
            intr.options.getString(Lang.getRef('arguments.reason', Language.Default)) ??
            intr.options.getString('reason') ??
            null;
        await InteractionUtils.send(intr, { content: replyText });

        const userId = intr.user.id;
        const channel = intr.channel;
        // schedule
        setTimeout(async () => {
            try {
                for (let i = 0; i < 3; i++) {
                    const reasonPart = reason ? `${reason} ` : '';
                    const text = `<@${userId}> đến giờ ${reasonPart}kìa béo!!!`;
                    if (
                        channel &&
                        'send' in channel &&
                        typeof (channel as any).send === 'function'
                    ) {
                        await (channel as any).send({ content: text });
                    }
                    await this.delay(1000);
                }
            } catch (err) {
                console.error('CountdownCommand send error:', err);
            }
        }, ms);
    }

    private parseDuration(input: string): number {
        // supports formats like 1h, 1m, 1s, 1h1m1s, separators , or spaces
        const cleaned = input.replace(/,/g, ' ').trim();
        const re = /(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/i;
        // try combined matches like 1h1m1s using global match
        const globalRe = /(\d+)\s*(h|m|s)/gi;
        let total = 0;
        let matched = false;
        let m: RegExpExecArray | null;
        while ((m = globalRe.exec(cleaned))) {
            matched = true;
            const val = parseInt(m[1], 10);
            const unit = m[2].toLowerCase();
            if (unit === 'h') total += val * 3600 * 1000;
            else if (unit === 'm') total += val * 60 * 1000;
            else if (unit === 's') total += val * 1000;
        }

        if (!matched) {
            // maybe it's just a number -> assume seconds
            const num = Number(cleaned);
            if (!isNaN(num) && num > 0) return num * 1000;
            throw new Error('Invalid duration');
        }

        if (total <= 0) throw new Error('Invalid duration');
        return total;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
