import mongoose, { Schema, Document, Model } from 'mongoose';
import { ActivityType } from './enums';

export interface IActivityCalendar extends Document {
    _id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    doctor_id: mongoose.Types.ObjectId;
    activity_type: ActivityType;
    title: string;
    instructions: string; // Encrypted
    scheduled_at: Date;
    recurrence_rule?: string; // iCal RRULE format
    completed_at?: Date;
    doctor_note?: string; // Encrypted, never sent to patient API
    duration?: number; // minutes
    created_at: Date;
    updated_at: Date;
}

const ActivityCalendarSchema = new Schema<IActivityCalendar>(
    {
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
        activity_type: { type: String, enum: Object.values(ActivityType), required: true },
        title: { type: String, required: true },
        instructions: { type: String, required: true }, // Encrypted
        scheduled_at: { type: Date, required: true },
        recurrence_rule: { type: String },
        completed_at: { type: Date },
        doctor_note: { type: String }, // Encrypted
        duration: { type: Number }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'activity_calendar'
    }
);

// Indexes
ActivityCalendarSchema.index({ patient_id: 1, scheduled_at: -1 });
ActivityCalendarSchema.index({ doctor_id: 1 });
ActivityCalendarSchema.index({ scheduled_at: 1 });

export const ActivityCalendar: Model<IActivityCalendar> = mongoose.models.ActivityCalendar || mongoose.model<IActivityCalendar>('ActivityCalendar', ActivityCalendarSchema);
