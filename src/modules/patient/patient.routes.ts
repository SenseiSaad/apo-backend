import { Router } from 'express';
import { patientController } from './patient.controller';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Role } from '../../models/enums';
import {
    updateProfileSchema,
    updateCareStatusSchema,
    createCareRequestSchema,
    assignAvatarSchema,
    DoctorRequestSchema,
    patientInviteIdParamSchema
} from '../../validators/patient.validator';

const router = Router();

// All patient routes require authentication and patient role
router.use(verifyJWT);
router.use(requireRole([Role.PATIENT]));

// Profile routes
router.get('/profile', patientController.getProfile.bind(patientController));
router.patch('/profile', validate(updateProfileSchema), patientController.updateProfile.bind(patientController));
router.patch('/care-status', validate(updateCareStatusSchema), patientController.updateCareStatus.bind(patientController));
router.get('/care-requests', patientController.getCareRequests.bind(patientController));
router.post('/care-requests', validate(createCareRequestSchema), patientController.createCareRequest.bind(patientController));
router.post('/care-requests/request-closure', patientController.requestCareClosure.bind(patientController));

// Avatar
router.post('/avatar/assign', validate(assignAvatarSchema), patientController.assignAvatar.bind(patientController));
router.post('/avatar', validate(assignAvatarSchema), patientController.assignAvatar.bind(patientController));

// Dashboard
router.get('/home-data', patientController.getHomeData.bind(patientController));

// Usage stats
router.get('/token-usage', patientController.getTokenUsage.bind(patientController));

// Subscription
router.get('/subscription', patientController.getSubscription.bind(patientController));

// Doctor request
router.post('/doctor-request', validate(DoctorRequestSchema), patientController.submitDoctorRequest.bind(patientController));

// Doctor invites
router.get('/invites', patientController.getInvites.bind(patientController));
router.post('/invites/:inviteId/accept', validate(patientInviteIdParamSchema, 'params'), patientController.acceptInvite.bind(patientController));
router.post('/invites/:inviteId/decline', validate(patientInviteIdParamSchema, 'params'), patientController.declineInvite.bind(patientController));

export default router;
