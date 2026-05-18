import { Router } from 'express';
import { avatarViewerController } from './avatarViewer.controller';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { Role } from '../../models/enums';
import { validate } from '../../middleware/validate';
import {
    avatarViewerCommandSchema,
    viewerSessionIdParamSchema
} from '../../validators/avatarViewer.validator';

const router = Router();

router.post(
    '/session',
    verifyJWT,
    requireRole([Role.PATIENT]),
    avatarViewerController.createSession.bind(avatarViewerController)
);

router.get('/session/me', avatarViewerController.resolveSession.bind(avatarViewerController));

router.get('/assets/avatar.glb', avatarViewerController.streamAvatarGlb.bind(avatarViewerController));
router.get('/assets/animations/:animationId.glb', avatarViewerController.streamAnimationGlb.bind(avatarViewerController));

router.post(
    '/session/:sessionId/command',
    verifyJWT,
    validate(viewerSessionIdParamSchema, 'params'),
    validate(avatarViewerCommandSchema),
    avatarViewerController.sendCommand.bind(avatarViewerController)
);

export default router;
