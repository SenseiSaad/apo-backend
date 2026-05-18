import { z } from 'zod';

export const createStreamojiAuthTokenSchema = z.object({
    userName: z.string().trim().min(1).max(120).optional(),
    maxAvatarsCreations: z.number().int().min(1).max(100).optional()
});

export type CreateStreamojiAuthTokenInput = z.infer<typeof createStreamojiAuthTokenSchema>;
