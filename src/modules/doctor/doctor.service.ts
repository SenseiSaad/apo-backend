import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Doctor as DoctorModel } from '../../models/Doctor.model';
import { User } from '../../models/User.model';
import { InviteToken } from '../../models/InviteToken.model';
import { Patient } from '../../models/Patient.model';
import { Assistant as AssistantModel } from '../../models/Assistant.model';
import { Role, Tier, UserStatus } from '../../models/enums';
import { decrypt, encrypt } from '../../utils/encryption';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { emailService } from '../../services/email.service';
import { adminService } from '../admin/admin.service';
import {
    CreateDoctorAssistantInput,
    InvitePatientInput,
    UpdateDoctorAssistantInput,
    UpdateDoctorAvailabilityInput,
    UpdateDoctorPersonalInfoInput,
    UpdateDoctorProfessionalInfoInput,
    UpdateDoctorSettingsInput
} from '../../validators/doctor.validator';

export class DoctorService {
    private readonly patientInviteTtlMs = 7 * 24 * 60 * 60 * 1000;

    async getProfile(user_id: string) {
        const user = await User.findById(user_id).select('email role status email_verified mfa_enabled otp_required must_change_password created_at updated_at');
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const Doctor = await DoctorModel.findOne({ user_id });
        if (!Doctor) {
            throw new NotFoundError('Doctor profile not found');
        }

        return this.formatProfile(user, Doctor);
    }

    async updatePersonalInfo(user_id: string, data: UpdateDoctorPersonalInfoInput) {
        const Doctor = await this.findDoctor(user_id);
        Doctor.personal_info = {
            ...this.toPlainObject(Doctor.personal_info),
            ...data
        };
        await Doctor.save();
        return this.getProfile(user_id);
    }

    async updateProfessionalInfo(user_id: string, data: UpdateDoctorProfessionalInfoInput) {
        const Doctor = await this.findDoctor(user_id);
        const existingProfessionalInfo = this.toPlainObject(Doctor.professional_info);
        const credentialReviewChanged = this.hasCredentialReviewChanges(Doctor, existingProfessionalInfo, data);

        if (data.license_number !== undefined) {
            Doctor.license_number = encrypt(data.license_number);
        }

        if (data.specialty !== undefined) {
            Doctor.specialty = data.specialty;
        }

        const professionalInfo = {
            ...(data.bio !== undefined ? { bio: data.bio } : {}),
            ...(data.credentials !== undefined ? { credentials: data.credentials } : {}),
            ...(data.years_experience !== undefined ? { years_experience: data.years_experience } : {}),
            ...(data.session_modalities !== undefined ? { session_modalities: data.session_modalities } : {})
        };

        Doctor.professional_info = {
            ...existingProfessionalInfo,
            ...professionalInfo
        };

        if (credentialReviewChanged) {
            Doctor.credential_status = 'pending';
        }

        await Doctor.save();
        return this.getProfile(user_id);
    }

    async updateAvailability(user_id: string, data: UpdateDoctorAvailabilityInput) {
        const Doctor = await this.findDoctor(user_id);
        Doctor.availability = data.availability;
        await Doctor.save();
        return {
            doctor_id: Doctor._id.toString(),
            availability: Doctor.availability
        };
    }

    async updateSettings(user_id: string, data: UpdateDoctorSettingsInput) {
        const Doctor = await this.findDoctor(user_id);
        Doctor.portal_settings = {
            ...this.toPlainObject(Doctor.portal_settings),
            ...data
        };
        await Doctor.save();
        return {
            doctor_id: Doctor._id.toString(),
            portal_settings: Doctor.portal_settings
        };
    }

