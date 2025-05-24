import { Request, Response, NextFunction } from 'express';
import { ShiftTemplateService } from '../services/shift-template.service';
import {
    CreateShiftTemplateDtoSchema,
    UpdateShiftTemplateDtoSchema,
    ApplyShiftTemplateDtoSchema,
} from '../dtos/shift-template.validation';
import { ListShiftTemplatesQueryDtoSchema } from '../dtos/shift-template.validation';
import { MembershipAttributes } from '../models/Membership';
import { AppError } from '../errors/app.errors';


export class ShiftTemplateController {
    private shiftTemplateService: ShiftTemplateService;

    constructor() {
        // ShiftTemplateService pourrait nécessiter StaffAvailabilityService,
        // à injecter ou instancier ici.
        this.shiftTemplateService = new ShiftTemplateService(/* new StaffAvailabilityService() */);
    }

    /**
     * @route POST /api/users/me/establishments/:establishmentId/shift-templates
     * @description Admin creates a new shift template for their establishment.
     */
    public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) { // Devrait être attrapé par middleware ensureMembership(['ADMIN'])
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const validatedBody = CreateShiftTemplateDtoSchema.parse(req.body);

            const shiftTemplate = await this.shiftTemplateService.createShiftTemplate(
                validatedBody,
                actorAdminMembership
            );
            res.status(201).json(shiftTemplate);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route GET /api/users/me/establishments/:establishmentId/shift-templates
     * @description Admin lists all shift templates for their establishment.
     */
    public listForEstablishment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const validatedQuery = ListShiftTemplatesQueryDtoSchema.parse(req.query);

            const result = await this.shiftTemplateService.listShiftTemplatesForEstablishment(
                actorAdminMembership.establishmentId,
                validatedQuery
            );
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route GET /api/users/me/establishments/:establishmentId/shift-templates/:templateId
     * @description Admin gets a specific shift template by ID.
     */
    public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes; // Attaché par ensureMembership
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const templateId = parseInt(req.params.templateId, 10);
            if (isNaN(templateId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid template ID.'));
            }
            // Le middleware loadShiftTemplateAndVerifyOwnership aura déjà validé et attaché req.targetShiftTemplate
            // Mais pour la robustesse du contrôleur, on peut re-passer establishmentId
            const shiftTemplate = await this.shiftTemplateService.getShiftTemplateById(
                templateId,
                actorAdminMembership.establishmentId
            );

            if (!shiftTemplate) {
                return next(new AppError('NotFound', 404, 'Shift template not found or not accessible.'));
            }
            res.status(200).json(shiftTemplate);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route PUT /api/users/me/establishments/:establishmentId/shift-templates/:templateId
     * @description Admin updates an existing shift template.
     */
    public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const templateId = parseInt(req.params.templateId, 10);
            if (isNaN(templateId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid template ID.'));
            }

            const validatedBody = UpdateShiftTemplateDtoSchema.parse(req.body);
            const updatedShiftTemplate = await this.shiftTemplateService.updateShiftTemplate(
                templateId,
                validatedBody,
                actorAdminMembership.establishmentId
            );
            res.status(200).json(updatedShiftTemplate);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route DELETE /api/users/me/establishments/:establishmentId/shift-templates/:templateId
     * @description Admin deletes a shift template.
     */
    public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const templateId = parseInt(req.params.templateId, 10);
            if (isNaN(templateId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid template ID.'));
            }

            await this.shiftTemplateService.deleteShiftTemplate(
                templateId,
                actorAdminMembership.establishmentId
            );
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route POST /api/users/me/establishments/:establishmentId/shift-templates/:templateId/apply
     * @description Admin applies a shift template to specified members for a given period.
     */
    public applyToMemberships = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const templateId = parseInt(req.params.templateId, 10);
            if (isNaN(templateId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid template ID.'));
            }

            const validatedBody = ApplyShiftTemplateDtoSchema.parse(req.body);

            const result = await this.shiftTemplateService.applyShiftTemplateToMemberships(
                templateId,
                validatedBody,
                actorAdminMembership.establishmentId,
                actorAdminMembership.id // L'ID de l'admin qui applique
            );
            res.status(200).json(result); // Retourne { generatedAvailabilitiesCount, errors }
        } catch (error) {
            next(error);
        }
    };
}