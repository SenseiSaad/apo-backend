import mongoose from 'mongoose';
import { Assistant } from '../models/Assistant.model';
import { CareRequest, CareRequestStatus } from '../models/CareRequest.model';
import { Patient } from '../models/Patient.model';
import { Doctor as DoctorModel } from '../models/Doctor.model';
import { SessionBooking } from '../models/SessionBooking.model';
import { TriageConversation } from '../models/TriageChat.model';
import { User } from '../models/User.model';
import { Role, SessionStatus, UserStatus, NotificationType } from '../models/enums';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { notificationService } from './notification.service';

const openRequestStatuses: CareRequestStatus[] = [
    'new_request',
    'triage_claimed',
    'triage_in_progress',
    'pending_assignment',
    'assigned',
    'in_treatment',
    'follow_up_needed',
    'patient_requested_closure'
];

const assistantOwnedStatuses: CareRequestStatus[] = ['triage_claimed', 'triage_in_progress', 'pending_assignment'];
const ASSISTANT_CLAIM_MINUTES = 120;

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
            this.notifyCareRequest(patient, 'updated').catch(err => console.error(err));
            
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
        this.notifyCareRequest(patient, 'created').catch(err => console.error(err));

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

        const hasAssignedDoctor = Boolean(request.doctor_id || patient.doctor_id);
        request.status = 'closed_by_patient';
        request.requested_closure_at = new Date();
        request.closed_at = new Date();
        request.closed_by = patient.user_id;
        request.claimed_by = undefined;
        request.claimed_assistant_id = undefined;
        request.claimed_at = undefined;
        request.claim_expires_at = undefined;
        await request.save();

        patient.care_status = hasAssignedDoctor ? 'assigned' : 'treated';
        patient.care_status_updated_at = new Date();
        await patient.save();

        this.notifyCareRequest(patient, 'closed').catch(err => console.error(err));

        const { triageChatService } = await import('../modules/triageChat/triageChat.service');
        await triageChatService.closeConversationForCareRequest(
            request._id.toString(),
            userId,
            'Patient marked that care is no longer needed. Triage chat closed.'
        );
        const { videoSessionService } = await import('../modules/videoSession/videoSession.service');
        await videoSessionService.cancelOpenSessionsForCareRequest(
            request._id.toString(),
            userId,
            'Patient marked that care is no longer needed. Video session cancelled.'
        );

        return {
            message: hasAssignedDoctor
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
        queue?: 'unclaimed' | 'mine' | 'pending_assignment' | 'all';
        doctor_id?: string;
        patient_id?: string;
    }, allowedDoctorIds?: string[], actorUserId?: string) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;
        const match: Record<string, any> = {};
        const now = new Date();

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

        if (query.queue && query.queue !== 'all') {
            if (!actorUserId) {
                throw new BadRequestError('Queue filtering requires an authenticated staff user');
            }

            const actorObjectId = new mongoose.Types.ObjectId(actorUserId);
            if (query.queue === 'mine') {
                match.claimed_by = actorObjectId;
                match.status = { $in: assistantOwnedStatuses };
            } else if (query.queue === 'pending_assignment') {
                match.claimed_by = actorObjectId;
                match.status = 'pending_assignment';
            } else if (query.queue === 'unclaimed') {
                match.status = { $in: ['new_request', 'triage_claimed', 'triage_in_progress', 'pending_assignment'] };
                match.$and = [
                    ...(match.$and || []),
                    {
                        $or: [
                            { claimed_by: { $exists: false } },
                            { claimed_by: null },
                            { claim_expires_at: { $lte: now } }
                        ]
                    }
                ];
            }
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
            {
                $lookup: {
                    from: 'users',
                    localField: 'claimed_by',
                    foreignField: '_id',
                    as: 'claimed_by_user'
                }
            },
            { $unwind: { path: '$claimed_by_user', preserveNullAndEmptyArrays: true } },
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
            care_requests: (result?.data || []).map((request: any) => ({
                ...this.formatRequest(request),
                is_claimed_by_me: Boolean(actorUserId && request.claimed_by?.toString() === actorUserId && !this.isClaimExpired(request))
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
                status: { $in: ['new_request', 'triage_claimed', 'triage_in_progress', 'pending_assignment'] },
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

    async getPatientCaseDetails(patientId: string) {
        const patient = await Patient.findById(patientId)
            .populate('user_id', 'email role status tier email_verified created_at updated_at')
            .populate({
                path: 'doctor_id',
                select: 'user_id specialty credential_status personal_info max_patients',
                populate: { path: 'user_id', select: 'email status' }
            })
            .populate('doctor_assigned_by', 'email role')
            .lean();

        if (!patient) {
            throw new NotFoundError('Patient not found');
        }

        const requests = await CareRequest.find({ patient_id: patient._id })
            .sort({ created_at: -1 })
            .populate({
                path: 'patient_id',
                populate: { path: 'user_id', select: 'email role status tier' }
            })
            .populate({
                path: 'doctor_id',
                populate: { path: 'user_id', select: 'email status' }
            })
            .populate('claimed_by', 'email role status')
            .populate({
                path: 'claimed_assistant_id',
                select: 'user_id permissions assigned_doctor_ids',
                populate: { path: 'user_id', select: 'email status' }
            })
            .populate('assigned_by', 'email role')
            .populate('closed_by', 'email role')
            .lean();

        const requestIds = requests.map((request: any) => request._id);
        const conversations = await TriageConversation.find({ care_request_id: { $in: requestIds } })
            .populate('assistant_user_id', 'email status role')
            .populate('doctor_user_id', 'email status role')
            .lean();
        const conversationByRequestId = new Map(conversations.map((conversation: any) => [conversation.care_request_id.toString(), conversation]));

        const closedCount = requests.filter(request => closedRequestStatuses.includes(request.status)).length;
        const openCount = requests.filter(request => openRequestStatuses.includes(request.status)).length;
        const user = patient.user_id as any;
        const doctor = patient.doctor_id as any;
        const doctorUser = doctor?.user_id;
        const assignedBy = patient.doctor_assigned_by as any;

        return {
            patient: {
                patient_id: patient._id.toString(),
                user_id: user?._id?.toString(),
                name: patient.full_name || this.formatNameFromEmail(user?.email || ''),
                email: user?.email,
                account_status: user?.status,
                tier: user?.tier,
                email_verified: user?.email_verified,
                care_status: patient.care_status,
                illness_description: patient.illness_description,
                care_status_updated_at: patient.care_status_updated_at,
                onboarding_source: patient.onboarding_source,
                date_of_birth: patient.date_of_birth,
                phone_number: patient.phone_number,
                timezone: patient.timezone,
                preferences: patient.preferences,
                avatar_state: patient.avatar_state,
                activity_score: patient.activity_score,
                current_streak: patient.current_streak,
                last_active: patient.last_active,
                doctor: doctor ? {
                    doctor_id: doctor._id.toString(),
                    user_id: doctorUser?._id?.toString(),
                    name: doctor.personal_info?.full_name || this.formatNameFromEmail(doctorUser?.email || ''),
                    email: doctorUser?.email,
                    status: doctorUser?.status,
                    specialty: doctor.specialty,
                    credential_status: doctor.credential_status,
                    max_patients: doctor.max_patients,
                    assigned_at: patient.doctor_assigned_at,
                    assigned_by_email: assignedBy?.email,
                    assignment_source: patient.doctor_assignment_source
                } : null,
                created_at: patient.created_at,
                updated_at: patient.updated_at
            },
            summary: {
                total_cases: requests.length,
                open_cases: openCount,
                closed_cases: closedCount,
                latest_case_id: requests[0]?._id?.toString() || null
            },
            cases: requests.map((request: any) => {
                const conversation = conversationByRequestId.get(request._id.toString()) as any;
                const claimedAssistant = request.claimed_assistant_id as any;
                const assistantUser = claimedAssistant?.user_id;
                const assignedByUser = request.assigned_by as any;
                const closedByUser = request.closed_by as any;

                return {
                    ...this.formatRequest(request),
                    assistant: conversation?.assistant_user_id || assistantUser || request.claimed_by ? {
                        assistant_id: claimedAssistant?._id?.toString() || conversation?.assistant_id?.toString() || null,
                        user_id: conversation?.assistant_user_id?._id?.toString() || assistantUser?._id?.toString() || request.claimed_by?._id?.toString() || null,
                        email: conversation?.assistant_user_id?.email || assistantUser?.email || request.claimed_by?.email || null,
                        status: conversation?.assistant_user_id?.status || assistantUser?.status || request.claimed_by?.status || null,
                        claimed_at: request.claimed_at,
                        claim_expires_at: request.claim_expires_at
                    } : null,
                    assigned_by_email: assignedByUser?.email || null,
                    closed_by_email: closedByUser?.email || null,
                    conversation: conversation ? {
                        conversation_id: conversation._id.toString(),
                        status: conversation.status,
                        assistant_user_id: conversation.assistant_user_id?._id?.toString() || conversation.assistant_user_id?.toString() || null,
                        assistant_email: conversation.assistant_user_id?.email || null,
                        doctor_user_id: conversation.doctor_user_id?._id?.toString() || conversation.doctor_user_id?.toString() || null,
                        doctor_email: conversation.doctor_user_id?.email || null,
                        doctor_handoff_notes: conversation.doctor_handoff_notes || '',
                        doctor_handoff: conversation.doctor_handoff || {},
                        patient_unread_count: conversation.patient_unread_count,
                        assistant_unread_count: conversation.assistant_unread_count,
                        admin_unread_count: conversation.admin_unread_count,
                        last_message_at: conversation.last_message_at,
                        closed_at: conversation.closed_at,
                        created_at: conversation.created_at,
                        updated_at: conversation.updated_at
                    } : null
                };
            })
        };
    }

    async claimForAssistant(requestId: string, assistantUserId: string) {
        const allowedDoctorIds = await this.assertAssistantCanTriage(assistantUserId);
        const assistant = await Assistant.findOne({ user_id: assistantUserId });
        if (!assistant) {
            throw new NotFoundError('Assistant profile not found');
        }

        const requestObjectId = new mongoose.Types.ObjectId(requestId);
        const assistantUserObjectId = new mongoose.Types.ObjectId(assistantUserId);
        const allowedDoctorObjectIds = allowedDoctorIds.map(id => new mongoose.Types.ObjectId(id));
        const now = new Date();
        const claimExpiresAt = this.getClaimExpiry();

        const existingRequest = await CareRequest.findById(requestObjectId).populate('claimed_by', 'email');
        if (!existingRequest) {
            throw new NotFoundError('Care request not found');
        }

        this.assertRequestInAssistantScope(existingRequest, allowedDoctorIds);
        this.assertRequestIsOpen(existingRequest.status);

        const claimedRequest = await CareRequest.findOneAndUpdate(
            {
                _id: requestObjectId,
                status: { $in: openRequestStatuses },
                $and: [
                    {
                        $or: [
                            { doctor_id: { $in: allowedDoctorObjectIds } },
                            { doctor_id: { $exists: false } },
                            { doctor_id: null }
                        ]
                    },
                    {
                        $or: [
                            { claimed_by: { $exists: false } },
                            { claimed_by: null },
                            { claimed_by: assistantUserObjectId },
                            { claim_expires_at: { $lte: now } }
                        ]
                    }
                ]
            },
            [
                {
                    $set: {
                        claimed_by: assistantUserObjectId,
                        claimed_assistant_id: assistant._id,
                        claimed_at: now,
                        claim_expires_at: claimExpiresAt,
                        status: {
                            $cond: [{ $eq: ['$status', 'new_request'] }, 'triage_claimed', '$status']
                        }
                    }
                }
            ],
            { new: true }
        );

        if (!claimedRequest) {
            const currentRequest = await CareRequest.findById(requestObjectId).populate('claimed_by', 'email');
            if (currentRequest?.claimed_by && !this.isClaimExpired(currentRequest)) {
                const owner = currentRequest.claimed_by as any;
                throw new ConflictError(`This request is already claimed by ${owner.email || 'another assistant'}`);
            }
            throw new ConflictError('This request changed while you were claiming it. Refresh the queue and try again.');
        }

        return {
            message: 'Care request claimed',
            care_request: await this.getFormattedRequest(requestId)
        };
    }

    async releaseAssistantClaim(requestId: string, assistantUserId: string) {
        const allowedDoctorIds = await this.assertAssistantCanTriage(assistantUserId);
        const request = await CareRequest.findById(requestId);
        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        this.assertRequestInAssistantScope(request, allowedDoctorIds);
        if (!request.claimed_by || request.claimed_by.toString() !== assistantUserId) {
            throw new ForbiddenError('Only the assistant who claimed this request can release it');
        }

        request.claimed_by = undefined;
        request.claimed_assistant_id = undefined;
        request.claimed_at = undefined;
        request.claim_expires_at = undefined;
        if (assistantOwnedStatuses.includes(request.status)) {
            request.status = 'new_request';
        }
        await request.save();

        return {
            message: 'Care request returned to the unclaimed queue',
            care_request: await this.getFormattedRequest(requestId)
        };
    }

    async listAssignableDoctorsForAssistant(assistantUserId: string) {
        const allowedDoctorIds = await this.assertAssistantCanTriage(assistantUserId);
        const doctorObjectIds = allowedDoctorIds.map(id => new mongoose.Types.ObjectId(id));
        const next14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const doctors = await DoctorModel.find({ _id: { $in: doctorObjectIds } })
            .populate('user_id', 'email status role')
            .sort({ 'personal_info.full_name': 1, created_at: -1 });

        const [activePatientCounts, availableSlotCounts] = await Promise.all([
            Patient.aggregate([
                { $match: { doctor_id: { $in: doctorObjectIds }, care_status: { $in: ['needs_care', 'assigned', 'in_treatment'] } } },
                { $group: { _id: '$doctor_id', count: { $sum: 1 } } }
            ]),
            SessionBooking.aggregate([
                {
                    $match: {
                        doctor_id: { $in: doctorObjectIds },
                        status: SessionStatus.AVAILABLE,
                        scheduled_at: { $gte: new Date(), $lte: next14Days }
                    }
                },
                { $group: { _id: '$doctor_id', count: { $sum: 1 } } }
            ])
        ]);

        const patientCountByDoctor = new Map(activePatientCounts.map((row: any) => [row._id.toString(), row.count]));
        const slotCountByDoctor = new Map(availableSlotCounts.map((row: any) => [row._id.toString(), row.count]));

        return {
            Doctors: doctors.map((doctor: any) => {
                const doctorId = doctor._id.toString();
                const activePatientCount = patientCountByDoctor.get(doctorId) || 0;
                const availableSlotsNext14Days = slotCountByDoctor.get(doctorId) || 0;
                const user = doctor.user_id;
                const disabledReason = this.getDoctorAssignmentBlockReason(doctor, user, activePatientCount);

                return {
                    doctor_id: doctorId,
                    email: user?.email,
                    status: user?.status,
                    specialty: doctor.specialty,
                    name: doctor.personal_info?.full_name || this.formatNameFromEmail(user?.email || ''),
                    credential_status: doctor.credential_status,
                    max_patients: doctor.max_patients,
                    active_patient_count: activePatientCount,
                    available_slots_next_14_days: availableSlotsNext14Days,
                    is_available_for_assignment: !disabledReason,
                    disabled_reason: disabledReason
                };
            })
        };
    }

    async assertAssistantCanAssignClaimedRequest(requestId: string, assistantUserId: string) {
        const allowedDoctorIds = await this.assertAssistantCanTriage(assistantUserId);
        const request = await CareRequest.findById(requestId);
        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        this.assertRequestInAssistantScope(request, allowedDoctorIds);
        this.assertRequestIsOpen(request.status);
        this.assertClaimOwnedBy(request, assistantUserId);

        return {
            patient_id: request.patient_id.toString(),
            allowed_doctor_ids: allowedDoctorIds
        };
    }

    async updateTriage(requestId: string, actorUserId: string, data: {
        status?: 'triage_in_progress' | 'pending_assignment' | 'cancelled' | 'completed' | 'closed_by_patient' | 'referred_out' | 'not_appropriate_for_platform';
        triage_notes?: string;
    }, options?: {
        requireClaimBy?: string;
    }) {
        const request = await CareRequest.findById(requestId);
        if (!request) {
            throw new NotFoundError('Care request not found');
        }

        this.assertRequestIsOpen(request.status);
        if (options?.requireClaimBy) {
            this.assertClaimOwnedBy(request, options.requireClaimBy);
        }

        if (data.status) {
            request.status = data.status;
        }
        if (data.triage_notes !== undefined) {
            request.triage_notes = data.triage_notes;
        }
        if (data.status && closedRequestStatuses.includes(data.status)) {
            request.closed_at = new Date();
            request.closed_by = new mongoose.Types.ObjectId(actorUserId);
            if (['completed', 'referred_out', 'not_appropriate_for_platform'].includes(data.status)) {
                request.outcome = data.status as any;
            }
            request.claimed_by = undefined;
            request.claimed_assistant_id = undefined;
            request.claimed_at = undefined;
            request.claim_expires_at = undefined;
        }
        await request.save();

        if (data.status && closedRequestStatuses.includes(data.status)) {
            const { triageChatService } = await import('../modules/triageChat/triageChat.service');
            await triageChatService.closeConversationForCareRequest(request._id.toString(), actorUserId, `Care request marked ${data.status}. Triage chat closed.`);
            const { videoSessionService } = await import('../modules/videoSession/videoSession.service');
            await videoSessionService.cancelOpenSessionsForCareRequest(request._id.toString(), actorUserId, `Care request marked ${data.status}; video session closed.`);
            await Patient.findByIdAndUpdate(request.patient_id, {
                $set: {
                    care_status: 'treated',
                    care_status_updated_at: new Date()
                },
                $unset: {
                    doctor_id: '',
                    doctor_assigned_at: ''
                }
            });
        } else if (data.status === 'pending_assignment' || data.status === 'triage_in_progress') {
            await Patient.findByIdAndUpdate(request.patient_id, {
                $set: {
                    care_status: request.doctor_id ? 'assigned' : 'needs_care',
                    care_status_updated_at: new Date()
                }
            });
        }

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

        const patient = await Patient.findById(patientId);
        if (!patient) {
            throw new NotFoundError('Patient not found');
        }

        const request = await CareRequest.findOne({
            patient_id: patient._id,
            status: { $in: openRequestStatuses }
        }).sort({ created_at: -1 });

        if (!request) {
            throw new NotFoundError('Open care request not found for this patient');
        }

        // Check access: either Patient is assigned to this Doctor, or CareRequest is assigned to this Doctor.
        const patientDoctorId = patient.doctor_id?.toString();
        const requestDoctorId = request.doctor_id?.toString();
        const myDoctorId = doctor._id.toString();

        if (patientDoctorId !== myDoctorId && requestDoctorId !== myDoctorId) {
            throw new ForbiddenError('Patient is not assigned to this Doctor');
        }

        const isClosed = data.outcome !== 'follow_up_needed';

        request.status = data.outcome;
        request.outcome = data.outcome;
        request.doctor_notes = data.doctor_notes;
        
        if (isClosed) {
            request.closed_at = new Date();
            request.closed_by = new mongoose.Types.ObjectId(doctorUserId);
            request.claimed_by = undefined;
            request.claimed_assistant_id = undefined;
            request.claimed_at = undefined;
            request.claim_expires_at = undefined;
        }
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

        if (isClosed) {
            const { triageChatService } = await import('../modules/triageChat/triageChat.service');
            await triageChatService.closeConversationForCareRequest(
                request._id.toString(), 
                doctorUserId, 
                `Doctor marked case as ${data.outcome}. Care thread closed.`
            );
            const { videoSessionService } = await import('../modules/videoSession/videoSession.service');
            await videoSessionService.cancelOpenSessionsForCareRequest(
                request._id.toString(), 
                doctorUserId, 
                `Doctor marked case as ${data.outcome}; video session closed.`
            );
        }

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
            return null;
        }

        request.doctor_id = new mongoose.Types.ObjectId(doctorId);
        request.assigned_by = new mongoose.Types.ObjectId(actorUserId);
        request.assigned_at = new Date();
        request.status = 'assigned';
        request.claimed_by = undefined;
        request.claimed_assistant_id = undefined;
        request.claimed_at = undefined;
        request.claim_expires_at = undefined;
        await request.save();
        return request._id.toString();
    }

    async syncUnassignment(patientId: string, actorUserId: string) {
        const request = await CareRequest.findOne({
            patient_id: patientId,
            status: { $in: openRequestStatuses }
        }).sort({ created_at: -1 });

        if (!request) {
            return null;
        }

        request.doctor_id = undefined;
        request.assigned_by = undefined;
        request.assigned_at = undefined;
        
        // Revert status based on previous triage state. 
        // If it was just assigned from new_request, it might go back to new_request.
        // Assuming pending_assignment is the default fallback for unassigned open requests.
        request.status = 'pending_assignment'; 
        
        await request.save();
        return request._id.toString();
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
            })
            .populate('claimed_by', 'email role status');

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
        const claimedBy = request.claimed_by || request.claimed_by_user;
        const isClaimActive = Boolean(request.claimed_by) && !this.isClaimExpired(request);

        return {
            care_request_id: request._id.toString(),
            patient_id: patient?._id?.toString() || request.patient_id?.toString(),
            patient_name: patient?.full_name || this.formatNameFromEmail(user?.email || ''),
            patient_email: user?.email,
            doctor_id: doctor?._id?.toString() || request.doctor_id?.toString() || null,
            doctor_name: doctor?.personal_info?.full_name || this.formatNameFromEmail(doctorUser?.email || ''),
            doctor_email: doctorUser?.email,
            doctor_specialty: doctor?.specialty || null,
            doctor_credential_status: doctor?.credential_status || null,
            claimed_by_user_id: claimedBy?._id?.toString() || request.claimed_by?.toString() || null,
            claimed_by_email: claimedBy?.email || null,
            claimed_at: request.claimed_at,
            claim_expires_at: request.claim_expires_at,
            is_claimed: isClaimActive,
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

    private assertRequestInAssistantScope(request: any, allowedDoctorIds: string[]) {
        const doctorId = request.doctor_id?.toString();
        if (doctorId && !allowedDoctorIds.includes(doctorId)) {
            throw new ForbiddenError('Care request is outside this Assistant scope');
        }
    }

    private assertRequestIsOpen(status: CareRequestStatus) {
        if (!openRequestStatuses.includes(status)) {
            throw new BadRequestError('Care request is not open');
        }
    }

    private assertClaimOwnedBy(request: any, assistantUserId: string) {
        if (!request.claimed_by) {
            throw new ConflictError('Claim this care request before updating or assigning it');
        }
        if (this.isClaimExpired(request)) {
            throw new ConflictError('This care request claim has expired. Claim it again before continuing.');
        }
        if (request.claimed_by.toString() !== assistantUserId) {
            throw new ConflictError('This care request is claimed by another assistant');
        }
    }

    private isClaimExpired(request: any) {
        return Boolean(request.claim_expires_at && new Date(request.claim_expires_at).getTime() <= Date.now());
    }

    private getClaimExpiry() {
        return new Date(Date.now() + ASSISTANT_CLAIM_MINUTES * 60 * 1000);
    }

    private getDoctorAssignmentBlockReason(doctor: any, user: any, activePatientCount: number) {
        if (!user || user.role !== Role.DOCTOR || user.status !== UserStatus.ACTIVE) {
            return 'Doctor account is not active';
        }
        if (doctor.credential_status !== 'verified') {
            return 'Doctor credentials are not verified';
        }
        if (activePatientCount >= doctor.max_patients) {
            return 'Doctor is at active patient capacity';
        }
        return null;
    }

    private escapeRegex(value: string) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private async notifyCareRequest(patient: any, action: 'created' | 'updated' | 'closed') {
        try {
            const hasAssignedDoctor = Boolean(patient.doctor_id);
            const patientName = patient.full_name || 'A patient';
            
            let title = '';
            let body = '';
            let doctorLink = '/dashboard/doctor/patients';
            let adminLink = '/dashboard/admin/assignments';

            if (action === 'closed') {
                title = 'Care Request Closed';
                body = `Patient ${patientName} marked that care is no longer needed.`;
            } else if (action === 'updated') {
                title = 'Care Request Updated';
                body = `Patient ${patientName} updated their care request.`;
            } else {
                title = 'New Care Request';
                body = `Patient ${patientName} needs care.`;
                if (!hasAssignedDoctor) {
                    title = 'Unassigned Care Request';
                    body = `Patient ${patientName} submitted a new care request and requires triage.`;
                }
            }

            if (hasAssignedDoctor) {
                // Notify assigned doctor
                const doctor = await DoctorModel.findById(patient.doctor_id).populate('user_id');
                if (doctor && doctor.user_id) {
                    const doctorUserId = (doctor.user_id as any)._id ? (doctor.user_id as any)._id.toString() : doctor.user_id.toString();
                    await notificationService.send({
                        userId: doctorUserId,
                        type: NotificationType.CARE_REQUEST,
                        title,
                        body,
                        link: doctorLink
                    });
                }
                
                // Notify assigned assistants
                const assistants = await Assistant.find({ assigned_doctor_ids: patient.doctor_id }).populate('user_id');
                for (const ast of assistants) {
                    if (ast.user_id) {
                        const astUserId = (ast.user_id as any)._id ? (ast.user_id as any)._id.toString() : ast.user_id.toString();
                        await notificationService.send({
                            userId: astUserId,
                            type: NotificationType.CARE_REQUEST,
                            title,
                            body,
                            link: '/dashboard/assistant/patients'
                        });
                    }
                }
            } else {
                // Notify all super admins
                const admins = await User.find({ role: Role.SUPER_ADMIN });
                for (const admin of admins) {
                    await notificationService.send({
                        userId: admin._id.toString(),
                        type: NotificationType.CARE_REQUEST,
                        title,
                        body,
                        link: adminLink
                    });
                }
            }
        } catch (error) {
            console.error('Failed to send care request notification:', error);
        }
    }
}

export const careRequestService = new CareRequestService();
