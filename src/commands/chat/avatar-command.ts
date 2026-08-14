import { ChatInputCommandInteraction, EmbedBuilder, PermissionsString, User } from 'discord.js';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class AvatarCommand implements Command {
    public names = [Lang.getRef('chatCommands.avatar', Language.Default)];
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        const targetUser = intr.options.getUser(Lang.getRef('arguments.user', Language.Default));

        if (!targetUser) {
            await InteractionUtils.send(
                intr,
                {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription('You need to tag a user to view their avatar.')
                            .setColor(0xff4a4a),
                    ],
                },
                true
            );
            return;
        }

        const avatarUrl = this.getUserAvatar(targetUser);
        const embed = new EmbedBuilder()
            .setTitle(`${targetUser.username}'s avatar`)
            .setImage(avatarUrl)
            .setColor(0x0099ff);

        await InteractionUtils.send(intr, embed);
    }

    private getUserAvatar(user: User): string {
        return user.avatarURL({ size: 1024, extension: 'png' }) ?? user.defaultAvatarURL;
    }
}
