import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { authService } from './auth.service';
import {
    RegisterInput,
    LoginInput,
    VerifyEmailInput,
    ResendOtpInput,
    MfaSetupInput,
    MfaVerifyInput,
    MfaDisableInput,
    ForgotPasswordInput,
    ResetPasswordInput,
    RefreshTokenInput,
    ValidateInviteInput,
    CompleteInviteInput
} from '../../validators/auth.validator';

export class AuthController {
    /**
     * POST /auth/register
     */
    async register(req: AuthRequest<Record<string, never>, Record<string, never>, RegisterInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.register(req.body);
            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/verify-email
     */
    async verifyEmail(req: AuthRequest<Record<string, never>, Record<string, never>, VerifyEmailInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.verifyEmail(req.body.user_id, req.body.otp);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/resend-otp
     */
    async resendOtp(req: AuthRequest<Record<string, never>, Record<string, never>, ResendOtpInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.resendOtp(req.body.email);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/login
     */
    async login(req: AuthRequest<Record<string, never>, Record<string, never>, LoginInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.login(
                req.body.email,
                req.body.password,
                req.body.mfa_code
            );
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/refresh
     */
    async refreshToken(req: AuthRequest<Record<string, never>, Record<string, never>, RefreshTokenInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.refreshToken(req.body.refresh_token);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/logout
     */
    async logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const jti = req.user?.jti;
            const refresh_token = req.body.refresh_token;

            if (!jti) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid token'
                });
                return;
            }

            const result = await authService.logout(jti, refresh_token);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/mfa/setup
     */
    async setupMfa(req: AuthRequest<Record<string, never>, Record<string, never>, MfaSetupInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await authService.setupMfa(user_id, req.body.password);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/mfa/verify
     */
    async verifyMfa(req: AuthRequest<Record<string, never>, Record<string, never>, MfaVerifyInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await authService.verifyMfa(user_id, req.body.code);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/mfa/disable
     */
    async disableMfa(req: AuthRequest<Record<string, never>, Record<string, never>, MfaDisableInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await authService.disableMfa(
                user_id,
                req.body.password,
                req.body.code
            );
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/forgot-password
     */
    async forgotPassword(req: AuthRequest<Record<string, never>, Record<string, never>, ForgotPasswordInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.forgotPassword(req.body.email);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/reset-password
     */
    async resetPassword(req: AuthRequest<Record<string, never>, Record<string, never>, ResetPasswordInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.resetPassword(req.body.email, req.body.otp, req.body.password);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/invite/validate
     */
    async validateInvite(req: AuthRequest<Record<string, never>, Record<string, never>, ValidateInviteInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.validateInvite(req.body.token);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /auth/invite/complete
     */
    async completeInvite(req: AuthRequest<Record<string, never>, Record<string, never>, CompleteInviteInput>, res: Response, next: NextFunction) {
        try {
            const result = await authService.completeInvite(req.body.token, req.body.password);
            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}

export const authController = new AuthController();

