import { z } from 'zod';
import { SessionStatus } from '../models/enums';

export const createBookingSchema = z.object({
    doctor_id: z.string().min(1, 'Doctor ID is required'),
    scheduled_date: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
    scheduled_start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
    scheduled_end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)'),
    timezone: z.string().min(1, 'Timezone is required'),
    session_type: z.string().min(2, 'Session type is required'),
    notes: z.string().optional(),
});

export const updateBookingStatusSchema = z.object({
    status: z.nativeEnum(SessionStatus),
    cancellation_reason: z.string().optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;
