import mongoose from 'mongoose';
import { Doctor as DoctorModel } from '../models/Doctor.model';
import { Patient } from '../models/Patient.model';
import { User } from '../models/User.model';
import { Role, UserStatus } from '../models/enums';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { careRequestService } from './careRequest.service';
import { triageChatService } from '../modules/triageChat/triageChat.service';

type CareStatus = 'needs_care' | 'assigned' | 'in_treatment' | 'treated' | 'inactive';
type AssignmentSource = 'admin' | 'assistant' | 'invite' | 'system';

interface AssignPatientInput {
    patientId: string;
    doctorId: string;
    actorUserId: string;
    source: AssignmentSource;
    force?: boolean;
    allowedDoctorIds?: string[];
}

interface ListAssignablePatientsInput {
    page: number;
    limit: number;
    search?: string;
    care_status?: CareStatus;
    assigned?: boolean;
}

const activeCareStatuses: CareStatus[] = ['needs_care', 'assigned', 'in_treatment'];

export class PatientAssignmentService {
    async listAssignablePatients(query: ListAssignablePatientsInput) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;

        const patientMatch: Record<string, any> = {};
        if (query.care_status) {
            patientMatch.care_status = query.care_status;
        } else {
            patientMatch.care_status = { $in: activeCareStatuses };
        }

        if (query.assigned === true) {
            patientMatch.doctor_id = { $exists: true, $ne: null };
        } else if (query.assigned === false) {
            patientMatch.$or = [{ doctor_id: { $exists: false } }, { doctor_id: null }];
        }

        const userMatch: Record<string, any> = {
            'user.role': Role.PATIENT,
            'user.status': UserStatus.ACTIVE
        };

