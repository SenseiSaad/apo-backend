import mongoose, { Schema, Document, Model } from 'mongoose';

export type CareRequestStatus =
    | 'new_request'
    | 'triage_claimed'
    | 'triage_in_progress'
    | 'pending_assignment'
    | 'assigned'
    | 'in_treatment'
    | 'follow_up_needed'
    | 'patient_requested_closure'
    | 'completed'
    | 'closed_by_patient'
    | 'cancelled'
    | 'referred_out'
    | 'not_appropriate_for_platform';

export interface ICareRequest extends Document {
    _id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    doctor_id?: mongoose.Types.ObjectId;
    claimed_by?: mongoose.Types.ObjectId;
    claimed_assistant_id?: mongoose.Types.ObjectId;
    claimed_at?: Date;
    claim_expires_at?: Date;
    assigned_by?: mongoose.Types.ObjectId;
    assigned_at?: Date;
    reason: string;
    urgency: 'low' | 'normal' | 'high';
    preferred_specialty?: string;
    preferred_doctor_gender?: 'male' | 'female' | 'any';
    availability?: string;
    patient_notes?: string;
    triage_notes?: string;
    doctor_notes?: string;
    status: CareRequestStatus;
    source: 'signup' | 'patient' | 'admin' | 'assistant' | 'doctor';
    requested_closure_at?: Date;
    closed_at?: Date;
    closed_by?: mongoose.Types.ObjectId;
    outcome?: 'completed' | 'follow_up_needed' | 'referred_out' | 'not_appropriate_for_platform';
    created_at: Date;
    updated_at: Date;
}

const CareRequestSchema = new Schema<ICareRequest>(
    {
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor', index: true },
        claimed_by: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        claimed_assistant_id: { type: Schema.Types.ObjectId, ref: 'Assistant' },
        claimed_at: { type: Date },
        claim_expires_at: { type: Date, index: true },
        assigned_by: { type: Schema.Types.ObjectId, ref: 'User' },
        assigned_at: { type: Date },
        reason: { type: String, required: true, maxlength: 2000 },
        urgency: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
        preferred_specialty: { type: String, maxlength: 120 },
        preferred_doctor_gender: { type: String, enum: ['male', 'female', 'any'] },
        availability: { type: String, maxlength: 1000 },
        patient_notes: { type: String, maxlength: 2000 },
        triage_notes: { type: String, maxlength: 4000 },
        doctor_notes: { type: String, maxlength: 4000 },
        status: {
            type: String,
            enum: [
                'new_request',
                'triage_claimed',
                'triage_in_progress',
                'pending_assignment',
                'assigned',
                'in_treatment',
                'follow_up_needed',
                'patient_requested_closure',
                'completed',
                'closed_by_patient',
                'cancelled',
                'referred_out',
                'not_appropriate_for_platform'
            ],
            default: 'new_request',
            required: true,
            index: true
        },
        source: { type: String, enum: ['signup', 'patient', 'admin', 'assistant', 'doctor'], default: 'patient' },
        requested_closure_at: { type: Date },
        closed_at: { type: Date },
        closed_by: { type: Schema.Types.ObjectId, ref: 'User' },
        outcome: {
            type: String,
            enum: ['completed', 'follow_up_needed', 'referred_out', 'not_appropriate_for_platform']
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'care_requests'
    }
);

CareRequestSchema.index({ patient_id: 1, status: 1 });
CareRequestSchema.index({ doctor_id: 1, status: 1 });
CareRequestSchema.index({ status: 1, claimed_by: 1, claim_expires_at: 1 });
CareRequestSchema.index({ created_at: -1 });

export const CareRequest: Model<ICareRequest> = mongoose.models.CareRequest || mongoose.model<ICareRequest>('CareRequest', CareRequestSchema);
