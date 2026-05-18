import { z } from 'zod';

// Get activities by date range
export const getActivitiesSchema = z.object({
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional(),
    activity_type: z.string().optional(),
    status: z.enum(['pending', 'completed']).optional()
});

// Complete activity
export const completeActivitySchema = z.object({
    notes: z.string().max(500, 'Notes must be less than 500 characters').optional()
});

export type GetActivitiesInput = z.infer<typeof getActivitiesSchema>;
export type CompleteActivityInput = z.infer<typeof completeActivitySchema>;
