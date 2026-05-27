import { Router } from 'express';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Role } from '../../models/enums';
import { videoSessionController } from './videoSession.controller';
import {
    availableVideoSlotsQuerySchema,
    cancelVideoSessionSchema,
    careRequestVideoParamSchema,
    createVideoSessionSchema,
    videoSessionIdParamSchema
} from '../../validators/videoSession.validator';

const router = Router();

router.use(verifyJWT);
router.use(requireRole([Role.PATIENT, Role.DOCTOR, Role.SUPER_ADMIN]));

router.post('/cleanup-expired', requireRole([Role.SUPER_ADMIN]), videoSessionController.cleanup.bind(videoSessionController));
router.get(
    '/care-requests/:careRequestId',
    validate(careRequestVideoParamSchema, 'params'),
    videoSessionController.listForCareRequest.bind(videoSessionController)
);
router.get(
    '/care-requests/:careRequestId/available-slots',
    validate(careRequestVideoParamSchema, 'params'),
    validate(availableVideoSlotsQuerySchema, 'query'),
    videoSessionController.availableSlots.bind(videoSessionController)
);
router.post('/', validate(createVideoSessionSchema), videoSessionController.create.bind(videoSessionController));
router.post(
    '/:sessionId/join-token',
    requireRole([Role.PATIENT, Role.DOCTOR]),
    validate(videoSessionIdParamSchema, 'params'),
    videoSessionController.joinToken.bind(videoSessionController)
);
router.post('/:sessionId/end', validate(videoSessionIdParamSchema, 'params'), videoSessionController.end.bind(videoSessionController));
router.post(
    '/:sessionId/cancel',
    validate(videoSessionIdParamSchema, 'params'),
    validate(cancelVideoSessionSchema),
    videoSessionController.cancel.bind(videoSessionController)
);

export default router;
