import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import {
    listNotifications,
    getUnreadCount,
    markRead,
    markAllRead,
    deleteNotification,
    deleteAll,
} from './notification.controller';

const router = Router();

// All notification routes require a valid access token
router.use(authenticate);

/** List paginated notifications for the current user.
 *  Query params: page, limit, filter (unread | activity_reminder | triage_message | care_request | session_reminder | crisis | doctor_message) */
router.get('/', listNotifications);

/** Get cached unread count */
router.get('/unread-count', getUnreadCount);

/** Mark all as read */
router.patch('/read-all', markAllRead);

/** Mark a single notification as read */
router.patch('/:id/read', markRead);

/** Delete a single notification */
router.delete('/:id', deleteNotification);

/** Delete all notifications for the current user */
router.delete('/', deleteAll);

export default router;
