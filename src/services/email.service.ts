import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

class EmailService {
    private transporter: nodemailer.Transporter | null = null;
    private isConfigured: boolean = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        const emailService = process.env.EMAIL_SERVICE;

        if (emailService === 'console') {
            // Development mode - log to console
            this.isConfigured = true;
            logger.info('📧 Email Service: Console mode (development)');
        } else if (process.env.GMAIL_APP_PASSWORD) {
            const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.FROM_EMAIL;

            if (!gmailUser) {
                logger.warn('Email Service: GMAIL_APP_PASSWORD is set, but GMAIL_USER, SMTP_USER, or FROM_EMAIL is missing');
                return;
            }

            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: gmailUser,
                    pass: process.env.GMAIL_APP_PASSWORD
                }
            });
            this.isConfigured = true;
            logger.info('Email Service: Gmail configured');
        } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            // Production mode - use SMTP
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_PORT === '465',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            this.isConfigured = true;
            logger.info('📧 Email Service: SMTP configured');
        } else {
            logger.warn('⚠️  Email Service: Not configured, emails will be logged only');
        }
    }

    /**
     * Send verification OTP email
     */
    async sendVerificationOTP(email: string, otp: string, userName?: string) {
        const subject = 'Verify Your Email - Apothecary';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Welcome to Apothecary! 🌟</h2>
                <p>Hi ${userName || 'there'},</p>
                <p>Thank you for registering with Apothecary. Please verify your email address to complete your registration.</p>
                
                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                    <p style="margin: 0; font-size: 14px; color: #6B7280;">Your verification code is:</p>
                    <h1 style="margin: 10px 0; font-size: 36px; letter-spacing: 8px; color: #4F46E5;">${otp}</h1>
                    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">This code will expire in 15 minutes</p>
                </div>
                
                <p style="color: #6B7280; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
                    Apothecary - Your Clinic Companion<br>
                    This is an automated message, please do not reply.
                </p>
            </div>
        `;

        return this.sendEmail(email, subject, html, otp);
    }

    async sendAdminLoginOTP(email: string, otp: string) {
        const subject = 'Admin Login OTP - Apothecary';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Apothecary Admin Login</h2>
                <p>An admin login was requested for this email address.</p>

                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                    <p style="margin: 0; font-size: 14px; color: #6B7280;">Your admin login code is:</p>
                    <h1 style="margin: 10px 0; font-size: 36px; letter-spacing: 8px; color: #4F46E5;">${otp}</h1>
                    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">This code will expire in 10 minutes</p>
                </div>

                <p style="color: #6B7280; font-size: 14px;">If you did not request this login, change your password immediately.</p>
            </div>
        `;

        return this.sendEmail(email, subject, html, otp);
    }

    async sendAdminSignupOTP(email: string, otp: string) {
        const subject = 'Verify Admin Signup - Apothecary';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Verify Apothecary Admin Signup</h2>
                <p>Use this code to verify the super admin account.</p>

                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                    <p style="margin: 0; font-size: 14px; color: #6B7280;">Your signup verification code is:</p>
                    <h1 style="margin: 10px 0; font-size: 36px; letter-spacing: 8px; color: #4F46E5;">${otp}</h1>
                    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">This code will expire in 10 minutes</p>
                </div>
            </div>
        `;

        return this.sendEmail(email, subject, html, otp);
    }

    async sendAdminPasswordResetOTP(email: string, otp: string) {
        const subject = 'Admin Password Reset OTP - Apothecary';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Apothecary Admin Password Reset</h2>
                <p>Use this code to reset your admin password.</p>

                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                    <p style="margin: 0; font-size: 14px; color: #6B7280;">Your password reset code is:</p>
                    <h1 style="margin: 10px 0; font-size: 36px; letter-spacing: 8px; color: #4F46E5;">${otp}</h1>
                    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">This code will expire in 10 minutes</p>
                </div>

                <p style="color: #6B7280; font-size: 14px;">If you did not request this reset, ignore this email and review account access.</p>
            </div>
        `;

        return this.sendEmail(email, subject, html, otp);
    }

    async sendDoctorAccountInvite(email: string, password: string, loginUrl?: string) {
        const subject = 'Your Apothecary Doctor Account';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Apothecary Doctor Portal</h2>
                <p>Your Doctor account has been created by the Apothecary Super Admin.</p>

                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 30px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${email}</p>
                    <p style="margin: 0;"><strong>Temporary password:</strong> ${password}</p>
                </div>

                ${loginUrl ? `<p><a href="${loginUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Open Doctor Portal</a></p>` : ''}

                <p style="color: #6B7280; font-size: 14px;">For security, change this password after your first login.</p>
            </div>
        `;

        return this.sendEmail(email, subject, html, password);
    }

    async sendDoctorSetupInvite(email: string, setupUrl: string, otp: string, role?: string) {
        const isDoctor = role === 'doctor';
        const roleLabel = isDoctor ? 'Doctor' : 'Assistant';
        const subject = `Set Up Your Apothecary ${roleLabel} Account`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Apothecary ${roleLabel} Portal</h2>
                <p>Your ${roleLabel} account has been created by the Apothecary Super Admin.</p>
                <p>Use the secure link below and the verification code to set your password.</p>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${setupUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Set Up Password</a>
                </div>

                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                    <p style="margin: 0; font-size: 14px; color: #6B7280;">Your setup verification code is:</p>
                    <h1 style="margin: 10px 0; font-size: 36px; letter-spacing: 8px; color: #4F46E5;">${otp}</h1>
                    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">This code will expire in 10 minutes</p>
                </div>

                <p style="color: #6B7280; font-size: 14px;">Or copy and paste this link:</p>
                <p style="background-color: #F3F4F6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">${setupUrl}</p>
            </div>
        `;

        return this.sendEmail(email, subject, html, `Setup URL: ${setupUrl} | OTP: ${otp}`);
    }

    async sendDoctorCredentialReviewStatus(
        email: string,
        status: 'pending' | 'verified' | 'rejected',
        notes?: string
    ) {
        const statusLabels = {
            pending: 'Pending Review',
            verified: 'Verified',
            rejected: 'Needs Revision'
        };
        const statusColors = {
            pending: '#D97706',
            verified: '#059669',
            rejected: '#DC2626'
        };
        const intro = status === 'verified'
            ? 'Your professional credentials have been verified by the Apothecary Super Admin.'
            : status === 'rejected'
                ? 'Your professional credentials need revision before they can be verified.'
                : 'Your professional credentials are pending Super Admin review.';
        const nextStep = status === 'verified'
            ? 'You can continue using the Doctor portal. If you update license, specialty, credentials, experience, or modalities later, your profile will return to pending review.'
            : status === 'rejected'
                ? 'Please sign in to the Doctor portal, review the admin note, update the requested professional details, and save your profile to resubmit for review.'
                : 'No action is required unless the admin note asks for additional information.';

        const safeNotes = notes?.trim() ? this.escapeHtml(notes.trim()) : '';
        const subject = `Doctor Credentials ${statusLabels[status]} - Apothecary`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Apothecary Doctor Credential Review</h2>
                <p>${intro}</p>

                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 24px 0;">
                    <p style="margin: 0; color: #6B7280; font-size: 14px;">Current credential status</p>
                    <h3 style="margin: 8px 0 0; color: ${statusColors[status]};">${statusLabels[status]}</h3>
                </div>

                ${safeNotes ? `
                    <div style="background-color: #FFF7ED; border-left: 4px solid #F97316; padding: 16px; border-radius: 6px; margin: 24px 0;">
                        <p style="margin: 0 0 8px; font-weight: bold; color: #7C2D12;">Admin review note</p>
                        <p style="margin: 0; color: #374151; line-height: 1.5;">${safeNotes}</p>
                    </div>
                ` : ''}

                <p>${nextStep}</p>
                <p style="color: #6B7280; font-size: 14px;">This is an automated notification from Apothecary.</p>
            </div>
        `;

        return this.sendEmail(email, subject, html, `Credential status: ${status}${safeNotes ? ` | Notes: ${notes}` : ''}`);
    }

    async sendPatientDoctorInvite(
        email: string,
        inviteUrl: string,
        DoctorName?: string,
        note?: string
    ) {
        const safeDoctorName = this.escapeHtml(DoctorName || 'your Doctor');
        const safeNote = note?.trim() ? this.escapeHtml(note.trim()) : '';
        const subject = 'You have been invited to Apothecary';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Apothecary Patient Invitation</h2>
                <p>${safeDoctorName} has invited you to join Apothecary and connect through the patient app.</p>

                ${safeNote ? `
                    <div style="background-color: #FFF7ED; border-left: 4px solid #F97316; padding: 16px; border-radius: 6px; margin: 24px 0;">
                        <p style="margin: 0 0 8px; font-weight: bold; color: #7C2D12;">Message from Doctor</p>
                        <p style="margin: 0; color: #374151; line-height: 1.5;">${safeNote}</p>
                    </div>
                ` : ''}

                <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Accept Invitation</a>
                </div>

                <p style="color: #6B7280; font-size: 14px;">Or copy and paste this link:</p>
                <p style="background-color: #F3F4F6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">${inviteUrl}</p>
                <p style="color: #6B7280; font-size: 14px;">This invitation expires in 7 days.</p>
            </div>
        `;

        return this.sendEmail(email, subject, html, `Invite URL: ${inviteUrl}`);
    }

    async sendAssistantAccountInvite(email: string, password: string, loginUrl?: string) {
        const subject = 'Your Apothecary Assistant Account';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Apothecary Assistant Portal</h2>
                <p>Your Assistant account has been created by the Apothecary Super Admin.</p>

                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 30px 0;">
                    <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${email}</p>
                    <p style="margin: 0;"><strong>Temporary password:</strong> ${password}</p>
                </div>

                ${loginUrl ? `<p><a href="${loginUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Open Assistant Portal</a></p>` : ''}

                <p style="color: #6B7280; font-size: 14px;">For security, change this password after your first login.</p>
            </div>
        `;

        return this.sendEmail(email, subject, html, password);
    }

    /**
     * Send mobile password reset OTP email
     */
    async sendPasswordResetOTP(email: string, otp: string, userName?: string) {
        const subject = 'Reset Your Password - Apothecary';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Password Reset Request 🔐</h2>
                <p>Hi ${userName || 'there'},</p>
                <p>We received a request to reset your password. Enter this code in the Apothecary app to create a new password:</p>
                
                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                    <p style="margin: 0; font-size: 14px; color: #6B7280;">Your password reset code is:</p>
                    <h1 style="margin: 10px 0; font-size: 36px; letter-spacing: 8px; color: #4F46E5;">${otp}</h1>
                    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">This code will expire in 10 minutes</p>
                </div>

                <p style="color: #6B7280; font-size: 14px;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
                    Apothecary - Your Clinic Companion<br>
                    This is an automated message, please do not reply.
                </p>
            </div>
        `;

        return this.sendEmail(email, subject, html, otp);
    }

    /**
     * Send welcome email after verification
     */
    async sendWelcomeEmail(email: string, userName: string) {
        const subject = 'Welcome to Apothecary! 🎉';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Welcome to Apothecary! 🎉</h2>
                <p>Hi ${userName},</p>
                <p>Your email has been verified successfully! We're excited to have you on your Clinic journey.</p>
                
                <div style="background-color: #F0FDF4; padding: 20px; border-radius: 8px; border-left: 4px solid #10B981; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #059669;">Getting Started:</h3>
                    <ul style="color: #065F46;">
                        <li>Complete your profile</li>
                        <li>Chat with our AI wellness companion</li>
                        <li>Track your daily activities</li>
                        <li>Connect with a Doctor (optional)</li>
                    </ul>
                </div>
                
                <p>Need help? Our support team is here for you.</p>
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
                    Apothecary - Your Clinic Companion
                </p>
            </div>
        `;

        return this.sendEmail(email, subject, html);
    }

    /**
     * Core email sending method
     */
    private async sendEmail(to: string, subject: string, html: string, debugInfo?: string) {
        try {
            if (!this.isConfigured) {
                logger.warn(`📧 Email not sent (service not configured): ${to} - ${subject}`);
                if (debugInfo) {
                    logger.info(`📧 Debug Info: ${debugInfo}`);
                }
                return { success: false, message: 'Email service not configured' };
            }

            // Console mode (development)
            if (!this.transporter) {
                logger.info(`\n${'='.repeat(80)}`);
                logger.info(`📧 EMAIL (Development Mode)`);
                logger.info(`To: ${to}`);
                logger.info(`Subject: ${subject}`);
                if (debugInfo) {
                    logger.info(`\n🔑 IMPORTANT INFO: ${debugInfo}`);
                }
                logger.info(`\n${html.replace(/<[^>]*>/g, '').substring(0, 200)}...`);
                logger.info(`${'='.repeat(80)}\n`);
                return { success: true, message: 'Email logged to console' };
            }

            // SMTP mode (production)
            const fromEmail = process.env.FROM_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER || 'noreply@Apothecaryplus.com';
            const info = await this.transporter.sendMail({
                from: `"${process.env.FROM_NAME || 'Apothecary'}" <${fromEmail}>`,
                to,
                subject,
                html
            });

            logger.info(`📧 Email sent successfully to ${to}: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            logger.error('📧 Email sending failed:', error);
            // Log to console as fallback
            logger.info(`📧 FALLBACK - Email content for ${to}:`);
            if (debugInfo) {
                logger.info(`🔑 IMPORTANT INFO: ${debugInfo}`);
            }
            return { success: false, error };
        }
    }

    private escapeHtml(value: string) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

export const emailService = new EmailService();
