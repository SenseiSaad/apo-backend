import { Router } from 'express';
import { assistantController } from './assistant.controller';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Role } from '../../models/enums';
import {
    AssistantBookingIdParamSchema,
    AssistantPatientIdParamSchema,
    assignAssistantPatientDoctorSchema,
    sendAssistantPatientMessageSchema,
    updateAssistantBookingStatusSchema
} from '../../validators/assistant.validator';

const router = Router();

router.use(verifyJWT);
router.use(requireRole([Role.ASSISTANT]));

router.get('/me', assistantController.me.bind(assistantController));
router.get('/doctors', assistantController.getDoctors.bind(assistantController));
router.get('/patients', assistantController.getPatients.bind(assistantController));
router.get('/patients/:patientId', validate(AssistantPatientIdParamSchema, 'params'), assistantController.getPatient.bind(assistantController));
router.post(
    '/patients/:patientId/assign-doctor',
    validate(AssistantPatientIdParamSchema, 'params'),
    validate(assignAssistantPatientDoctorSchema),
    assistantController.assignPatientToDoctor.bind(assistantController)
);
router.post(
    '/patients/:patientId/message',
    validate(AssistantPatientIdParamSchema, 'params'),
    validate(sendAssistantPatientMessageSchema),
    assistantController.sendPatientMessage.bind(assistantController)
);

// TODO: Booking workflow is intentionally exposed as a placeholder until booking creation is implemented.
router.get('/bookings', assistantController.getBookings.bind(assistantController));
router.patch(
    '/bookings/:bookingId/status',
    validate(AssistantBookingIdParamSchema, 'params'),
    validate(updateAssistantBookingStatusSchema),
    assistantController.updateBookingStatus.bind(assistantController)
);

export default router;
