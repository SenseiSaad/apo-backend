import { Router } from 'express';
import { avatarLibraryController } from './avatarLibrary.controller';
import { verifyJWT, requireRole } from '../../middleware/auth';
import { Role } from '../../models/enums';
import { validate } from '../../middleware/validate';
import {
    avatarRecordIdParamSchema,
    saveStreamojiAvatarSchema
} from '../../validators/avatarLibrary.validator';

const router = Router();

router.use(verifyJWT);
router.use(requireRole([Role.PATIENT]));

router.post('/', validate(saveStreamojiAvatarSchema), avatarLibraryController.saveAvatar.bind(avatarLibraryController));
router.get('/', avatarLibraryController.listAvatars.bind(avatarLibraryController));
router.get('/active', avatarLibraryController.getActiveAvatar.bind(avatarLibraryController));
router.get('/latest', avatarLibraryController.getLatestAvatar.bind(avatarLibraryController));
router.patch(
    '/:avatarRecordId/active',
    validate(avatarRecordIdParamSchema, 'params'),
    avatarLibraryController.setActiveAvatar.bind(avatarLibraryController)
);

export default router;
