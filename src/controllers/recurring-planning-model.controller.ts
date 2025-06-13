// src/controllers/recurring-planning-model.controller.ts
import { Request, Response, NextFunction } from 'express';
import { RecurringPlanningModelService } from '../services/recurring-planning-model.service';
import {
    CreateRecurringPlanningModelSchema, CreateRecurringPlanningModelDto,
    UpdateRecurringPlanningModelSchema, UpdateRecurringPlanningModelDto,
    ListRecurringPlanningModelsQuerySchema, ListRecurringPlanningModelsQueryDto
} from '../dtos/planning/recurring-planning-model.validation';
import { MembershipAttributes } from '../models/Membership';
import { AppError, ForbiddenError } from '../errors/app.errors'; // Ajout de ForbiddenError
import { parseNumberId } from '../utils/parser.utils'; // Helper pour parser les IDs d'URL

export class RecurringPlanningModelController {
    constructor(private rpmService: RecurringPlanningModelService) {}

    public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const actor = req.membership as MembershipAttributes;
            if (actor.establishmentId !== establishmentIdFromParams) {
                return next(new ForbiddenError('Actor does not belong to the target establishment or action is not permitted.'));
            }

            const validatedBody: CreateRecurringPlanningModelDto = CreateRecurringPlanningModelSchema.parse(req.body);
            const newRpm = await this.rpmService.createRpm(validatedBody, establishmentIdFromParams);
            res.status(201).json(newRpm);
        } catch (error) {
            next(error);
        }
    };

    public listForEstablishment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const actor = req.membership as MembershipAttributes;
            if (actor.establishmentId !== establishmentIdFromParams) {
                return next(new ForbiddenError('Actor does not belong to the target establishment or action is not permitted.'));
            }

            const validatedQuery: ListRecurringPlanningModelsQueryDto = ListRecurringPlanningModelsQuerySchema.parse(req.query);
            const paginatedRpms = await this.rpmService.listRpmsForEstablishment(validatedQuery, establishmentIdFromParams);
            res.status(200).json(paginatedRpms);
        } catch (error) {
            next(error);
        }
    };

    public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const rpmId = parseNumberId(req.params.rpmId, 'rpmId');
            const actor = req.membership as MembershipAttributes;
            if (actor.establishmentId !== establishmentIdFromParams) {
                return next(new ForbiddenError('Actor does not belong to the target establishment or action is not permitted.'));
            }

            const rpm = await this.rpmService.getRpmById(rpmId, establishmentIdFromParams);
            // RpmNotFoundError est levée par le service si l'ID est introuvable.
            // Le service retourne null si trouvé mais pas dans le bon establishmentId (ce qui est déjà vérifié par le if ci-dessus)
            // Donc, si rpm est null ici, c'est que RpmNotFoundError n'a pas été levée, et le service a explicitement retourné null
            // ce qui ne devrait pas arriver si la logique service/contrôleur est bien alignée pour RpmNotFoundError.
            // Le service devrait lever RpmNotFoundError si l'ID ou l'appartenance à l'establishment échoue.
            // Pour l'instant, on garde la vérification au cas où le service retournerait null dans certains cas non couverts par une exception.
            if (!rpm) {
                return next(new AppError('NotFound', 404, `Recurring Planning Model with ID ${rpmId} not found in establishment ${establishmentIdFromParams}.`));
            }
            res.status(200).json(rpm);
        } catch (error) {
            next(error);
        }
    };

    public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const rpmId = parseNumberId(req.params.rpmId, 'rpmId');
            const actor = req.membership as MembershipAttributes;
            if (actor.establishmentId !== establishmentIdFromParams) {
                return next(new ForbiddenError('Actor does not belong to the target establishment or action is not permitted.'));
            }

            const validatedBody: UpdateRecurringPlanningModelDto = UpdateRecurringPlanningModelSchema.parse(req.body);
            const updatedRpm = await this.rpmService.updateRpm(rpmId, validatedBody, establishmentIdFromParams);
            res.status(200).json(updatedRpm);
        } catch (error) {
            next(error);
        }
    };

    public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const rpmId = parseNumberId(req.params.rpmId, 'rpmId');
            const actor = req.membership as MembershipAttributes;
            if (actor.establishmentId !== establishmentIdFromParams) {
                return next(new ForbiddenError('Actor does not belong to the target establishment or action is not permitted.'));
            }

            await this.rpmService.deleteRpm(rpmId, establishmentIdFromParams);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };
}