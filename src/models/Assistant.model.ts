import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAssistantPermissions {
    can_view_assigned_patients: boolean;
    can_assign_patients: boolean;
    can_manage_bookings: boolean;
    can_send_communications: boolean;
}

export interface IAssistant extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    assigned_doctor_ids: mongoose.Types.ObjectId[];
    permissions: IAssistantPermissions;
    created_at: Date;
    updated_at: Date;
}

const AssistantPermissionsSchema = new Schema<IAssistantPermissions>({
    can_view_assigned_patients: { type: Boolean, default: true },
    can_assign_patients: { type: Boolean, default: false },
    can_manage_bookings: { type: Boolean, default: true },
    can_send_communications: { type: Boolean, default: true }
}, { _id: false });

const AssistantSchema = new Schema<IAssistant>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        assigned_doctor_ids: [{ type: Schema.Types.ObjectId, ref: 'Doctor' }],
        permissions: { type: AssistantPermissionsSchema, default: () => ({}) }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'assistants'
    }
);

AssistantSchema.index({ user_id: 1 });
AssistantSchema.index({ assigned_doctor_ids: 1 });

export const Assistant: Model<IAssistant> = mongoose.models.Assistant || mongoose.model<IAssistant>('Assistant', AssistantSchema);
