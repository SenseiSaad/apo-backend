import mongoose from 'mongoose';
import { Assistant } from '../models/Assistant.model';
import { CareRequest, CareRequestStatus } from '../models/CareRequest.model';
import { Patient } from '../models/Patient.model';
import { Doctor as DoctorModel } from '../models/Doctor.model';
import { User } from '../models/User.model';
import { Role, UserStatus } from '../models/enums';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';

const openRequestStatuses: CareRequestStatus[] = [
    'new_request',
    'triage_in_progress',
    'pending_assignment',
    'assigned',
    'in_treatment',
    'follow_up_needed',
    'patient_requested_closure'
];

const closedRequestStatuses: CareRequestStatus[] = [
    'completed',
    'closed_by_patient',
    'cancelled',
    'referred_out',
    'not_appropriate_for_platform'
];

export class CareRequestService {
    async createForPatient(userId: string, data: {
        reason: string;
        urgency?: 'low' | 'normal' | 'high';
        preferred_specialty?: string;
        preferred_doctor_gender?: 'male' | 'female' | 'any';
        availability?: string;
        patient_notes?: string;
        source?: 'signup' | 'patient' | 'admin' | 'assistant' | 'doctor';
    }) {
        const patient = await Patient.findOne({ user_id: userId });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const activeRequest = await CareRequest.findOne({
            patient_id: patient._id,
            status: { $in: openRequestStatuses }
        }).sort({ created_at: -1 });

        if (activeRequest) {
            activeRequest.reason = data.reason;
            activeRequest.urgency = data.urgency || activeRequest.urgency;
            activeRequest.preferred_specialty = data.preferred_specialty ?? activeRequest.preferred_specialty;
            activeRequest.preferred_doctor_gender = data.preferred_doctor_gender ?? activeRequest.preferred_doctor_gender;
            activeRequest.availability = data.availability ?? activeRequest.availability;
            activeRequest.patient_notes = data.patient_notes ?? activeRequest.patient_notes;
            if (activeRequest.status === 'patient_requested_closure') {
                activeRequest.status = patient.doctor_id ? 'assigned' : 'new_request';
                activeRequest.requested_closure_at = undefined;
            }
            await activeRequest.save();

            await this.markPatientNeedsCare(patient, data.reason);
            return {
                message: 'Existing open care request updated',
                care_request: await this.getFormattedRequest(activeRequest._id.toString())
            };
        }

        const request = await CareRequest.create({
            patient_id: patient._id,
            doctor_id: patient.doctor_id,
            reason: data.reason,
            urgency: data.urgency || 'normal',
            preferred_specialty: data.preferred_specialty,
            preferred_doctor_gender: data.preferred_doctor_gender,
            availability: data.availability,
            patient_notes: data.patient_notes,
            status: patient.doctor_id ? 'assigned' : 'new_request',
            source: data.source || 'patient',
            assigned_at: patient.doctor_id ? patient.doctor_assigned_at || new Date() : undefined
        });

        await this.markPatientNeedsCare(patient, data.reason);

        return {
            message: 'Care request created',
            care_request: await this.getFormattedRequest(request._id.toString())
        };
    }

    async requestClosure(userId: string) {
        const patient = await Patient.findOne({ user_id: userId });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const request = await CareRequest.findOne({
            patient_id: patient._id,
            status: { $in: openRequestStatuses }
        }).sort({ created_at: -1 });

        if (!request) {
            patient.care_status = 'treated';
            patient.care_status_updated_at = new Date();
            await patient.save();
            return { message: 'Patient marked as no longer needing treatment' };
        }

        request.status = patient.doctor_id ? 'patient_requested_closure' : 'closed_by_patient';
        request.requested_closure_at = new Date();
        if (!patient.doctor_id) {
            request.closed_at = new Date();
            request.closed_by = patient.user_id;
        }
        await request.save();

        patient.care_status = patient.doctor_id ? 'assigned' : 'treated';
        patient.care_status_updated_at = new Date();
        await patient.save();

        return {
            message: patient.doctor_id
                ? 'Closure request sent to the assigned Doctor'
                : 'Care request closed',
            care_request: await this.getFormattedRequest(request._id.toString())
        };
    }

