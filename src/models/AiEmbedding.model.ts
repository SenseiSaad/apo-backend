import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAiEmbedding extends Document {
    _id: mongoose.Types.ObjectId;
    document_id: mongoose.Types.ObjectId;
    chunk_index: number;
    chunk_text: string; // Encrypted
    embedding: number[]; // 1536-dim vector for OpenAI text-embedding-3-small
    created_at: Date;
}

const AiEmbeddingSchema = new Schema<IAiEmbedding>(
    {
        document_id: { type: Schema.Types.ObjectId, ref: 'AiDocument', required: true },
        chunk_index: { type: Number, required: true },
        chunk_text: { type: String, required: true }, // Encrypted
        embedding: { type: [Number], required: true } // Array of 1536 floats
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'ai_embeddings'
    }
);

// Indexes
AiEmbeddingSchema.index({ document_id: 1, chunk_index: 1 });
// Note: For production, use vector database like Pinecone or pgvector
// MongoDB doesn't have native vector similarity search

export const AiEmbedding: Model<IAiEmbedding> = mongoose.models.AiEmbedding || mongoose.model<IAiEmbedding>('AiEmbedding', AiEmbeddingSchema);
