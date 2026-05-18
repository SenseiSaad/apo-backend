import { Router } from 'express';
import { activitiesController } from './activities.controller';
import { verifyJWT, requireRole, requireTier } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { Role, Tier } from '../../models/enums';
import { completeActivitySchema } from '../../validators/activity.validator';

const router = Router();

// All activity routes require authentication and patient role
router.use(verifyJWT);
router.use(requireRole([Role.PATIENT]));

// Activities require at least Basic tier (not free)
router.use(requireTier([Tier.BASIC, Tier.PREMIUM]));

// Get activities (with filters)
router.get('/', activitiesController.getActivities.bind(activitiesController));

// Get activity statistics
router.get('/stats', activitiesController.getActivityStats.bind(activitiesController));

// Get single activity detail
router.get('/:id', activitiesController.getActivityDetail.bind(activitiesController));

// Complete activity
router.patch('/:id/complete', validate(completeActivitySchema), activitiesController.completeActivity.bind(activitiesController));

export default router;