    async listRequests(query: {
        page: number;
        limit: number;
        search?: string;
        status?: CareRequestStatus | 'open' | 'closed';
        doctor_id?: string;
        patient_id?: string;
    }, allowedDoctorIds?: string[]) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;
        const match: Record<string, any> = {};

        if (query.status === 'open' || !query.status) {
            match.status = { $in: openRequestStatuses };
        } else if (query.status === 'closed') {
            match.status = { $in: closedRequestStatuses };
        } else {
            match.status = query.status;
        }

        if (query.doctor_id) {
            match.doctor_id = new mongoose.Types.ObjectId(query.doctor_id);
        }
        if (query.patient_id) {
            match.patient_id = new mongoose.Types.ObjectId(query.patient_id);
        }
        if (allowedDoctorIds) {
            match.$or = [
                { doctor_id: { $in: allowedDoctorIds.map(id => new mongoose.Types.ObjectId(id)) } },
                { doctor_id: { $exists: false } },
                { doctor_id: null }
            ];
        }

        const patientUserMatch: Record<string, any> = {};
        if (query.search) {
            const regex = new RegExp(this.escapeRegex(query.search), 'i');
            patientUserMatch.$or = [
                { reason: regex },
                { patient_notes: regex },
                { triage_notes: regex },
                { 'patient.full_name': regex },
                { 'user.email': regex }
            ];
        }

