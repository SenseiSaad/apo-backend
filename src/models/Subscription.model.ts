import mongoose, { Schema, Document, Model } from 'mongoose';
import { Tier, SubscriptionStatus } from './enums';

export interface ISubscription extends Document {
    _id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    stripe_subscription_id?: string;
    tier: Tier;
    status: SubscriptionStatus;
    current_period_end?: Date;
    cancel_at_period_end: boolean;
    grace_period_end?: Date;
    created_at: Date;
    updated_at: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        stripe_subscription_id: { type: String },
        tier: { type: String, enum: Object.values(Tier), required: true },
        status: { type: String, enum: Object.values(SubscriptionStatus), required: true },
        current_period_end: { type: Date },
        cancel_at_period_end: { type: Boolean, default: false },
        grace_period_end: { type: Date }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'subscriptions'
    }
);

// Indexes
SubscriptionSchema.index({ user_id: 1 });
SubscriptionSchema.index({ stripe_subscription_id: 1 }, { sparse: true });
SubscriptionSchema.index({ status: 1, grace_period_end: 1 });

export const Subscription: Model<ISubscription> = mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
