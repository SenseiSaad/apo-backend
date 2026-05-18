import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid avatar record ID');

export const saveStreamojiAvatarSchema = z.object({
    avatarRecordId: objectId.optional(),
    avatarId: z.string().trim().min(1).max(160),
    avatarUrl: z.string().trim().url().optional(),
    thumbnailUrl: z.string().trim().url().optional(),
    avatarGender: z.string().trim().max(40).optional(),
    streamojiAuthToken: z.string().trim().min(1).optional(),
    makeActive: z.boolean().optional()
});

export const avatarRecordIdParamSchema = z.object({
    avatarRecordId: objectId
});

export type SaveStreamojiAvatarInput = z.infer<typeof saveStreamojiAvatarSchema>;
export type AvatarRecordIdParamInput = z.infer<typeof avatarRecordIdParamSchema>;
