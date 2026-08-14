import { Locale } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AvatarCommand } from '../../../src/commands/chat/avatar-command.js';
import { EventData } from '../../../src/models/internal-models.js';
import { InteractionUtils } from '../../../src/utils/index.js';
import { interactionBuilder, userBuilder } from '../../builders/discord-builders.js';

vi.mock('../../../src/utils/index.js', () => ({
    InteractionUtils: {
        send: vi.fn().mockResolvedValue({}),
    },
}));

describe('AvatarCommand', () => {
    let avatarCommand: AvatarCommand;
    let mockEventData: EventData;

    beforeEach(() => {
        avatarCommand = new AvatarCommand();
        mockEventData = new EventData(Locale.EnglishUS, Locale.EnglishUS);
        vi.clearAllMocks();
    });

    it('should show the selected user avatar in an embed', async () => {
        const targetUser = userBuilder()
            .withId('avatar-user-123')
            .withUsername('avatarUser')
            .withOverrides({
                avatarURL: vi
                    .fn()
                    .mockReturnValue(
                        'https://cdn.discordapp.com/avatars/avatar-user-123/avatar.png?size=1024'
                    ),
            })
            .build();

        const interaction = interactionBuilder()
            .withOverrides({
                options: {
                    getUser: vi.fn().mockReturnValue(targetUser),
                },
            } as any)
            .build();

        await avatarCommand.execute(interaction as any, mockEventData);

        expect(InteractionUtils.send).toHaveBeenCalledTimes(1);
        expect(InteractionUtils.send).toHaveBeenCalledWith(
            interaction,
            expect.objectContaining({
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            image: expect.objectContaining({
                                url: 'https://cdn.discordapp.com/avatars/avatar-user-123/avatar.png?size=1024',
                            }),
                        }),
                    }),
                ],
            })
        );
    });
});
