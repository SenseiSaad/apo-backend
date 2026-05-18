import { Router } from 'express';
import { streamojiController } from './streamoji.controller';
import { verifyJWT } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createStreamojiAuthTokenSchema } from '../../validators/streamoji.validator';

const router = Router();

router.use(verifyJWT);

router.post(
    '/auth-token',
    validate(createStreamojiAuthTokenSchema),
    streamojiController.createAuthToken.bind(streamojiController)
);

export default router;
