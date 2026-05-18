import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types/express';
import { activitiesService } from './activities.service';
import {
    GetActivitiesInput
} from '../../validators/activity.validator';

export class ActivitiesController {
    /**
     * GET /activities
     */
    async getActivities(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const filters: GetActivitiesInput = {
                start_date: req.query.start_date as string,
                end_date: req.query.end_date as string,
                activity_type: req.query.activity_type as string,
                status: req.query.status as 'pending' | 'completed'
            };

            const result = await activitiesService.getActivities(user_id, filters);
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /activities/:id
     */
    async getActivityDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const activity_id = req.params.id;
            const result = await activitiesService.getActivityDetail(user_id, activity_id);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /activities/:id/complete
     */
    async completeActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const activity_id = req.params.id;
            const { notes } = req.body;

            const result = await activitiesService.completeActivity(user_id, activity_id, notes);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /activities/stats
     */
    async getActivityStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const user_id = req.user?.user_id;
            if (!user_id) {
                res.status(401).json({
                    success: false,
                    message: 'Unauthorized'
                });
                return;
            }

            const result = await activitiesService.getActivityStats(user_id);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}

export const activitiesController = new ActivitiesController();
