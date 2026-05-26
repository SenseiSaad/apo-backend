import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { assistantService } from './assistant.service';
import {
    AssistantBookingIdParamInput,
    AssistantCareRequestIdParamInput,
    AssistantCareRequestsQueryInput,
    AssistantPatientIdParamInput,
    AssignAssistantPatientDoctorInput,
    SendAssistantPatientMessageInput,
    UpdateAssistantCareRequestTriageInput,
    UpdateAssistantBookingStatusInput
} from '../../validators/assistant.validator';

export class AssistantController {
    async me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await assistantService.getMe(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getDoctors(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await assistantService.getDoctors(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getPatients(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await assistantService.getPatients(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getPatient(req: AuthRequest<AssistantPatientIdParamInput>, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await assistantService.getPatient(req.user!.user_id, req.params.patientId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async assignPatientToDoctor(
        req: AuthRequest<AssistantPatientIdParamInput, Record<string, never>, AssignAssistantPatientDoctorInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.assignPatientToDoctor(req.user!.user_id, req.params.patientId, req.body.doctor_id, req.body.force);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async assignCareRequestToDoctor(
        req: AuthRequest<AssistantCareRequestIdParamInput, Record<string, never>, AssignAssistantPatientDoctorInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.assignCareRequestToDoctor(req.user!.user_id, req.params.careRequestId, req.body.doctor_id, req.body.force);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getAssignableDoctors(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await assistantService.getAssignableDoctors(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getCareRequests(
        req: AuthRequest<Record<string, never>, Record<string, never>, Record<string, never>, AssistantCareRequestsQueryInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.getCareRequests(req.user!.user_id, req.query);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateCareRequestTriage(
        req: AuthRequest<AssistantCareRequestIdParamInput, Record<string, never>, UpdateAssistantCareRequestTriageInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.updateCareRequestTriage(req.user!.user_id, req.params.careRequestId, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async claimCareRequest(
        req: AuthRequest<AssistantCareRequestIdParamInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.claimCareRequest(req.user!.user_id, req.params.careRequestId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async releaseCareRequest(
        req: AuthRequest<AssistantCareRequestIdParamInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.releaseCareRequest(req.user!.user_id, req.params.careRequestId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const result = await assistantService.getBookings(req.user!.user_id);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async updateBookingStatus(
        req: AuthRequest<AssistantBookingIdParamInput, Record<string, never>, UpdateAssistantBookingStatusInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.updateBookingStatus(req.user!.user_id, req.params.bookingId);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async sendPatientMessage(
        req: AuthRequest<AssistantPatientIdParamInput, Record<string, never>, SendAssistantPatientMessageInput>,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const result = await assistantService.sendPatientMessage(req.user!.user_id, req.params.patientId, req.body.message);
            res.status(202).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}

export const assistantController = new AssistantController();
