import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChatMessage extends Document {
    _id: mongoose.Types.ObjectId;
    session_id: mongoose.Types.ObjectId;
    role: 'user' | 'assistant';
    content: string; // AES-256 encrypted
    token_count: number;
    is_crisis_flagged: boolean;
    created_at: Date;
}

export interface IChatSession extends Document {
    _id: mongoose.Types.ObjectId;
    patient_id: mongoose.Types.ObjectId;
    started_at: Date;
    ended_at?: Date;
    message_count: number;
    tokens_used: number;
    created_at: Date;
    updated_at: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
    {
        session_id: { type: Schema.Types.ObjectId, ref: 'ChatSession', required: true },
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true }, // Encrypted
        token_count: { type: Number, required: true },
        is_crisis_flagged: { type: Boolean, default: false }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'chat_messages'
    }
);

const ChatSessionSchema = new Schema<IChatSession>(
    {
        patient_id: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
        started_at: { type: Date, default: Date.now },
        ended_at: { type: Date },
        message_count: { type: Number, default: 0 },
        tokens_used: { type: Number, default: 0 }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'chat_sessions'
    }
);

// Indexes
ChatMessageSchema.index({ session_id: 1, created_at: -1 });
ChatMessageSchema.index({ is_crisis_flagged: 1 });
ChatSessionSchema.index({ patient_id: 1, started_at: -1 });

export const ChatMessage: Model<IChatMessage> = mongoose.models.ChatMessage || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
export const ChatSession: Model<IChatSession> = mongoose.models.ChatSession || mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
