// src/controllers/MembershipController.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MembershipService } from '../services/membership.service';
import {
    InvitationTokenParamSchema,
    ActivateMembershipSchema,
    ActivateMembershipDto,
    InvitationDetailsDto,
    UpdateMembershipSchema,
    UpdateMembershipDto,
    mapToMembershipDto
} from '../dtos/membership.validation';

import { AppError } from '../errors/app.errors';
import { AuthorizationError } from '../errors/auth.errors';
import { MembershipNotFoundError, InvitationTokenInvalidError, CannotUpdateLastAdminError, CannotDeleteLastAdminError } from '../errors/membership.errors';

export class MembershipController {
    private membershipService: MembershipService;

    constructor(membershipService: MembershipService) {
        this.membershipService = membershipService;
        this.getInvitationDetails = this.getInvitationDetails.bind(this);
        this.activateAfterLogin = this.activateAfterLogin.bind(this);
        this.updateMembership = this.updateMembership.bind(this);
        this.deleteMembership = this.deleteMembership.bind(this);
    }

    // GET /memberships/invitation-details/:token
    async getInvitationDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { token } = InvitationTokenParamSchema.parse(req.params);
            const details: InvitationDetailsDto = await this.membershipService.getInvitationDetails(token);
            res.status(200).json(details);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ statusCode: 400, error: 'Validation Error', message: "Invalid token format.", details: error.errors });
            } else if (error instanceof InvitationTokenInvalidError) {
                res.status(404).json({ statusCode: 404, error: 'Not Found', message: error.message });
            } else {
                next(error);
            }
        }
    }

    // POST /memberships/activate-after-login (Requires Auth)
    async activateAfterLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                throw new AppError('AuthenticationRequired', 401, 'User must be authenticated.');
            }
            const { token }: ActivateMembershipDto = ActivateMembershipSchema.parse(req.body);
            const activatedMembership = await this.membershipService.activateByToken(token, userId);

            // Notifier les admins en arrière plan
            this.membershipService.notifyAdminsMemberJoined(activatedMembership)
                .catch(err => console.error(`Failed background task: notifyAdminsMemberJoined for membership ${activatedMembership.id} after login activation`, err));

            res.status(200).json({
                message: "Invitation accepted and linked to your account successfully.",
                membership: mapToMembershipDto(activatedMembership) // Renvoyer les détails du membership
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ statusCode: 400, error: 'Validation Error', message: "Invalid token format.", details: error.errors });
            } else if (error instanceof InvitationTokenInvalidError) {
                res.status(400).json({ statusCode: 400, error: 'Bad Request', message: error.message }); // 400 car token fourni était invalide
            } else {
                next(error);
            }
        }
    }

    // PATCH /memberships/:membershipId
    async updateMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const membershipId = parseInt(req.params.membershipId, 10);
            if (isNaN(membershipId)) { throw new AppError('InvalidParameter', 400, 'Invalid membership ID.'); }

            const actorMembership = req.membership; // Attaché par middleware ensureAdminOfTargetMembership
            if (!actorMembership) { throw new AppError('MiddlewareError', 500, 'Actor membership data not found.'); }

            const updateDto: UpdateMembershipDto = UpdateMembershipSchema.parse(req.body);

            const updatedMembership = await this.membershipService.updateMembership(membershipId, updateDto, actorMembership);
            const outputDto = mapToMembershipDto(updatedMembership);

            res.status(200).json(outputDto);
        } catch (error) {
            if (error instanceof z.ZodError) {
                const customErrorMessage = error.errors[0]?.message;

                res.status(400).json({
                    statusCode: 400,
                    error: 'Validation Error',
                    message: customErrorMessage || "Invalid input.",
                    details: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
                });
            } else if (error instanceof MembershipNotFoundError) {
                res.status(404).json({ statusCode: 404, error: 'Not Found', message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ statusCode: 403, error: 'Forbidden', message: error.message });
            } else if (error instanceof CannotUpdateLastAdminError) {
                res.status(400).json({ statusCode: 400, error: 'Bad Request', message: error.message }); // 400 pour une règle métier
            } else {
                next(error);
            }
        }
    }

    // DELETE /memberships/:membershipId
    async deleteMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const membershipId = parseInt(req.params.membershipId, 10);
            if (isNaN(membershipId)) { throw new AppError('InvalidParameter', 400, 'Invalid membership ID.'); }

            const actorMembership = req.membership; // Attaché par middleware ensureAdminOfTargetMembership
            if (!actorMembership) { throw new AppError('MiddlewareError', 500, 'Actor membership data not found.'); }

            await this.membershipService.deleteMembership(membershipId, actorMembership);

            res.status(204).send();
        } catch (error) {
            if (error instanceof MembershipNotFoundError) {
                res.status(404).json({ statusCode: 404, error: 'Not Found', message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ statusCode: 403, error: 'Forbidden', message: error.message });
            } else if (error instanceof CannotDeleteLastAdminError) {
                res.status(400).json({ statusCode: 400, error: 'Bad Request', message: error.message }); // 400 pour une règle métier
            } else {
                next(error);
            }
        }
    }
}