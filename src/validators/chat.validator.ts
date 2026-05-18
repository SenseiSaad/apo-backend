import { z } from 'zod';

// Send chat message
export const sendMessageSchema = z.object({
    message: z.string()
        .min(1, 'Message cannot be empty')
        .max(2000, 'Message must be less than 2000 characters'),
    session_id: z.string().optional()
});

// Get chat history
export const getChatHistorySchema = z.object({
    session_id: z.string().optional(),
    limit: z.number().min(1).max(100).optional()
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type GetChatHistoryInput = z.infer<typeof getChatHistorySchema>;
