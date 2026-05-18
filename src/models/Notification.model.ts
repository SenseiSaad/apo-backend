import mongoose, { Schema, Document, Model } from 'mongoose';
import { NotificationType } from './enums';

export interface INotification extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    type: NotificationType;
    title: string;
    body: string; // No PHI in body text
    is_read: boolean;
    created_at: Date;
}

export interface IPushToken extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    token: string; // Expo push token or APNs token
    platform: 'ios';
    created_at: Date;
}

const NotificationSchema = new Schema<INotification>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: Object.values(NotificationType), required: true },
        title: { type: String, required: true },
        body: { type: String, required: true },
        is_read: { type: Boolean, default: false }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'notifications'
    }
);

const PushTokenSchema = new Schema<IPushToken>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        token: { type: String, required: true },
        platform: { type: String, enum: ['ios'], default: 'ios' }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: false },
        collection: 'push_tokens'
    }
);

// Indexes
NotificationSchema.index({ user_id: 1, created_at: -1 });
NotificationSchema.index({ user_id: 1, is_read: 1 });
PushTokenSchema.index({ user_id: 1, token: 1 }, { unique: true });

export const Notification: Model<INotification> = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
export const PushToken: Model<IPushToken> = mongoose.models.PushToken || mongoose.model<IPushToken>('PushToken', PushTokenSchema);
