import { Notification, INotification } from '../models/Notification.model';
import { NotificationType } from '../models/enums';
import { redisService } from './redis.service';
import { logger } from '../utils/logger';

export interface SendNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string; // optional deep-link, e.g. /dashboard/doctor/chat
}

type SocketPublisher = (event: string, payload: unknown, rooms: string[]) => void;

const UNREAD_TTL = 60 * 60 * 24; // 24 hours

class NotificationService {
    private socketPublisher?: SocketPublisher;

    /** Called once from the socket server after it attaches */
    setSocketPublisher(fn: SocketPublisher): void {
        this.socketPublisher = fn;
    }

    async send(input: SendNotificationInput): Promise<INotification> {
        try {
            const notification = await Notification.create({
                user_id: input.userId,
                type: input.type,
                title: input.title,
                body: input.body,
            });

            // Bump Redis unread counter (best-effort)
            try {
                const key = `notif:unread:${input.userId}`;
                const client = redisService.getClient();
                const count = await client.incr(key);
                if (count === 1) {
                    await client.expire(key, UNREAD_TTL);
                }
            } catch {
                // Redis unavailable — counter will be recomputed from DB on next fetch
            }

            // Real-time push via existing socket (if server is attached)
            if (this.socketPublisher) {
                this.socketPublisher('notification:new', {
                    _id: notification._id.toString(),
                    type: notification.type,
                    title: notification.title,
                    body: notification.body,
                    is_read: notification.is_read,
                    created_at: notification.created_at,
                }, [`user:${input.userId}`]);
            }

            return notification;
        } catch (error) {
            logger.error('NotificationService.send failed:', error);
            throw error;
        }
    }

    emitSystemEvent(event: string, payload: unknown, rooms: string[]): void {
        if (this.socketPublisher) {
            this.socketPublisher(event, payload, rooms);
        }
    }

    async getForUser(
        userId: string,
        page: number,
        limit: number,
        filter?: 'unread' | NotificationType
    ): Promise<{
        notifications: INotification[];
        total: number;
        unread: number;
        page: number;
        limit: number;
        total_pages: number;
        has_next: boolean;
        has_prev: boolean;
    }> {
        const skip = (page - 1) * limit;
        const query: Record<string, unknown> = { user_id: userId };

        if (filter === 'unread') {
            query.is_read = false;
        } else if (filter) {
            query.type = filter;
        }

        const [notifications, total, unread] = await Promise.all([
            Notification.find(query)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments(query),
            Notification.countDocuments({ user_id: userId, is_read: false }),
        ]);

        return {
            notifications: notifications as unknown as INotification[],
            total,
            unread,
            page,
            limit,
            total_pages: Math.ceil(total / limit),
            has_next: page * limit < total,
            has_prev: page > 1,
        };
    }

    async markRead(notificationId: string, userId: string): Promise<void> {
        await Notification.findOneAndUpdate(
            { _id: notificationId, user_id: userId },
            { $set: { is_read: true } }
        );
        await this.syncUnreadCount(userId);
    }

    async markAllRead(userId: string): Promise<void> {
        await Notification.updateMany(
            { user_id: userId, is_read: false },
            { $set: { is_read: true } }
        );
        try {
            await redisService.set(`notif:unread:${userId}`, '0', UNREAD_TTL);
        } catch { /* ignore */ }
    }

    async deleteOne(notificationId: string, userId: string): Promise<void> {
        const doc = await Notification.findOneAndDelete({ _id: notificationId, user_id: userId });
        if (doc && !doc.is_read) {
            await this.syncUnreadCount(userId);
        }
    }

    async deleteAll(userId: string): Promise<void> {
        await Notification.deleteMany({ user_id: userId });
        try {
            await redisService.set(`notif:unread:${userId}`, '0', UNREAD_TTL);
        } catch { /* ignore */ }
    }

    async getUnreadCount(userId: string): Promise<number> {
        try {
            const cached = await redisService.get(`notif:unread:${userId}`);
            if (cached !== null) {
                return parseInt(cached, 10);
            }
        } catch { /* Redis unavailable */ }

        const count = await Notification.countDocuments({ user_id: userId, is_read: false });
        try {
            await redisService.set(`notif:unread:${userId}`, String(count), UNREAD_TTL);
        } catch { /* ignore */ }
        return count;
    }

    private async syncUnreadCount(userId: string): Promise<void> {
        try {
            const count = await Notification.countDocuments({ user_id: userId, is_read: false });
            await redisService.set(`notif:unread:${userId}`, String(count), UNREAD_TTL);
        } catch { /* ignore */ }
    }
}

export const notificationService = new NotificationService();
