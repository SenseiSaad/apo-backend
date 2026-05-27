import mongoose, { Schema, Document, Model } from 'mongoose';

export type TriageConversationStatus = 'open' | 'closed' | 'archived';
export type TriageMessageSenderRole = 'patient' | 'assistant' | 'admin' | 'system';
export type TriageMessageType = 'text' | 'system';

export interface ITriageConversation extends Document {
    _id: mongoose.Types.ObjectId;
    care_request_id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    assistant_user_id?: mongoose.Types.ObjectId;
    assistant_id?: mongoose.Types.ObjectId;
    status: TriageConversationStatus;
    doctor_handoff_notes?: string;
    patient_unread_count: number;
    assistant_unread_count: number;
    admin_unread_count: number;
    last_message_at?: Date;
    closed_at?: Date;
    closed_by?: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;
}

export interface ITriageMessage extends Document {
    _id: mongoose.Types.ObjectId;
    conversation_id: mongoose.Types.ObjectId;
    care_request_id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    sender_user_id?: mongoose.Types.ObjectId;
    sender_role: TriageMessageSenderRole;
    message_type: TriageMessageType;
    body: string;
    read_by_patient_at?: Date;
    read_by_assistant_at?: Date;
    read_by_admin_at?: Date;
    created_at: Date;
}

const TriageConversationSchema = new Schema<ITriageConversation>(
    {
        care_request_id: { type: Schema.Types.ObjectId, ref: 'CareRequest', required: true, unique: true, index: true },
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
        assistant_user_id: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        assistant_id: { type: Schema.Types.ObjectId, ref: 'Assistant' },
        status: { type: String, enum: ['open', 'closed', 'archived'], default: 'open', required: true, index: true },
        doctor_handoff_notes: { type: String, maxlength: 6000 },
        patient_unread_count: { type: Number, default: 0, min: 0 },
        assistant_unread_count: { type: Number, default: 0, min: 0 },
        admin_unread_count: { type: Number, default: 0, min: 0 },
        last_message_at: { type: Date },
        closed_at: { type: Date },
        closed_by: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'triage_conversations'
    }
);

const TriageMessageSchema = new Schema<ITriageMessage>(
    {
        conversation_id: { type: Schema.Types.ObjectId, ref: 'TriageConversation', required: true, index: true },
        care_request_id: { type: Schema.Types.ObjectId, ref: 'CareRequest', required: true, index: true },
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
        sender_user_id: { type: Schema.Types.ObjectId, ref: 'User' },
        sender_role: { type: String, enum: ['patient', 'assistant', 'admin', 'system'], required: true },
        message_type: { type: String, enum: ['text', 'system'], default: 'text', required: true },
        body: { type: String, required: true, maxlength: 4000 },
        read_by_patient_at: { type: Date },
        read_by_assistant_at: { type: Date },
        read_by_admin_at: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'triage_messages'
    }
);

TriageConversationSchema.index({ patient_id: 1, status: 1, last_message_at: -1 });
TriageConversationSchema.index({ assistant_user_id: 1, status: 1, last_message_at: -1 });
TriageConversationSchema.index({ status: 1, last_message_at: -1 });
TriageMessageSchema.index({ conversation_id: 1, created_at: -1, _id: -1 });
TriageMessageSchema.index({ conversation_id: 1, read_by_patient_at: 1 });
TriageMessageSchema.index({ conversation_id: 1, read_by_assistant_at: 1 });

export const TriageConversation: Model<ITriageConversation> =
    mongoose.models.TriageConversation || mongoose.model<ITriageConversation>('TriageConversation', TriageConversationSchema);

export const TriageMessage: Model<ITriageMessage> =
    mongoose.models.TriageMessage || mongoose.model<ITriageMessage>('TriageMessage', TriageMessageSchema);