        const [result] = await CareRequest.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient_id',
                    foreignField: '_id',
                    as: 'patient'
                }
            },
            { $unwind: '$patient' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'patient.user_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            { $match: patientUserMatch },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'doctor_id',
                    foreignField: '_id',
                    as: 'doctor'
                }
            },
            { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'doctor.user_id',
                    foreignField: '_id',
                    as: 'doctor_user'
                }
            },
            { $unwind: { path: '$doctor_user', preserveNullAndEmptyArrays: true } },
            { $sort: { created_at: -1 } },
            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: limit }],
                    total: [{ $count: 'count' }]
                }
            }
        ]);

        const total = result?.total?.[0]?.count || 0;

        return {
            care_requests: (result?.data || []).map((request: any) => this.formatRequest(request)),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
                has_next: page * limit < total,
                has_prev: page > 1
            }
        };
    }

    async getStats() {
        const [
            totalPatients,
            needsCare,
            assigned,
            inTreatment,
            treated,
            unassignedOpenRequests,
            openRequests,
            closureRequests
        ] = await Promise.all([
            Patient.countDocuments(),
            Patient.countDocuments({ care_status: 'needs_care' }),
            Patient.countDocuments({ care_status: 'assigned' }),
            Patient.countDocuments({ care_status: 'in_treatment' }),
            Patient.countDocuments({ care_status: 'treated' }),
            CareRequest.countDocuments({
                status: { $in: ['new_request', 'triage_in_progress', 'pending_assignment'] },
                $or: [{ doctor_id: { $exists: false } }, { doctor_id: null }]
            }),
            CareRequest.countDocuments({ status: { $in: openRequestStatuses } }),
            CareRequest.countDocuments({ status: 'patient_requested_closure' })
        ]);

        return {
            total_patients: totalPatients,
            needs_care: needsCare,
            assigned,
            in_treatment: inTreatment,
            treated,
            unassigned_open_requests: unassignedOpenRequests,
            open_requests: openRequests,
            closure_requests: closureRequests
        };
    }

    async listPatients(query: {
        page: number;
        limit: number;
        search?: string;
        care_status?: string;
        assigned?: boolean;
    }) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;
        const patientMatch: Record<string, any> = {};

        if (query.care_status && query.care_status !== 'all') {
            patientMatch.care_status = query.care_status;
        }
        if (query.assigned === true) {
            patientMatch.doctor_id = { $exists: true, $ne: null };
        } else if (query.assigned === false) {
            patientMatch.$or = [{ doctor_id: { $exists: false } }, { doctor_id: null }];
        }

        const userMatch: Record<string, any> = {};
        if (query.search) {
            const regex = new RegExp(this.escapeRegex(query.search), 'i');
            userMatch.$or = [
                { full_name: regex },
                { illness_description: regex },
                { 'user.email': regex }
            ];
        }

        const [result] = await Patient.aggregate([
            { $match: patientMatch },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            { $match: userMatch },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'doctor_id',
                    foreignField: '_id',
                    as: 'doctor'
                }
            },
            { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'doctor.user_id',
                    foreignField: '_id',
                    as: 'doctor_user'
                }
            },
            { $unwind: { path: '$doctor_user', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'care_requests',
                    let: { patientId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$patient_id', '$$patientId'] } } },
                        { $sort: { created_at: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'latest_request'
                }
            },
            { $unwind: { path: '$latest_request', preserveNullAndEmptyArrays: true } },
            { $sort: { updated_at: -1, created_at: -1 } },
            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: limit }],
                    total: [{ $count: 'count' }]
                }
            }
        ]);

        const total = result?.total?.[0]?.count || 0;

        return {
            patients: (result?.data || []).map((patient: any) => ({
                patient_id: patient._id.toString(),
                user_id: patient.user?._id?.toString(),
                email: patient.user?.email,
                name: patient.full_name || this.formatNameFromEmail(patient.user?.email || ''),
                account_status: patient.user?.status,
                tier: patient.user?.tier,
                doctor_id: patient.doctor?._id?.toString() || null,
                doctor_name: patient.doctor?.personal_info?.full_name || this.formatNameFromEmail(patient.doctor_user?.email || ''),
                doctor_email: patient.doctor_user?.email,
                care_status: patient.care_status,
                illness_description: patient.illness_description,
                care_status_updated_at: patient.care_status_updated_at,
                doctor_assigned_at: patient.doctor_assigned_at,
                treatment_count: 0,
                latest_request: patient.latest_request ? {
                    care_request_id: patient.latest_request._id.toString(),
                    status: patient.latest_request.status,
                    urgency: patient.latest_request.urgency,
                    reason: patient.latest_request.reason,
                    created_at: patient.latest_request.created_at
                } : null,
                created_at: patient.created_at,
                updated_at: patient.updated_at
            })),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
                has_next: page * limit < total,
                has_prev: page > 1
            }
        };
    }

    async updateTriage(requestId: string, actorUserId: string, data: {
        status?: 'triage_in_progress' | 'pending_assignment' | 'cancelled';
        triage_notes?: string;
    }) {
        const request = await CareRequest.findById(requestId);
        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        if (data.status) {
            request.status = data.status;
        }
        if (data.triage_notes !== undefined) {
            request.triage_notes = data.triage_notes;
        }
        if (data.status === 'cancelled') {
            request.closed_at = new Date();
            request.closed_by = new mongoose.Types.ObjectId(actorUserId);
        }
        await request.save();

        return {
            message: 'Care request updated',
            care_request: await this.getFormattedRequest(requestId)
        };
    }

    async completeByDoctor(doctorUserId: string, patientId: string, data: {
        outcome: 'completed' | 'follow_up_needed' | 'referred_out' | 'not_appropriate_for_platform';
        doctor_notes?: string;
    }) {
        const doctor = await DoctorModel.findOne({ user_id: doctorUserId });
        if (!doctor) {
            throw new NotFoundError('Doctor profile not found');
        }

        const patient = await Patient.findOne({ _id: patientId, doctor_id: doctor._id });
        if (!patient) {
            throw new NotFoundError('Patient not found for this Doctor');
        }

        const request = await CareRequest.findOne({
            patient_id: patient._id,
            doctor_id: doctor._id,
            status: { $in: openRequestStatuses }
        }).sort({ created_at: -1 });

        if (!request) {
            throw new NotFoundError('Open care request not found for this patient');
        }

        request.status = data.outcome;
        request.outcome = data.outcome;
        request.doctor_notes = data.doctor_notes;
        request.closed_at = new Date();
        request.closed_by = new mongoose.Types.ObjectId(doctorUserId);
        await request.save();

        if (data.outcome === 'follow_up_needed') {
            patient.care_status = 'in_treatment';
        } else {
            patient.care_status = 'treated';
            patient.doctor_id = undefined;
            patient.doctor_assigned_at = undefined;
        }
        patient.care_status_updated_at = new Date();
        await patient.save();

        return {
            message: 'Treatment outcome saved',
            care_request: await this.getFormattedRequest(request._id.toString())
        };
    }

    async assertAssistantCanTriage(userId: string) {
        const user = await User.findById(userId).select('role status');
        if (!user || user.role !== Role.ASSISTANT || user.status !== UserStatus.ACTIVE) {
            throw new ForbiddenError('Assistant account is not active');
        }

        const assistant = await Assistant.findOne({ user_id: user._id });
        if (!assistant?.permissions?.can_assign_patients) {
            throw new ForbiddenError('Assistant does not have patient assignment permission');
        }

        return assistant.assigned_doctor_ids.map(id => id.toString());
    }

    async syncAssignment(patientId: string, doctorId: string, actorUserId: string) {
        const request = await CareRequest.findOne({
            patient_id: patientId,
            status: { $in: openRequestStatuses }
        }).sort({ created_at: -1 });

        if (!request) {
            return;
        }

        request.doctor_id = new mongoose.Types.ObjectId(doctorId);
        request.assigned_by = new mongoose.Types.ObjectId(actorUserId);
        request.assigned_at = new Date();
        request.status = 'assigned';
        await request.save();
    }

    private async markPatientNeedsCare(patient: any, reason: string) {
        patient.illness_description = reason;
        patient.care_status = patient.doctor_id ? 'assigned' : 'needs_care';
        patient.care_status_updated_at = new Date();
        await patient.save();
    }

    private async getFormattedRequest(requestId: string) {
        const request = await CareRequest.findById(requestId)
            .populate({
                path: 'patient_id',
                populate: { path: 'user_id', select: 'email role status tier' }
            })
            .populate({
                path: 'doctor_id',
                populate: { path: 'user_id', select: 'email status' }
            });

        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        return this.formatRequest(request);
    }

    private formatRequest(request: any) {
        const patient = request.patient_id || request.patient;
        const user = patient?.user_id || request.user;
        const doctor = request.doctor_id || request.doctor;
        const doctorUser = doctor?.user_id || request.doctor_user;

        return {
            care_request_id: request._id.toString(),
            patient_id: patient?._id?.toString() || request.patient_id?.toString(),
            patient_name: patient?.full_name || this.formatNameFromEmail(user?.email || ''),
            patient_email: user?.email,
            doctor_id: doctor?._id?.toString() || request.doctor_id?.toString() || null,
            doctor_name: doctor?.personal_info?.full_name || this.formatNameFromEmail(doctorUser?.email || ''),
            doctor_email: doctorUser?.email,
            reason: request.reason,
            urgency: request.urgency,
            preferred_specialty: request.preferred_specialty,
            preferred_doctor_gender: request.preferred_doctor_gender,
            availability: request.availability,
            patient_notes: request.patient_notes,
            triage_notes: request.triage_notes,
            doctor_notes: request.doctor_notes,
            status: request.status,
            source: request.source,
            assigned_at: request.assigned_at,
            requested_closure_at: request.requested_closure_at,
            closed_at: request.closed_at,
            outcome: request.outcome,
            created_at: request.created_at,
            updated_at: request.updated_at
        };
    }

    private formatNameFromEmail(email: string) {
        return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) || 'User';
    }

    private escapeRegex(value: string) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

export const careRequestService = new CareRequestService();
