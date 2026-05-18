import { z } from 'zod';

export const updateAvatarSettingsSchema = z.object({
    avatarLimits: z.object({
        free: z.number().int().min(0).max(100),
        basic: z.number().int().min(0).max(100),
        premium: z.number().int().min(0).max(100)
    })
});

export type UpdateAvatarSettingsInput = z.infer<typeof updateAvatarSettingsSchema>;
