import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { patientService } from './patient.service';
import {
    UpdateProfileInput,
    UpdateCareStatusInput,
    CreateCareRequestInput,
    AssignAvatarInput,
    DoctorRequestInput,
    PatientInviteIdParamInput,
    GetDoctorSlotsInput
} from '../../validators/patient.validator';

export class PatientController {
    /**
     * GET /patient/doctors/:doctorId/slots
     */
    async getDoctorSlots(req: AuthRequest<any, any, any, GetDoctorSlotsInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const { doctorId } = req.params;
            const { start_date, end_date, timezone } = req.query;
            const result = await patientService.getDoctorSlots(doctorId, start_date, end_date, timezone || 'UTC');
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
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

    async updateCareStatus(req: AuthRequest<Record<string, never>, Record<string, never>, UpdateCareStatusInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await patientService.updateCareStatus(user_id, req.body);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    async createCareRequest(req: AuthRequest<Record<string, never>, Record<string, never>, CreateCareRequestInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            const result = await patientService.createCareRequest(user_id, req.body);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getCareRequests(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            const result = await patientService.getCareRequests(user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async requestCareClosure(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            const result = await patientService.requestCareClosure(user_id);
            res.json({ success: true, data: result });
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

