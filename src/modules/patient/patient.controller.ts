import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { patientService } from './patient.service';
import {
    UpdateProfileInput,
    AssignAvatarInput,
    DoctorRequestInput,
    PatientInviteIdParamInput
} from '../../validators/patient.validator';

export class PatientController {
    /**
     * GET /patient/profile
     */
    async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.getProfile(user_id);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /patient/profile
     */
    async updateProfile(req: AuthRequest<Record<string, never>, Record<string, never>, UpdateProfileInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.updateProfile(user_id, req.body);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /patient/avatar/assign
     */
    async assignAvatar(req: AuthRequest<Record<string, never>, Record<string, never>, AssignAvatarInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.assignAvatar(user_id, req.body.gender);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /patient/home-data
     */
    async getHomeData(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.getHomeData(user_id);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /patient/token-usage
     */
    async getTokenUsage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.getTokenUsage(user_id);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /patient/subscription
     */
    async getSubscription(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.getSubscription(user_id);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /patient/doctor-request
     */
    async submitDoctorRequest(req: AuthRequest<Record<string, never>, Record<string, never>, DoctorRequestInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.submitDoctorRequest(user_id, req.body);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async getInvites(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            const result = await patientService.getInvites(user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async acceptInvite(req: AuthRequest<PatientInviteIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            const result = await patientService.acceptInvite(user_id, req.params.inviteId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async declineInvite(req: AuthRequest<PatientInviteIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            const result = await patientService.declineInvite(user_id, req.params.inviteId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}

export const patientController = new PatientController();

