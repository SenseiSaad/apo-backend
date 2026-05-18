import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { verifyJWT } from '../../middleware/auth';
import {
    registerSchema,
    loginSchema,
    verifyEmailSchema,
    resendOtpSchema,
    mfaSetupSchema,
    mfaVerifySchema,
    mfaDisableSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    refreshTokenSchema,
    validateInviteSchema,
    completeInviteSchema
} from '../../validators/auth.validator';

const router = Router();

// Public routes
router.post('/register', validate(registerSchema), authController.register.bind(authController));
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail.bind(authController));
router.post('/resend-otp', validate(resendOtpSchema), authController.resendOtp.bind(authController));
router.post('/login', validate(loginSchema), authController.login.bind(authController));
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken.bind(authController));
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword.bind(authController));
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword.bind(authController));

// Invite routes
router.post('/invite/validate', validate(validateInviteSchema), authController.validateInvite.bind(authController));
router.post('/invite/complete', validate(completeInviteSchema), authController.completeInvite.bind(authController));

// Protected routes (require authentication)
router.post('/logout', verifyJWT, authController.logout.bind(authController));
router.post('/mfa/setup', verifyJWT, validate(mfaSetupSchema), authController.setupMfa.bind(authController));
router.post('/mfa/verify', verifyJWT, validate(mfaVerifySchema), authController.verifyMfa.bind(authController));
router.post('/mfa/disable', verifyJWT, validate(mfaDisableSchema), authController.disableMfa.bind(authController));

export default router;
