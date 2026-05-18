import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { doctorService } from './doctor.service';
import {
    CreateDoctorAssistantInput,
    InvitePatientInput,
    DoctorAssistantIdParamInput,
    UpdateDoctorAssistantInput,
    UpdateDoctorAvailabilityInput,
    UpdateDoctorPersonalInfoInput,
    UpdateDoctorProfessionalInfoInput,
    UpdateDoctorSettingsInput
} from '../../validators/doctor.validator';

export class DoctorController {
    async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await doctorService.getProfile(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updatePersonalInfo(
        req: AuthRequest<Record<string, never>, Record<string, never>, UpdateDoctorPersonalInfoInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.updatePersonalInfo(req.user!.user_id, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateProfessionalInfo(
        req: AuthRequest<Record<string, never>, Record<string, never>, UpdateDoctorProfessionalInfoInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.updateProfessionalInfo(req.user!.user_id, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateAvailability(
        req: AuthRequest<Record<string, never>, Record<string, never>, UpdateDoctorAvailabilityInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.updateAvailability(req.user!.user_id, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateSettings(
        req: AuthRequest<Record<string, never>, Record<string, never>, UpdateDoctorSettingsInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.updateSettings(req.user!.user_id, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async invitePatient(
        req: AuthRequest<{}, {}, InvitePatientInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.invitePatient(req.user!.user_id, req.body);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getPatientInvites(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await doctorService.getPatientInvites(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getAssistants(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await doctorService.getAssistants(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async inviteAssistant(
        req: AuthRequest<Record<string, never>, Record<string, never>, CreateDoctorAssistantInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.inviteAssistant(req.user!.user_id, req.body);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getAssistantDetail(
        req: AuthRequest<DoctorAssistantIdParamInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.getAssistantDetail(req.user!.user_id, req.params.assistantId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateAssistant(
        req: AuthRequest<DoctorAssistantIdParamInput, Record<string, never>, UpdateDoctorAssistantInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await doctorService.updateAssistant(req.user!.user_id, req.params.assistantId, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}

export const doctorController = new DoctorController();

