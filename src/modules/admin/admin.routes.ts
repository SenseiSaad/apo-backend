import { Router } from 'express';
import { adminController } from './admin.controller';
import { validate } from '../../middleware/validate';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { Role } from '../../models/enums';
import {
    adminForgotPasswordSchema,
    adminResendSignupOtpSchema,
    adminResetPasswordSchema,
    adminSigninSchema,
    adminSignupSchema,
    adminVerifyOtpSchema,
    completeAssistantSetupSchema,
    assistantIdParamSchema,
    AssistantSetupTokenSchema,
    AssistantDoctorParamSchema,
    createAssistantAccountSchema,
    createDoctorAccountSchema,
    assignPatientDoctorSchema,
    careRequestIdParamSchema,
    getAssignablePatientsQuerySchema,
    getCareRequestsQuerySchema,
    getPatientsQuerySchema,
    getActiveAssistantsQuerySchema,
    getActiveDoctorsQuerySchema,
    patientIdParamSchema,
    setAssistantDoctorsSchema,
    doctorIdParamSchema,
    updateDoctorAccountSchema,
    updateAssistantSchema,
    updateCareRequestTriageSchema,
    updateDoctorCredentialsSchema
} from '../../validators/admin.validator';
import { updateAvatarSettingsSchema } from '../../validators/avatarSettings.validator';

const router = Router();

// Public bootstrap route. Only succeeds when no super admin exists yet.
router.post('/signup', validate(adminSignupSchema), adminController.signup.bind(adminController));
router.post('/signup/resend-otp', validate(adminResendSignupOtpSchema), adminController.resendSignupOtp.bind(adminController));
router.post('/signup/verify-otp', validate(adminVerifyOtpSchema), adminController.verifySignupOtp.bind(adminController));
router.post('/signin/check-otp', validate(adminSigninSchema), adminController.checkSigninOtpRequirement.bind(adminController));
router.post('/signin', validate(adminSigninSchema), adminController.signin.bind(adminController));
router.post('/signin/resend-otp', validate(adminSigninSchema), adminController.resendSigninOtp.bind(adminController));
router.post('/signin/verify-otp', validate(adminVerifyOtpSchema), adminController.verifySigninOtp.bind(adminController));
router.post('/password/forgot', validate(adminForgotPasswordSchema), adminController.forgotPassword.bind(adminController));
router.post('/password/reset', validate(adminResetPasswordSchema), adminController.resetPassword.bind(adminController));
router.post('/assistant-setup/validate', validate(AssistantSetupTokenSchema), adminController.validateAssistantSetup.bind(adminController));
router.post('/assistant-setup/resend-otp', validate(AssistantSetupTokenSchema), adminController.resendAssistantSetupOtp.bind(adminController));
router.post('/assistant-setup/complete', validate(completeAssistantSetupSchema), adminController.completeAssistantSetup.bind(adminController));

// Protected admin routes can be added below this guard.
router.use(verifyJWT);
router.use(requireRole([Role.SUPER_ADMIN]));

router.get('/me', adminController.me.bind(adminController));
router.get('/dashboard/summary', adminController.getDashboardSummary.bind(adminController));
router.get('/avatar-settings', adminController.getAvatarSettings.bind(adminController));
router.patch('/avatar-settings', validate(updateAvatarSettingsSchema), adminController.updateAvatarSettings.bind(adminController));
router.get('/doctors/active', validate(getActiveDoctorsQuerySchema, 'query'), adminController.getActiveDoctors.bind(adminController));
router.get('/patients/stats', adminController.getPatientManagementStats.bind(adminController));
router.get('/patients', validate(getPatientsQuerySchema, 'query'), adminController.getPatients.bind(adminController));
router.get('/patients/assignable', validate(getAssignablePatientsQuerySchema, 'query'), adminController.getAssignablePatients.bind(adminController));
router.get('/patients/:patientId/case-details', validate(patientIdParamSchema, 'params'), adminController.getPatientCaseDetails.bind(adminController));
router.get('/care-requests', validate(getCareRequestsQuerySchema, 'query'), adminController.getCareRequests.bind(adminController));
router.patch(
    '/care-requests/:careRequestId/triage',
    validate(careRequestIdParamSchema, 'params'),
    validate(updateCareRequestTriageSchema),
    adminController.updateCareRequestTriage.bind(adminController)
);
router.post(
    '/patients/:patientId/assign-doctor',
    validate(patientIdParamSchema, 'params'),
    validate(assignPatientDoctorSchema),
    adminController.assignPatientToDoctor.bind(adminController)
);
router.delete(
    '/patients/:patientId/doctor',
    validate(patientIdParamSchema, 'params'),
    adminController.unassignPatientFromDoctor.bind(adminController)
);
router.post('/doctors', validate(createDoctorAccountSchema), adminController.createDoctorAccount.bind(adminController));
router.get('/doctors/:doctorId', validate(doctorIdParamSchema, 'params'), adminController.getDoctorDetails.bind(adminController));
router.patch(
    '/doctors/:doctorId/credentials',
    validate(doctorIdParamSchema, 'params'),
    validate(updateDoctorCredentialsSchema),
    adminController.updateDoctorCredentials.bind(adminController)
);
router.patch(
    '/doctors/:doctorId/account',
    validate(doctorIdParamSchema, 'params'),
    validate(updateDoctorAccountSchema),
    adminController.updateDoctorAccount.bind(adminController)
);
router.post(
    '/doctors/:doctorId/setup-invite',
    validate(doctorIdParamSchema, 'params'),
    adminController.resendDoctorSetupInvite.bind(adminController)
);
router.get('/assistants/active', validate(getActiveAssistantsQuerySchema, 'query'), adminController.getActiveAssistants.bind(adminController));
router.post('/assistants', validate(createAssistantAccountSchema), adminController.createAssistantAccount.bind(adminController));
router.get('/assistants/:assistantId', validate(assistantIdParamSchema, 'params'), adminController.getAssistantDetails.bind(adminController));
router.patch('/assistants/:assistantId', validate(assistantIdParamSchema, 'params'), validate(updateAssistantSchema), adminController.updateAssistant.bind(adminController));
router.put(
    '/assistants/:assistantId/doctors',
    validate(assistantIdParamSchema, 'params'),
    validate(setAssistantDoctorsSchema),
    adminController.setAssistantDoctors.bind(adminController)
);
router.post(
    '/assistants/:assistantId/doctors/:doctorId',
    validate(AssistantDoctorParamSchema, 'params'),
    adminController.assignAssistantToDoctor.bind(adminController)
);
router.delete(
    '/assistants/:assistantId/doctors/:doctorId',
    validate(AssistantDoctorParamSchema, 'params'),
    adminController.unassignAssistantFromDoctor.bind(adminController)
);

export default router;
