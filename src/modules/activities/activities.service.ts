import { ActivityCalendar } from '../../models/ActivityCalendar.model';
import { Patient } from '../../models/Patient.model';
import { User } from '../../models/User.model';
import { Tier } from '../../models/enums';
import { decrypt } from '../../utils/encryption';
import { avatarService } from '../../services/avatar.service';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class ActivitiesService {
    /**
     * Get activities by date range
     */
    async getActivities(user_id: string, filters: {
        start_date?: string;
        end_date?: string;
        activity_type?: string;
        status?: 'pending' | 'completed';
    }) {
        // Check if user has premium tier
        const user = await User.findById(user_id);
        if (!user || user.tier === Tier.FREE) {
            throw new ForbiddenError('Activities feature requires Basic or Premium tier');
        }

        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        // Build query
        const query: any = { patient_id: patient._id };

        // Date range filter
        if (filters.start_date || filters.end_date) {
            query.scheduled_at = {};
            if (filters.start_date) {
                query.scheduled_at.$gte = new Date(filters.start_date);
            }
            if (filters.end_date) {
                query.scheduled_at.$lte = new Date(filters.end_date);
            }
        }

        // Activity type filter
        if (filters.activity_type) {
            query.activity_type = filters.activity_type;
        }

        // Status filter
        if (filters.status === 'completed') {
            query.completed_at = { $ne: null };
        } else if (filters.status === 'pending') {
            query.completed_at = null;
        }

        const activities = await ActivityCalendar.find(query)
            .sort({ scheduled_at: 1 })
            .populate('doctor_id', 'user_id specialty')
            .lean();

        // Decrypt instructions and format response
        const formatted_activities = activities.map(activity => {
            const Doctor = activity.doctor_id as any;
            
            return {
                activity_id: activity._id.toString(),
                activity_type: activity.activity_type,
                title: activity.title,
                instructions: decrypt(activity.instructions),
                scheduled_at: activity.scheduled_at,
                recurrence_rule: activity.recurrence_rule,
                completed_at: activity.completed_at,
                duration: activity.duration,
                Doctor: Doctor ? {
                    doctor_id: Doctor._id.toString(),
                    specialty: Doctor.specialty
                } : null,
                created_at: activity.created_at
            };
        });

        return {
            activities: formatted_activities,
            total: formatted_activities.length
        };
    }

    /**
     * Get single activity detail
     */
    async getActivityDetail(user_id: string, activity_id: string) {
        // Check tier
        const user = await User.findById(user_id);
        if (!user || user.tier === Tier.FREE) {
            throw new ForbiddenError('Activities feature requires Basic or Premium tier');
        }

        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const activity = await ActivityCalendar.findOne({
            _id: activity_id,
            patient_id: patient._id
        }).populate('doctor_id', 'user_id specialty');

        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        const Doctor = activity.doctor_id as any;

        return {
            activity_id: activity._id.toString(),
            activity_type: activity.activity_type,
            title: activity.title,
            instructions: decrypt(activity.instructions),
            scheduled_at: activity.scheduled_at,
            recurrence_rule: activity.recurrence_rule,
            completed_at: activity.completed_at,
            duration: activity.duration,
            Doctor: Doctor ? {
                doctor_id: Doctor._id.toString(),
                specialty: Doctor.specialty
            } : null,
            created_at: activity.created_at,
            updated_at: activity.updated_at
        };
    }

    /**
     * Complete activity - updates streak and avatar
     */
    async completeActivity(user_id: string, activity_id: string, _notes?: string) {
        // Check tier
        const user = await User.findById(user_id);
        if (!user || user.tier === Tier.FREE) {
            throw new ForbiddenError('Activities feature requires Basic or Premium tier');
        }

        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        const activity = await ActivityCalendar.findOne({
            _id: activity_id,
            patient_id: patient._id
        });

        if (!activity) {
            throw new NotFoundError('Activity not found');
        }

        if (activity.completed_at) {
            return {
                message: 'Activity already completed',
                activity_id: activity._id.toString(),
                completed_at: activity.completed_at
            };
        }

        // Mark as completed
        activity.completed_at = new Date();
        await activity.save();

        // Update patient stats
        await this.updatePatientStats(patient._id.toString(), activity.activity_type);

        // Check for avatar evolution
        const avatar_changes = await avatarService.checkAndApplyEvolution(patient._id.toString());

        // Get updated patient data
        const updated_patient = await Patient.findById(patient._id);

        logger.info(`Activity ${activity_id} completed by patient ${patient._id}`);

        return {
            message: 'Activity completed successfully',
            activity_id: activity._id.toString(),
            completed_at: activity.completed_at,
            stats: {
                activity_score: updated_patient?.activity_score,
                current_streak: updated_patient?.current_streak,
                streak_last_date: updated_patient?.streak_last_date
            },
            avatar_changes: avatar_changes.length > 0 ? {
                evolved: true,
                changes: avatar_changes,
                new_avatar_state: updated_patient?.avatar_state
            } : {
                evolved: false
            }
        };
    }

    /**
     * Update patient activity stats
     */
    private async updatePatientStats(patient_id: string, activity_type: string) {
        const patient = await Patient.findById(patient_id);
        if (!patient) {
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate points based on activity type
        let points = 10; // Default points
        switch (activity_type) {
            case 'meditation':
                points = 15;
                break;
            case 'breathing':
                points = 12;
                break;
            case 'journaling':
                points = 15;
                break;
            case 'mood_checkin':
                points = 8;
                break;
            case 'physical':
                points = 20;
                break;
        }

        // Update activity score
        patient.activity_score += points;

        // Update streak
        const last_date = patient.streak_last_date ? new Date(patient.streak_last_date) : null;
        
        if (!last_date) {
            // First activity ever
            patient.current_streak = 1;
            patient.streak_last_date = today;
        } else {
            const last_date_normalized = new Date(last_date);
            last_date_normalized.setHours(0, 0, 0, 0);
            
            const diff_days = Math.floor((today.getTime() - last_date_normalized.getTime()) / (1000 * 60 * 60 * 24));

            if (diff_days === 0) {
                // Same day - no streak change
            } else if (diff_days === 1) {
                // Consecutive day - increment streak
                patient.current_streak += 1;
                patient.streak_last_date = today;
            } else {
                // Streak broken - reset to 1
                patient.current_streak = 1;
                patient.streak_last_date = today;
                
                // Soften avatar
                await avatarService.softenAvatar(patient_id);
            }
        }

        // Update last active
        patient.last_active = new Date();

        await patient.save();

        logger.info(`Patient ${patient_id} stats updated: score=${patient.activity_score}, streak=${patient.current_streak}`);
    }

    /**
     * Get activity statistics
     */
    async getActivityStats(user_id: string) {
        const patient = await Patient.findOne({ user_id });
        if (!patient) {
            throw new NotFoundError('Patient profile not found');
        }

        // Get total activities
        const total_activities = await ActivityCalendar.countDocuments({
            patient_id: patient._id
        });

        // Get completed activities
        const completed_activities = await ActivityCalendar.countDocuments({
            patient_id: patient._id,
            completed_at: { $ne: null }
        });

        // Get activities by type
        const activities_by_type = await ActivityCalendar.aggregate([
            { $match: { patient_id: patient._id, completed_at: { $ne: null } } },
            { $group: { _id: '$activity_type', count: { $sum: 1 } } }
        ]);

        // Get this week's activities
        const week_start = new Date();
        week_start.setDate(week_start.getDate() - week_start.getDay());
        week_start.setHours(0, 0, 0, 0);

        const this_week_completed = await ActivityCalendar.countDocuments({
            patient_id: patient._id,
            completed_at: { $gte: week_start, $ne: null }
        });

        // Get avatar evolution milestones
        const milestones = avatarService.getEvolutionMilestones(
            patient.current_streak,
            patient.activity_score
        );

        return {
            activity_score: patient.activity_score,
            current_streak: patient.current_streak,
            streak_last_date: patient.streak_last_date,
            total_activities,
            completed_activities,
            completion_rate: total_activities > 0 
                ? Math.round((completed_activities / total_activities) * 100) 
                : 0,
            this_week_completed,
            activities_by_type: activities_by_type.map(item => ({
                activity_type: item._id,
                count: item.count
            })),
            avatar_evolution: milestones
        };
    }
}

export const activitiesService = new ActivitiesService();
