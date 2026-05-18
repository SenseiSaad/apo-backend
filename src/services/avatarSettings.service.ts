import { AvatarSettings } from '../models/AvatarSettings.model';
import { Tier } from '../models/enums';

export const DEFAULT_AVATAR_LIMITS: Record<Tier, number> = {
    [Tier.FREE]: 3,
    [Tier.BASIC]: 5,
    [Tier.PREMIUM]: 7
};

export class AvatarSettingsService {
    async getSettings() {
        const settings = await AvatarSettings.findOneAndUpdate(
            { key: 'global' },
            { $setOnInsert: { key: 'global', avatar_limits: DEFAULT_AVATAR_LIMITS } },
            { new: true, upsert: true }
        );

        return {
            avatarLimits: {
                [Tier.FREE]: settings.avatar_limits.free ?? DEFAULT_AVATAR_LIMITS.free,
                [Tier.BASIC]: settings.avatar_limits.basic ?? DEFAULT_AVATAR_LIMITS.basic,
                [Tier.PREMIUM]: settings.avatar_limits.premium ?? DEFAULT_AVATAR_LIMITS.premium
            }
        };
    }

    async updateSettings(avatarLimits: Record<Tier, number>) {
        const settings = await AvatarSettings.findOneAndUpdate(
            { key: 'global' },
            { $set: { avatar_limits: avatarLimits } },
            { new: true, upsert: true }
        );

        return {
            avatarLimits: {
                [Tier.FREE]: settings.avatar_limits.free,
                [Tier.BASIC]: settings.avatar_limits.basic,
                [Tier.PREMIUM]: settings.avatar_limits.premium
            }
        };
    }
}

export const avatarSettingsService = new AvatarSettingsService();