    async invitePatient(user_id: string, data: InvitePatientInput) {
        const Doctor = await this.findDoctor(user_id);
        const DoctorUser = await User.findById(user_id);
        if (!DoctorUser) {
            throw new NotFoundError('Doctor user not found');
        }

        const email = data.email.trim().toLowerCase();
        const existingUser = await User.findOne({ email });
        let existingPatient = null;

        if (existingUser) {
            if (existingUser.role !== Role.PATIENT) {
                throw new BadRequestError('This email belongs to a non-patient account');
            }

            existingPatient = await Patient.findOne({ user_id: existingUser._id });
            if (existingPatient?.doctor_id?.toString() === Doctor._id.toString()) {
                throw new ConflictError('This patient is already assigned to you');
            }

            if (existingPatient?.doctor_id) {
                throw new ConflictError('This patient is already assigned to another Doctor');
            }
        }

        const pendingInvite = await InviteToken.findOne({
            email,
            doctor_id: Doctor._id,
            status: 'pending',
            used_at: null,
            expires_at: { $gt: new Date() }
        });

        if (pendingInvite) {
            return {
                message: 'A pending invite already exists for this patient',
                invite: this.formatInvite(pendingInvite)
            };
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires_at = new Date(Date.now() + this.patientInviteTtlMs);
        const invite = await InviteToken.create({
            email,
            token,
            doctor_id: Doctor._id,
            patient_id: existingPatient?._id,
            status: 'pending',
            expires_at
        });

        const inviteUrl = this.buildPatientInviteUrl(token);
        const DoctorName = Doctor.personal_info?.full_name || DoctorUser.email;
        await emailService.sendPatientDoctorInvite(email, inviteUrl, DoctorName, data.note);

        return {
            message: 'Patient invite sent successfully',
            invite: this.formatInvite(invite),
            existing_patient: Boolean(existingPatient)
        };
    }

    async getPatientInvites(user_id: string) {
        const Doctor = await this.findDoctor(user_id);
        const invites = await InviteToken.find({ doctor_id: Doctor._id })
            .sort({ created_at: -1 })
            .limit(100)
            .lean();

        return {
            invites: invites.map(invite => this.formatInvite(invite)),
            total: invites.length
        };
    }

    async getAssistants(user_id: string) {
        const Doctor = await this.findDoctor(user_id);
        const Assistants = await AssistantModel.find({ assigned_doctor_ids: Doctor._id })
            .populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at')
            .sort({ created_at: -1 });

        return {
            Assistants: Assistants.map(Assistant => this.formatAssistant(Assistant)),
            total: Assistants.length,
            limits: {
                can_onboard_assistants: Doctor.portal_settings?.can_onboard_assistants ?? false,
                max_assistants: Doctor.portal_settings?.max_assistants ?? 5
            }
        };
    }

    async inviteAssistant(user_id: string, data: CreateDoctorAssistantInput) {
        const Doctor = await this.findDoctor(user_id);

        if (!Doctor.portal_settings?.can_onboard_assistants) {
            throw new ForbiddenError('Admin permission is required before this Doctor can invite Assistants');
        }

        const maxAssistants = Doctor.portal_settings.max_assistants ?? 5;
        const activeAssistantCount = await this.countActiveAssistantsForDoctor(Doctor._id.toString());
        if (activeAssistantCount >= maxAssistants) {
            throw new BadRequestError(`Assistant limit reached for this Doctor (${maxAssistants})`);
        }

        const email = data.email.trim().toLowerCase();
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new ConflictError('Email already registered');
        }

        const password_hash = await bcrypt.hash(this.generateTemporaryPassword(), 12);
        let user;

        try {
            user = await User.create({
                email,
                password_hash,
                role: Role.ASSISTANT,
                tier: Tier.FREE,
                mfa_enabled: false,
                otp_required: data.otp_required || false,
                must_change_password: true,
                email_verified: false,
                status: UserStatus.PENDING
            });

            const Assistant = await AssistantModel.create({
                user_id: user._id,
                assigned_doctor_ids: [Doctor._id],
                permissions: {
                    can_view_assigned_patients: data.permissions?.can_view_assigned_patients ?? true,
                    can_manage_bookings: data.permissions?.can_manage_bookings ?? true,
                    can_send_communications: data.permissions?.can_send_communications ?? true
                }
            });

            const setupToken = await adminService.createAssistantSetupToken(user._id);
            const otp = await adminService.createEmailOtp(user._id, user.email);
            const setupUrl = adminService.buildAssistantSetupUrl(setupToken);
            await emailService.sendDoctorSetupInvite(user.email, setupUrl, otp);

            return {
                message: 'Assistant invited and assigned. Setup link and OTP sent to Assistant email.',
                Assistant: this.formatAssistant(await Assistant.populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at')),
                setup_required: true,
                setup_link_sent: true
            };
        } catch (error) {
            if (user) {
                await User.deleteOne({ _id: user._id });
            }
            throw error;
        }
    }

    async updateAssistant(user_id: string, assistantId: string, data: UpdateDoctorAssistantInput) {
        const Doctor = await this.findDoctor(user_id);
        const Assistant = await AssistantModel.findOne({
            _id: assistantId,
            assigned_doctor_ids: Doctor._id
        }).populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at');

        if (!Assistant) {
            throw new NotFoundError('Assistant not found for this Doctor');
        }

        const user = Assistant.user_id as any;
        if (!user || user.role !== Role.ASSISTANT) {
            throw new NotFoundError('Assistant user account not found');
        }

        if (data.permissions) {
            Assistant.permissions = {
                can_view_assigned_patients: data.permissions.can_view_assigned_patients ?? Assistant.permissions.can_view_assigned_patients,
                can_manage_bookings: data.permissions.can_manage_bookings ?? Assistant.permissions.can_manage_bookings,
                can_send_communications: data.permissions.can_send_communications ?? Assistant.permissions.can_send_communications
            };
            await Assistant.save();
        }

        if (data.status !== undefined) {
            user.status = data.status;
            await user.save();
        }

        return {
            message: data.status && data.status !== UserStatus.ACTIVE
                ? 'Assistant deactivated and can no longer access the dashboard'
                : 'Assistant updated successfully',
            Assistant: this.formatAssistant(Assistant)
        };
    }

    async getAssistantDetail(user_id: string, assistantId: string) {
        const Doctor = await this.findDoctor(user_id);
        const Assistant = await AssistantModel.findOne({
            _id: assistantId,
            assigned_doctor_ids: Doctor._id
        }).populate('user_id', 'email role status email_verified otp_required must_change_password created_at updated_at');

        if (!Assistant) {
            throw new NotFoundError('Assistant not found for this Doctor');
        }

        return {
            Assistant: this.formatAssistant(Assistant)
        };
    }

    private async findDoctor(user_id: string) {
        const Doctor = await DoctorModel.findOne({ user_id });
        if (!Doctor) {
            throw new NotFoundError('Doctor profile not found');
        }
        return Doctor;
    }

    private async countActiveAssistantsForDoctor(doctorId: string) {
        const result = await AssistantModel.aggregate([
            { $match: { assigned_doctor_ids: new mongoose.Types.ObjectId(doctorId) } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            { $match: { 'user.role': Role.ASSISTANT, 'user.status': UserStatus.ACTIVE } },
            { $count: 'total' }
        ]);

        return result[0]?.total || 0;
    }

    private generateTemporaryPassword() {
        const random = crypto.randomBytes(12).toString('base64url');
        return `Tw1!${random}`;
    }

    private buildPatientInviteUrl(token: string) {
        const baseUrl = process.env.PATIENT_APP_URL || process.env.CLIENT_URL || process.env.APP_URL || 'https://Apothecary-app-frontend.vercel.app';
        return `${baseUrl.replace(/\/+$/, '')}/auth/invite?token=${encodeURIComponent(token)}`;
    }

    private formatInvite(invite: any) {
        const now = new Date();
        const status = invite.status || (invite.used_at ? 'accepted' : invite.expires_at <= now ? 'expired' : 'pending');

        return {
            invite_id: invite._id.toString(),
            email: invite.email,
            doctor_id: invite.doctor_id?.toString(),
            patient_id: invite.patient_id?.toString(),
            status,
            expires_at: invite.expires_at,
            used_at: invite.used_at,
            declined_at: invite.declined_at,
            created_at: invite.created_at,
            is_expired: !invite.used_at && !invite.declined_at && invite.expires_at <= now
        };
    }

    private formatProfile(user: any, Doctor: any) {
        return {
            user: {
                user_id: user._id.toString(),
                email: user.email,
                role: user.role,
                status: user.status,
                email_verified: user.email_verified,
                mfa_enabled: user.mfa_enabled,
                otp_required: user.otp_required,
                must_change_password: user.must_change_password,
                created_at: user.created_at,
                updated_at: user.updated_at
            },
            Doctor: {
                doctor_id: Doctor._id.toString(),
                personal_info: Doctor.personal_info || null,
                professional_info: {
                    license_number: decrypt(Doctor.license_number),
                    specialty: Doctor.specialty,
                    ...this.toPlainObject(Doctor.professional_info)
                },
                max_patients: Doctor.max_patients,
                availability: Doctor.availability,
                portal_settings: Doctor.portal_settings,
                credential_status: Doctor.credential_status,
                credential_notes: Doctor.credential_notes,
                invited_by: Doctor.invited_by?.toString(),
                created_at: Doctor.created_at,
                updated_at: Doctor.updated_at
            }
        };
    }

    private formatAssistant(Assistant: any) {
        const user = Assistant.user_id;
        return {
            assistant_id: Assistant._id.toString(),
            user: {
                user_id: user?._id?.toString(),
                email: user?.email,
                role: user?.role,
                status: user?.status,
                email_verified: user?.email_verified,
                otp_required: user?.otp_required,
                must_change_password: user?.must_change_password,
                created_at: user?.created_at,
                updated_at: user?.updated_at
            },
            assigned_doctor_ids: (Assistant.assigned_doctor_ids || []).map((id: any) => id.toString()),
            permissions: Assistant.permissions,
            created_at: Assistant.created_at,
            updated_at: Assistant.updated_at
        };
    }

    private toPlainObject(value: any) {
        if (!value) {
            return {};
        }

        if (typeof value.toObject === 'function') {
            return value.toObject();
        }

        return value;
    }

    private hasCredentialReviewChanges(
        Doctor: any,
        existingProfessionalInfo: any,
        data: UpdateDoctorProfessionalInfoInput
    ) {
        if (data.license_number !== undefined && data.license_number !== decrypt(Doctor.license_number)) {
            return true;
        }

        if (data.specialty !== undefined && data.specialty !== Doctor.specialty) {
            return true;
        }

        if (data.credentials !== undefined && JSON.stringify(data.credentials) !== JSON.stringify(existingProfessionalInfo.credentials || [])) {
            return true;
        }

        if (data.years_experience !== undefined && data.years_experience !== existingProfessionalInfo.years_experience) {
            return true;
        }

        if (
            data.session_modalities !== undefined &&
            JSON.stringify(data.session_modalities) !== JSON.stringify(existingProfessionalInfo.session_modalities || [])
        ) {
            return true;
        }

        return false;
    }
}

export const doctorService = new DoctorService();
