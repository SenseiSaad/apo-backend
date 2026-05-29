import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { notificationService } from '../../services/notification.service';
import { NotificationType } from '../../models/enums';

const PAGE_LIMIT = 20;

/** GET /api/v1/notifications */
export async function listNotifications(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.user_id;
        const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || String(PAGE_LIMIT), 10)));
        const rawFilter = req.query.filter as string | undefined;

        const validTypes: string[] = [...Object.values(NotificationType), 'unread'];
        const filter = rawFilter && validTypes.includes(rawFilter)
            ? (rawFilter as 'unread' | NotificationType)
            : undefined;

        const result = await notificationService.getForUser(userId, page, limit, filter);

        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

/** GET /api/v1/notifications/unread-count */
export async function getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        const count = await notificationService.getUnreadCount(req.user!.user_id);
        res.json({ success: true, data: { unread: count } });
    } catch (error) {
        next(error);
    }
}

/** PATCH /api/v1/notifications/:id/read */
export async function markRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        await notificationService.markRead(req.params.id, req.user!.user_id);
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        next(error);
    }
}

/** PATCH /api/v1/notifications/read-all */
export async function markAllRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        await notificationService.markAllRead(req.user!.user_id);
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        next(error);
    }
}

/** DELETE /api/v1/notifications/:id */
export async function deleteNotification(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        await notificationService.deleteOne(req.params.id, req.user!.user_id);
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        next(error);
    }
}

/** DELETE /api/v1/notifications */
export async function deleteAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        await notificationService.deleteAll(req.user!.user_id);
        res.json({ success: true, message: 'All notifications deleted' });
    } catch (error) {
        next(error);
    }
}
