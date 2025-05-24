import { Request, Response, NextFunction } from 'express';
import { StaffAvailabilityService } from '../services/staff-availability.service';
import {
    CreateStaffAvailabilityDtoSchema,
    UpdateStaffAvailabilityDtoSchema,
    ListStaffAvailabilitiesQueryDtoSchema,
} from '../dtos/staff-availability.validation';
import { MembershipAttributes } from '../models/Membership';
import { AppError } from '../errors/app.errors';

export class StaffAvailabilityController {
    private staffAvailabilityService: StaffAvailabilityService;

    constructor() { // Le service n'a pas de dépendances complexes pour l'instant
        this.staffAvailabilityService = new StaffAvailabilityService();
    }

    /**
     * @route POST /api/users/me/establishments/:establishmentId/memberships/:membershipId/availabilities
     * @description Admin creates a staff availability rule for a specific member.
     */
    public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes; // Attaché par ensureMembership(['ADMIN'])
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const targetMembershipId = parseInt(req.params.membershipId, 10);
            if (isNaN(targetMembershipId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid target membership ID.'));
            }

            const validatedBody = CreateStaffAvailabilityDtoSchema.parse(req.body);

            const staffAvailability = await this.staffAvailabilityService.createStaffAvailability(
                validatedBody,
                actorAdminMembership,
                targetMembershipId
            );
            res.status(201).json(staffAvailability);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route GET /api/users/me/establishments/:establishmentId/availabilities/:availabilityId
     * @description Admin gets a specific staff availability rule by its ID (within their establishment).
     * Note: This route implies the availabilityId is unique across the establishment, or the service
     * correctly filters by establishmentId.
     */
    public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const availabilityId = parseInt(req.params.availabilityId, 10);
            if (isNaN(availabilityId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid availability ID.'));
            }

            const staffAvailability = await this.staffAvailabilityService.getStaffAvailabilityById(
                availabilityId,
                actorAdminMembership.establishmentId
            );

            if (!staffAvailability) {
                // Le service retourne null si non trouvé OU pas dans le bon establishment
                return next(new AppError('NotFound', 404, 'Staff availability rule not found or not accessible.'));
            }
            res.status(200).json(staffAvailability);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/availabilities
     * @description Admin lists staff availability rules for a specific member.
     */
    public listForMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const targetMembershipId = parseInt(req.params.membershipId, 10);
            if (isNaN(targetMembershipId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid target membership ID.'));
            }

            const validatedQuery = ListStaffAvailabilitiesQueryDtoSchema.parse(req.query);

            const result = await this.staffAvailabilityService.listStaffAvailabilitiesForMember(
                targetMembershipId,
                actorAdminMembership.establishmentId, // Admin's establishment ID
                validatedQuery
            );
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route PATCH /api/users/me/establishments/:establishmentId/availabilities/:availabilityId
     * @description Admin updates a specific staff availability rule.
     */
    public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const availabilityId = parseInt(req.params.availabilityId, 10);
            if (isNaN(availabilityId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid availability ID.'));
            }

            const validatedBody = UpdateStaffAvailabilityDtoSchema.parse(req.body);
            const updatedStaffAvailability = await this.staffAvailabilityService.updateStaffAvailability(
                availabilityId,
                validatedBody,
                actorAdminMembership.establishmentId,
                actorAdminMembership.id // Pass admin's membership ID for createdBy/lastModifiedBy logic
            );
            res.status(200).json(updatedStaffAvailability);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route DELETE /api/users/me/establishments/:establishmentId/availabilities/:availabilityId
     * @description Admin deletes a specific staff availability rule.
     */
    public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorAdminMembership = req.membership as MembershipAttributes;
            if (!actorAdminMembership) {
                return next(new AppError('Forbidden', 403, 'Admin context not found.'));
            }

            const availabilityId = parseInt(req.params.availabilityId, 10);
            if (isNaN(availabilityId)) {
                return next(new AppError('InvalidInput', 400, 'Invalid availability ID.'));
            }

            await this.staffAvailabilityService.deleteStaffAvailability(
                availabilityId,
                actorAdminMembership.establishmentId
            );
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    };
}