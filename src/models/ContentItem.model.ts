import mongoose, { Schema, Document, Model } from 'mongoose';
import { ContentType, ContentTopic, ContentDifficulty } from './enums';

export interface IContentItem extends Document {
    _id: mongoose.Types.ObjectId;
    title: string;
    type: ContentType;
    topic: ContentTopic;
    duration?: number; // minutes
    difficulty?: ContentDifficulty;
    s3_key?: string; // for audio files
    content?: string; // for article HTML/markdown
    is_published: boolean;
    created_at: Date;
    updated_at: Date;
}

const ContentItemSchema = new Schema<IContentItem>(
    {
        title: { type: String, required: true },
        type: { type: String, enum: Object.values(ContentType), required: true },
        topic: { type: String, enum: Object.values(ContentTopic), required: true },
        duration: { type: Number },
        difficulty: { type: String, enum: Object.values(ContentDifficulty) },
        s3_key: { type: String },
        content: { type: String },
        is_published: { type: Boolean, default: false }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'content_items'
    }
);

// Indexes
ContentItemSchema.index({ type: 1, topic: 1, is_published: 1 });
ContentItemSchema.index({ is_published: 1, created_at: -1 });

export const ContentItem: Model<IContentItem> = mongoose.models.ContentItem || mongoose.model<IContentItem>('ContentItem', ContentItemSchema);
