import { Router } from 'express';
import { doctorController } from './doctor.controller';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Role } from '../../models/enums';
import {
    createDoctorAssistantSchema,
    updateDoctorAvailabilitySchema,
    invitePatientSchema,
    DoctorAssistantIdParamSchema,
    updateDoctorAssistantSchema,
    updateDoctorPersonalInfoSchema,
    updateDoctorProfessionalInfoSchema,
    updateDoctorSettingsSchema
} from '../../validators/doctor.validator';

const router = Router();

router.use(verifyJWT);
router.use(requireRole([Role.DOCTOR]));

router.get('/profile', doctorController.getProfile.bind(doctorController));
router.patch('/profile/personal', validate(updateDoctorPersonalInfoSchema), doctorController.updatePersonalInfo.bind(doctorController));
router.patch('/profile/professional', validate(updateDoctorProfessionalInfoSchema), doctorController.updateProfessionalInfo.bind(doctorController));
router.put('/availability', validate(updateDoctorAvailabilitySchema), doctorController.updateAvailability.bind(doctorController));
router.patch('/settings', validate(updateDoctorSettingsSchema), doctorController.updateSettings.bind(doctorController));
router.post('/patient-invites', validate(invitePatientSchema), doctorController.invitePatient.bind(doctorController));
router.get('/patient-invites', doctorController.getPatientInvites.bind(doctorController));
router.get('/assistants', doctorController.getAssistants.bind(doctorController));
router.post('/assistants', validate(createDoctorAssistantSchema), doctorController.inviteAssistant.bind(doctorController));
router.get(
    '/assistants/:assistantId',
    validate(DoctorAssistantIdParamSchema, 'params'),
    doctorController.getAssistantDetail.bind(doctorController)
);
router.patch(
    '/assistants/:assistantId',
    validate(DoctorAssistantIdParamSchema, 'params'),
    validate(updateDoctorAssistantSchema),
    doctorController.updateAssistant.bind(doctorController)
);

export default router;