        if (query.search) {
            const regex = new RegExp(this.escapeRegex(query.search), 'i');
            userMatch.$or = [
                { 'user.email': regex },
                { full_name: regex },
                { illness_description: regex }
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
            { $sort: { care_status_updated_at: -1, updated_at: -1, created_at: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                full_name: 1,
                                onboarding_source: 1,
                                care_status: 1,
                                illness_description: 1,
                                care_status_updated_at: 1,
                                doctor_assigned_at: 1,
                                created_at: 1,
                                updated_at: 1,
                                user: {
                                    _id: '$user._id',
                                    email: '$user.email',
                                    status: '$user.status',
                                    tier: '$user.tier'
                                },
                                doctor: {
                                    _id: '$doctor._id',
                                    specialty: '$doctor.specialty',
                                    personal_info: '$doctor.personal_info'
                                }
                            }
                        }
                    ],
                    total: [{ $count: 'count' }]
                }
            }
        ]);

        const total = result?.total?.[0]?.count || 0;

        return {
            patients: (result?.data || []).map((patient: any) => this.formatPatient(patient)),
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

    async assignPatientToDoctor(input: AssignPatientInput) {
        if (input.allowedDoctorIds && !input.allowedDoctorIds.includes(input.doctorId)) {
            throw new ForbiddenError('Assistant can assign patients only to assigned Doctors');
        }

        const [patient, doctor] = await Promise.all([
            Patient.findById(input.patientId).populate('user_id', 'email role status tier'),
            DoctorModel.findById(input.doctorId).populate('user_id', 'email role status')
        ]);

        if (!patient) {
            throw new NotFoundError('Patient not found');
        }

        const patientUser = patient.user_id as any;
        if (!patientUser || patientUser.role !== Role.PATIENT || patientUser.status !== UserStatus.ACTIVE) {
            throw new BadRequestError('Patient account is not active');
        }

        if (!doctor) {
            throw new NotFoundError('Doctor not found');
        }

        const doctorUser = doctor.user_id as any;
        if (!doctorUser || doctorUser.role !== Role.DOCTOR || doctorUser.status !== UserStatus.ACTIVE) {
            throw new BadRequestError('Doctor account is not active');
        }

        if (doctor.credential_status !== 'verified') {
            throw new BadRequestError('Doctor credentials must be verified before assigning patients');
        }

        if ((patient.care_status === 'treated' || patient.care_status === 'inactive') && !input.force) {
            throw new ConflictError('Patient is not currently marked as needing care');
        }

        const currentDoctorId = patient.doctor_id?.toString();
        if (currentDoctorId === input.doctorId) {
            return {
                message: 'Patient is already assigned to this Doctor',
                assignment: this.formatAssignment(patient, doctor)
            };
        }

        if (currentDoctorId && !input.force) {
            throw new ConflictError('Patient is already assigned to another Doctor. Use force to reassign.');
        }

        const activePatientCount = await Patient.countDocuments({
            doctor_id: new mongoose.Types.ObjectId(input.doctorId),
            care_status: { $in: activeCareStatuses }
        });

        if (activePatientCount >= doctor.max_patients) {
            throw new ConflictError('Doctor has reached the maximum active patient capacity');
        }

        patient.doctor_id = doctor._id;
        patient.doctor_assigned_at = new Date();
        patient.doctor_assigned_by = new mongoose.Types.ObjectId(input.actorUserId);
        patient.doctor_assignment_source = input.source;
        patient.care_status = 'assigned';
        patient.care_status_updated_at = new Date();
        await patient.save();

        // Auto-accept any pending invites from this Doctor to this Patient's email
        const patientUserDoc = await mongoose.model('User').findById(patient.user_id);
        if (patientUserDoc) {
            const { decrypt } = await import('../utils/encryption');
            const patientEmail = decrypt(patientUserDoc.email).toLowerCase();
            await mongoose.model('InviteToken').updateMany(
                { email: patientEmail, doctor_id: doctor._id, status: 'pending' },
                { $set: { status: 'accepted', used_at: new Date(), patient_id: patient._id } }
            );
        }

        const careRequestId = await careRequestService.syncAssignment(patient._id.toString(), doctor._id.toString(), input.actorUserId);
        
        let claimedByUserId: string | undefined;
        if (careRequestId) {
            await triageChatService.onboardDoctorForCareRequest(careRequestId, input.actorUserId);
            
            // Check if it was claimed before sync
            const { CareRequest } = await import('../models/CareRequest.model');
            const reqDoc = await CareRequest.findById(careRequestId);
            if (reqDoc && reqDoc.claimed_by) {
                claimedByUserId = reqDoc.claimed_by.toString();
            }
        }

        // --- Dispatch Real-Time Notifications ---
        const { notificationService } = await import('./notification.service');
        const { NotificationType } = await import('../models/enums');
        
        const patName = patient.full_name || 'A patient';
        const docName = doctor.personal_info?.full_name || 'your care team';

        // Notify Patient
        if (patientUser && patientUser._id) {
            await notificationService.send({
                userId: patientUser._id.toString(),
                type: NotificationType.CARE_REQUEST,
                title: 'Doctor Assigned',
                body: `You have been matched with Dr. ${docName}. Your care team is ready!`,
                link: '/dashboard/patient'
            }).catch(console.error);
        }

        // Notify Doctor
        if (doctorUser && doctorUser._id) {
            await notificationService.send({
                userId: doctorUser._id.toString(),
                type: NotificationType.CARE_REQUEST,
                title: 'New Patient Assigned',
                body: `${patName} has been assigned to you.`,
                link: '/dashboard/doctor/patients'
            }).catch(console.error);
        }

        // Notify Assistant if Admin overrides
        if (input.source === 'admin' && claimedByUserId) {
            await notificationService.send({
                userId: claimedByUserId,
                type: NotificationType.CARE_REQUEST,
                title: 'Admin Assignment Override',
                body: `An Admin directly assigned ${patName} to Dr. ${docName}. Your triage claim was resolved.`,
                link: '/dashboard/doctor/care-requests'
            }).catch(console.error);
        }
        
        // Emit global system refresh so UI tables update live
        notificationService.emitSystemEvent('care_request:updated', { patient_id: patient._id }, ['role:super_admin', 'role:assistant']);

        return {
            message: currentDoctorId ? 'Patient reassigned to Doctor successfully' : 'Patient assigned to Doctor successfully',
            assignment: this.formatAssignment(patient, doctor)
        };
    }

    async unassignPatient(patientId: string, actorUserId: string, source: AssignmentSource) {
        const patient = await Patient.findById(patientId).populate('user_id', 'email role status tier');
        if (!patient) {
            throw new NotFoundError('Patient not found');
        }

        const previousDoctorId = patient.doctor_id;

        patient.doctor_id = undefined;
        patient.doctor_assigned_at = undefined;
        patient.doctor_assigned_by = new mongoose.Types.ObjectId(actorUserId);
        patient.doctor_assignment_source = source;
        patient.care_status = 'needs_care';
        patient.care_status_updated_at = new Date();
        await patient.save();

        const careRequestId = await careRequestService.syncUnassignment(patient._id.toString(), actorUserId);
        if (careRequestId) {
            await triageChatService.handleDoctorUnassignment(careRequestId, actorUserId);
        }

        // Dispatch Unassignment Notifications
        try {
            const { notificationService } = await import('./notification.service');
            const { NotificationType } = await import('../models/enums');
            
            // Notify Patient
            if (patient.user_id) {
                const patientUserId = typeof patient.user_id === 'object' && '_id' in (patient.user_id as any)
                    ? (patient.user_id as any)._id.toString() 
                    : patient.user_id.toString();
                    
                await notificationService.send({
                    userId: patientUserId,
                    type: NotificationType.CARE_REQUEST,
                    title: 'Doctor Unassigned',
                    body: 'Your doctor assignment has been updated by the administration. You will be matched with a new doctor shortly.',
                    link: '/dashboard/patient'
                });
            }

            // Notify Previous Doctor
            if (previousDoctorId) {
                const Doctor = await import('../models/Doctor.model').then(m => m.Doctor);
                const prevDoc = await Doctor.findById(previousDoctorId);
                if (prevDoc && prevDoc.user_id) {
                    await notificationService.send({
                        userId: prevDoc.user_id.toString(),
                        type: NotificationType.CARE_REQUEST,
                        title: 'Patient Unassigned',
                        body: `Patient ${patient.full_name || 'A patient'} has been unassigned from your care list.`,
                        link: '/dashboard/doctor/patients'
                    });
                }
            }
        } catch (error) {
            console.error('Failed to send unassignment notifications:', error);
        }

        return {
            message: 'Patient unassigned from Doctor successfully',
            patient: this.formatPatient(patient)
        };
    }

    private formatAssignment(patient: any, doctor: any) {
        return {
            patient: this.formatPatient(patient),
            Doctor: {
                doctor_id: doctor._id.toString(),
                email: doctor.user_id?.email,
                name: doctor.personal_info?.full_name || this.formatNameFromEmail(doctor.user_id?.email || ''),
                specialty: doctor.specialty,
                max_patients: doctor.max_patients,
                credential_status: doctor.credential_status
            }
        };
    }

    private formatPatient(patient: any) {
        const user = patient.user_id || patient.user;
        const doctor = patient.doctor_id || patient.doctor;

        return {
            patient_id: patient._id.toString(),
            user_id: user?._id?.toString(),
            email: user?.email,
            name: patient.full_name || this.formatNameFromEmail(user?.email || ''),
            status: user?.status,
            tier: user?.tier,
            doctor_id: doctor?._id?.toString() || patient.doctor_id?.toString() || null,
            care_status: patient.care_status,
            illness_description: patient.illness_description,
            care_status_updated_at: patient.care_status_updated_at,
            doctor_assigned_at: patient.doctor_assigned_at,
            onboarding_source: patient.onboarding_source,
            created_at: patient.created_at,
            updated_at: patient.updated_at
        };
    }

    private formatNameFromEmail(email: string) {
        const localPart = email.split('@')[0] || 'User';
        return localPart
            .replace(/[._-]+/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ') || 'User';
    }

    private escapeRegex(value: string) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

export const patientAssignmentService = new PatientAssignmentService();
