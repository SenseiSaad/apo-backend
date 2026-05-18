import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { adminService } from './admin.service';
import { avatarSettingsService } from '../../services/avatarSettings.service';
import {
    AdminForgotPasswordInput,
    AdminResendSignupOtpInput,
    AdminResetPasswordInput,
    AdminSigninInput,
    AdminSignupInput,
    AdminVerifyOtpInput,
    CompleteAssistantSetupInput,
    assistantIdParamInput,
    AssistantSetupTokenInput,
    AssistantDoctorParamInput,
    CreateAssistantAccountInput,
    CreateDoctorAccountInput,
    GetActiveAssistantsQueryInput,
    GetActiveDoctorsQueryInput,
    SetAssistantDoctorsInput,
    doctorIdParamInput,
    UpdateDoctorAccountInput,
    UpdateAssistantInput,
    UpdateDoctorCredentialsInput
} from '../../validators/admin.validator';
import { UpdateAvatarSettingsInput } from '../../validators/avatarSettings.validator';

export class AdminController {
    async signup(req: AuthRequest<Record<string, never>, Record<string, never>, AdminSignupInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.signup(req.body);

            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async resendSignupOtp(req: AuthRequest<Record<string, never>, Record<string, never>, AdminResendSignupOtpInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.resendSignupOtp(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async signin(req: AuthRequest<Record<string, never>, Record<string, never>, AdminSigninInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.signin(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async checkSigninOtpRequirement(req: AuthRequest<Record<string, never>, Record<string, never>, AdminSigninInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.checkSigninOtpRequirement(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async resendSigninOtp(req: AuthRequest<Record<string, never>, Record<string, never>, AdminSigninInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.resendSigninOtp(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async verifySignupOtp(req: AuthRequest<Record<string, never>, Record<string, never>, AdminVerifyOtpInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.verifySignupOtp(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async verifySigninOtp(req: AuthRequest<Record<string, never>, Record<string, never>, AdminVerifyOtpInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.verifySigninOtp(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async forgotPassword(req: AuthRequest<Record<string, never>, Record<string, never>, AdminForgotPasswordInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.forgotPassword(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async resetPassword(req: AuthRequest<Record<string, never>, Record<string, never>, AdminResetPasswordInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.resetPassword(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async validateAssistantSetup(req: AuthRequest<Record<string, never>, Record<string, never>, AssistantSetupTokenInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.validateAssistantSetupToken(req.body.token);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async resendAssistantSetupOtp(req: AuthRequest<Record<string, never>, Record<string, never>, AssistantSetupTokenInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.resendAssistantSetupOtp(req.body.token);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async completeAssistantSetup(req: AuthRequest<Record<string, never>, Record<string, never>, CompleteAssistantSetupInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.completeAssistantSetup(req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async getDashboardSummary(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.getDashboardSummary();

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async createDoctorAccount(req: AuthRequest<Record<string, never>, Record<string, never>, CreateDoctorAccountInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const adminUserId = req.user?.user_id;
            if (!adminUserId) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await adminService.createDoctorAccount(req.body, adminUserId);

            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async getActiveDoctors(req: AuthRequest<Record<string, never>, Record<string, never>, Record<string, never>, GetActiveDoctorsQueryInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.getActiveDoctors(req.query);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async getDoctorDetails(req: AuthRequest<doctorIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.getDoctorDetails(req.params.doctorId);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async updateDoctorCredentials(
        req: AuthRequest<doctorIdParamInput, Record<string, never>, UpdateDoctorCredentialsInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await adminService.updateDoctorCredentials(req.params.doctorId, req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async updateDoctorAccount(
        req: AuthRequest<doctorIdParamInput, Record<string, never>, UpdateDoctorAccountInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await adminService.updateDoctorAccount(req.params.doctorId, req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async resendDoctorSetupInvite(req: AuthRequest<doctorIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.resendDoctorSetupInvite(req.params.doctorId);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async createAssistantAccount(req: AuthRequest<Record<string, never>, Record<string, never>, CreateAssistantAccountInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.createAssistantAccount(req.body);

            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async getActiveAssistants(req: AuthRequest<Record<string, never>, Record<string, never>, Record<string, never>, GetActiveAssistantsQueryInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.getActiveAssistants(req.query);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async getAssistantDetails(req: AuthRequest<assistantIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.getAssistantDetails(req.params.assistantId);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async updateAssistant(
        req: AuthRequest<assistantIdParamInput, Record<string, never>, UpdateAssistantInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await adminService.updateAssistant(req.params.assistantId, req.body);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async setAssistantDoctors(
        req: AuthRequest<assistantIdParamInput, Record<string, never>, SetAssistantDoctorsInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await adminService.setAssistantDoctors(req.params.assistantId, req.body.doctor_ids);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async assignAssistantToDoctor(req: AuthRequest<AssistantDoctorParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.assignAssistantToDoctor(req.params.assistantId, req.params.doctorId);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async unassignAssistantFromDoctor(req: AuthRequest<AssistantDoctorParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await adminService.unassignAssistantFromDoctor(req.params.assistantId, req.params.doctorId);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async me(req: AuthRequest, res: Response): Promise<void> {
        res.json({
            success: true,
            data: {
                user: req.user
            }
        });
    }

    async getAvatarSettings(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await avatarSettingsService.getSettings();
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateAvatarSettings(
        req: AuthRequest<Record<string, never>, Record<string, never>, UpdateAvatarSettingsInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await avatarSettingsService.updateSettings(req.body.avatarLimits);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}

export const adminController = new AdminController();

