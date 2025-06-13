// src/controllers/daily-adjustment-slot.controller.ts
import { Request, Response, NextFunction } from 'express';
import { DailyAdjustmentSlotService } from '../services/daily-adjustment-slot.service';
import {
    CreateDailyAdjustmentSlotSchema, CreateDailyAdjustmentSlotDto,
    UpdateDailyAdjustmentSlotSchema, UpdateDailyAdjustmentSlotDto,
    ListDailyAdjustmentSlotsQuerySchema, ListDailyAdjustmentSlotsQueryDto,
    BulkUpdateDasDtoSchema, BulkUpdateDasDto,
    BulkDeleteDasDtoSchema, BulkDeleteDasDto
} from '../dtos/planning/daily-adjustment-slot.validation';
import { MembershipAttributes } from '../models/Membership';
import { AppError, ForbiddenError } from '../errors/app.errors';
import { parseNumberId } from '../utils/parser.utils';

export class DailyAdjustmentSlotController {
    constructor(private dasService: DailyAdjustmentSlotService) {}

    private checkActorPermission(actor: MembershipAttributes, establishmentIdFromParams: number, next: NextFunction): boolean {
        if (actor.establishmentId !== establishmentIdFromParams) {
            next(new ForbiddenError('Actor does not belong to the target establishment or action is not permitted.'));
            return false;
        }
        return true;
    }

    public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: CreateDailyAdjustmentSlotDto = CreateDailyAdjustmentSlotSchema.parse(req.body);

            // S'assurer que le slot créé est pour l'établissement de l'acteur/URL
            if (validatedBody.establishmentId !== establishmentIdFromParams) {
                return next(new ForbiddenError('DAS establishmentId in body must match URL establishmentId.'));
            }

            const newDas = await this.dasService.createDas(validatedBody, establishmentIdFromParams);
            res.status(201).json(newDas);
        } catch (error) {
            next(error);
        }
    };

    public listForEstablishment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedQuery: ListDailyAdjustmentSlotsQueryDto = ListDailyAdjustmentSlotsQuerySchema.parse(req.query);
            // Le service filtrera par establishmentIdFromParams s'il n'est pas dans queryDto.establishmentId
            // ou validera la cohérence.
            const queryForService = { ...validatedQuery, establishmentId: establishmentIdFromParams };


            const paginatedDas = await this.dasService.listDas(queryForService /*, establishmentIdFromParams */);
            res.status(200).json(paginatedDas);
        } catch (error) {
            next(error);
        }
    };

    public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const dasId = parseNumberId(req.params.dasId, 'dasId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const das = await this.dasService.getDasById(dasId, establishmentIdFromParams);
            if (!das) {
                return next(new AppError('NotFound', 404, `Daily Adjustment Slot with ID ${dasId} not found in establishment ${establishmentIdFromParams}.`));
            }
            res.status(200).json(das);
        } catch (error) {
            next(error);
        }
    };

    public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const dasId = parseNumberId(req.params.dasId, 'dasId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: UpdateDailyAdjustmentSlotDto = UpdateDailyAdjustmentSlotSchema.parse(req.body);
            const updatedDas = await this.dasService.updateDas(dasId, validatedBody, establishmentIdFromParams);
            res.status(200).json(updatedDas);
        } catch (error) {
            next(error);
        }
    };

    public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const dasId = parseNumberId(req.params.dasId, 'dasId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            await this.dasService.deleteDas(dasId, establishmentIdFromParams);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };

    public bulkUpdate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: BulkUpdateDasDto = BulkUpdateDasDtoSchema.parse(req.body);
            const result = await this.dasService.bulkUpdateDas(validatedBody, establishmentIdFromParams);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    public bulkDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const establishmentIdFromParams = parseNumberId(req.params.establishmentId, 'establishmentId');
            const actor = req.membership as MembershipAttributes;
            if (!this.checkActorPermission(actor, establishmentIdFromParams, next)) return;

            const validatedBody: BulkDeleteDasDto = BulkDeleteDasDtoSchema.parse(req.body);
            const result = await this.dasService.bulkDeleteDas(validatedBody, establishmentIdFromParams);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };
}