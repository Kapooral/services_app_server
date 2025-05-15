// src/controllers/TimeOffRequestController.ts
import { NextFunction, Request, Response } from 'express';
import { TimeOffRequestService } from '../services/timeoff-request.service';

import {
    CreateTimeOffRequestDtoSchema,
    ProcessTimeOffRequestDtoSchema,
    CancelTimeOffRequestDtoSchema,
    ListTimeOffRequestsQueryDtoSchema
} from '../dtos/timeoff-request.validation';

import { MembershipAttributes } from '../models/Membership';
import { INotificationService } from '../services/notification.service';

// Supposons une factory ou une instance globale du NotificationService
// import notificationServiceInstance from '../services/notification.service.instance'; // Exemple

export class TimeOffRequestController {
    private timeOffRequestService: TimeOffRequestService;

    constructor(notificationService: INotificationService) { // Injection du service de notification
        this.timeOffRequestService = new TimeOffRequestService(notificationService);
    }

    /**
     * @route POST /api/memberships/:membershipId/time-off-requests
     * @description Create a new time off request for the specified membership.
     * Actor must be the member themselves or an admin of their establishment.
     */
    public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorMembership = req.membership as MembershipAttributes;
            const targetMembershipId = parseInt(req.params.membershipId, 10);

            if (actorMembership.role !== 'ADMIN' && actorMembership.id !== targetMembershipId) {
                res.status(403).json({ message: "Forbidden: You can only create time off requests for yourself unless you are an admin." });
                return;
            }

            const validatedBody = CreateTimeOffRequestDtoSchema.parse(req.body);

            const timeOffRequest = await this.timeOffRequestService.createTimeOffRequest(
                validatedBody,
                actorMembership
            );
            res.status(201).json(timeOffRequest);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route GET /api/users/me/establishments/:establishmentId/memberships/:membershipId/time-off-requests
     * @description List time off requests for a specific member within an establishment.
     * Actor must be the member themselves or an admin of the establishment.
     */
    public listForMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorMembership = req.membership as MembershipAttributes;
            const establishmentId = parseInt(req.params.establishmentId, 10);
            const targetMembershipId = parseInt(req.params.membershipId, 10); // Renommer pour clarté vs :requestId

            const validatedQuery = ListTimeOffRequestsQueryDtoSchema.parse(req.query);

            const result = await this.timeOffRequestService.listTimeOffRequestsForMember(
                establishmentId,
                targetMembershipId,
                validatedQuery
            );
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route GET /api/memberships/:membershipId/time-off-requests/:requestId
     * @description Get details of a specific time off request.
     * Actor must be the requesting member or an admin of their establishment.
     */
    public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // const actorMembership = req.membership as MembershipAttributes; // Non requis si le middleware gère l'accès
            const requestId = parseInt(req.params.requestId, 10);
            // Le middleware loadTimeOffRequestAndEnsureAccess aura déjà chargé et validé l'accès.
            // req.targetTimeOffRequest est disponible grâce au middleware.
            // const timeOffRequest = req.targetTimeOffRequest as TimeOffRequestAttributes;

            // Alternativement, si le middleware ne fait que valider et ne charge pas :
            const timeOffRequest = await this.timeOffRequestService.getTimeOffRequestById(
                requestId
                // actorMembership // Le service n'en a pas besoin si le middleware a déjà vérifié l'accès
            );
            res.status(200).json(timeOffRequest);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route PATCH /api/memberships/:membershipId/time-off-requests/:requestId
     * @description Process (approve/reject) a time off request. Admin only.
     */
    public processRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorMembership = req.membership as MembershipAttributes; // Admin
            const requestId = parseInt(req.params.requestId, 10);
            // Le middleware loadTimeOffRequestAndEnsureAccess(..., ['ADMIN']) aura déjà validé.

            const validatedBody = ProcessTimeOffRequestDtoSchema.parse(req.body);

            const updatedTimeOffRequest = await this.timeOffRequestService.processTimeOffRequest(
                requestId,
                validatedBody,
                actorMembership
            );
            res.status(200).json(updatedTimeOffRequest);
        } catch (error) {
            next(error);
        }
    };

    /**
     * @route DELETE /api/memberships/:membershipId/time-off-requests/:requestId
     * @description Cancel a time off request.
     * Member can cancel if PENDING. Admin can cancel if PENDING or APPROVED.
     */
    public cancelRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const actorMembership = req.membership as MembershipAttributes;
            const requestId = parseInt(req.params.requestId, 10);
            // Le middleware loadTimeOffRequestAndEnsureAccess(..., ['ANY']) aura déjà validé.

            const validatedBody = CancelTimeOffRequestDtoSchema.parse(req.body);

            const cancelledTimeOffRequest = await this.timeOffRequestService.cancelTimeOffRequest(
                requestId,
                validatedBody,
                actorMembership
            );
            res.status(200).json(cancelledTimeOffRequest);
        } catch (error) {
            next(error);
        }
    };
}