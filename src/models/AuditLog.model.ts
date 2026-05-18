import mongoose, { Schema, Document, Model } from 'mongoose';
import { AuditAction } from './enums';

export interface IAuditLog extends Document {
    _id: mongoose.Types.ObjectId;
    actor_id: mongoose.Types.ObjectId;
    actor_role: string; // Denormalized for log integrity
    action_type: AuditAction;
    resource_type: string; // patient, chat_message, document, session, etc.
    resource_id?: string; // UUID of what was accessed
    ip_address?: string;
    user_agent?: string;
    metadata?: Record<string, any>; // Extra context - NO raw PHI content
    created_at: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
    {
        actor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        actor_role: { type: String, required: true },
        action_type: { type: String, enum: Object.values(AuditAction), required: true },
        resource_type: { type: String, required: true },
        resource_id: { type: String },
        ip_address: { type: String },
        user_agent: { type: String },
        metadata: { type: Schema.Types.Mixed }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'audit_logs'
    }
);

// Indexes
AuditLogSchema.index({ actor_id: 1, created_at: -1 });
AuditLogSchema.index({ action_type: 1, created_at: -1 });
AuditLogSchema.index({ resource_type: 1, resource_id: 1 });
AuditLogSchema.index({ created_at: -1 });

// HIPAA Requirement: Prevent updates and deletes on audit logs
// This should be enforced at application level and database user permissions
AuditLogSchema.pre('findOneAndUpdate', function() {
    throw new Error('Audit logs cannot be updated');
});

AuditLogSchema.pre('findOneAndDelete', function() {
    throw new Error('Audit logs cannot be deleted');
});

export const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
