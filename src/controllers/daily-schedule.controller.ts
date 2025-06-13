// src/controllers/daily-schedule.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DailyScheduleService } from '../services/daily-schedule.service';
import { MembershipAttributes } from '../models/Membership';
import { ForbiddenError } from '../errors/app.errors';
import { parseNumberId } from '../utils/parser.utils';

const GetScheduleQuerySchema = z.object({
    date: z.string().date("Query parameter 'date' must be in YYYY-MM-DD format."),
});
type GetScheduleQueryDto = z.infer<typeof GetScheduleQuerySchema>;

export class DailyScheduleController {
    constructor(private scheduleService: DailyScheduleService) {}

    public getMemberSchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const membershipIdFromParams = parseNumberId(req.params.membershipId, 'membershipId');
            const actor = req.membership as MembershipAttributes;

            if (actor.establishmentId !== establishmentIdFromParams) {
                return next(new ForbiddenError('Actor does not have permission to access schedules for this establishment.'));
            }
            // Le service vérifiera si membershipIdFromParams appartient bien à establishmentIdFromParams
            // lors de la récupération du membre.

            const validatedQuery: GetScheduleQueryDto = GetScheduleQuerySchema.parse(req.query);
            const targetDate = validatedQuery.date;

            const calculatedSchedule = await this.scheduleService.getDailyScheduleForMember(
                membershipIdFromParams,
                targetDate
            );
            res.status(200).json(calculatedSchedule);
        } catch (error) {
            next(error);
        }
    };
}