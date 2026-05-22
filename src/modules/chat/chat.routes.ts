import { Router } from 'express';
import { chatController } from './chat.controller';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Role } from '../../models/enums';
import { sendMessageSchema } from '../../validators/chat.validator';

const router = Router();

// All chat routes require authentication and patient role
router.use(verifyJWT);
router.use(requireRole([Role.PATIENT]));

// Send message (AI chat)
router.post('/message', validate(sendMessageSchema), chatController.sendMessage.bind(chatController));
router.post('/message/stream', validate(sendMessageSchema), chatController.streamMessage.bind(chatController));

// Get chat history
router.get('/history', chatController.getChatHistory.bind(chatController));

// Get all chat sessions
router.get('/sessions', chatController.getChatSessions.bind(chatController));

// End chat session
router.post('/sessions/:id/end', chatController.endSession.bind(chatController));

export default router;
