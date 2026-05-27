import { Router } from 'express';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Role } from '../../models/enums';
import { triageChatController } from './triageChat.controller';
import {
    careRequestIdParamSchema,
    conversationIdParamSchema,
    listMessagesQuerySchema,
    listTriageConversationsQuerySchema,
    sendTriageMessageSchema,
    updateHandoffNotesSchema
} from '../../validators/triageChat.validator';

const router = Router();

router.use(verifyJWT);
router.use(requireRole([Role.PATIENT, Role.ASSISTANT, Role.DOCTOR, Role.SUPER_ADMIN]));

router.get('/conversations', validate(listTriageConversationsQuerySchema, 'query'), triageChatController.listConversations.bind(triageChatController));
router.post('/care-requests/:careRequestId/conversation', validate(careRequestIdParamSchema, 'params'), triageChatController.ensureConversation.bind(triageChatController));
router.get('/conversations/:conversationId', validate(conversationIdParamSchema, 'params'), triageChatController.getConversation.bind(triageChatController));
router.get(
    '/conversations/:conversationId/messages',
    validate(conversationIdParamSchema, 'params'),
    validate(listMessagesQuerySchema, 'query'),
    triageChatController.listMessages.bind(triageChatController)
);
router.post(
    '/conversations/:conversationId/messages',
    validate(conversationIdParamSchema, 'params'),
    validate(sendTriageMessageSchema),
    triageChatController.sendMessage.bind(triageChatController)
);
router.post('/conversations/:conversationId/read', validate(conversationIdParamSchema, 'params'), triageChatController.markRead.bind(triageChatController));
router.patch(
    '/conversations/:conversationId/handoff-notes',
    validate(conversationIdParamSchema, 'params'),
    validate(updateHandoffNotesSchema),
    triageChatController.updateHandoffNotes.bind(triageChatController)
);

export default router;
