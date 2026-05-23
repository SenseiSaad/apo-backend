import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid avatar record ID');

export const createAvatarViewerSessionSchema = z.object({
    avatarRecordId: objectId.optional(),
    avatarId: z.string().trim().min(1).max(160).optional()
}).optional();

export const viewerSessionIdParamSchema = z.object({
    sessionId: z.string().trim().min(8).max(120)
});

export const avatarViewerCommandSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('expression'),
        name: z.string().trim().min(1).max(80)
    }),
    z.object({
        type: z.literal('animation'),
        name: z.string().trim().min(1).max(80)
    }),
    z.object({
        type: z.literal('state'),
        expression: z.string().trim().min(1).max(80),
        animation: z.string().trim().min(1).max(80),
        playOnce: z.boolean().optional(),
        returnTo: z.string().optional()
    })
]);

export type ViewerSessionIdParamInput = z.infer<typeof viewerSessionIdParamSchema>;
export type CreateAvatarViewerSessionInput = z.infer<typeof createAvatarViewerSessionSchema>;
export type AvatarViewerCommandInput = z.infer<typeof avatarViewerCommandSchema>;
