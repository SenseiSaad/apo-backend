import mongoose, { Schema, Document, Model } from 'mongoose';
import { DocumentStatus } from './enums';

export interface IAiDocument extends Document {
    _id: mongoose.Types.ObjectId;
    doctor_id: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    s3_key: string;
    file_size_mb: number;
    status: DocumentStatus;
    reviewed_by?: mongoose.Types.ObjectId; // Super admin user ID
    reviewed_at?: Date;
    rejection_reason?: string;
    uploaded_at: Date;
    created_at: Date;
    updated_at: Date;
}

const AiDocumentSchema = new Schema<IAiDocument>(
    {
        doctor_id: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
        title: { type: String, required: true },
        description: { type: String },
        s3_key: { type: String, required: true },
        file_size_mb: { type: Number, required: true },
        status: { type: String, enum: Object.values(DocumentStatus), default: DocumentStatus.PENDING },
        reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewed_at: { type: Date },
        rejection_reason: { type: String },
        uploaded_at: { type: Date, default: Date.now }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'ai_documents'
    }
);

// Indexes
AiDocumentSchema.index({ doctor_id: 1, status: 1 });
AiDocumentSchema.index({ status: 1, uploaded_at: -1 });

export const AiDocument: Model<IAiDocument> = mongoose.models.AiDocument || mongoose.model<IAiDocument>('AiDocument', AiDocumentSchema);
