import { Request, Response, NextFunction } from 'express';
import db from '../models';
import { AppError } from '../errors/app.errors';
import { ShiftTemplateNotFoundError } from '../errors/planning.errors'; // À créer
import { MembershipNotFoundError } from '../errors/membership.errors';
import { MembershipAttributes } from '../models/Membership'; // Assurez-vous de l'exporter

/**
 * Middleware to load a ShiftTemplate by 'templateId' route parameter
 * and verify that it belongs to the establishment of the authenticated admin.
 * Attaches `req.targetShiftTemplate`.
 * Assumes `req.membership` (actor's admin membership) is already attached.
 */
export const loadShiftTemplateAndVerifyOwnership = (templateIdParamName: string = 'templateId') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const actorAdminMembership = req.membership as MembershipAttributes;
        if (!actorAdminMembership || !actorAdminMembership.establishmentId) {
            return next(new AppError('Forbidden', 403, 'Admin membership context is required.'));
        }

        const templateId = parseInt(req.params[templateIdParamName], 10);
        if (isNaN(templateId)) {
            return next(new AppError('InvalidInput', 400, `Invalid shift template ID parameter: ${templateIdParamName}.`));
        }

        try {
            const shiftTemplate = await db.ShiftTemplate.findByPk(templateId);

            if (!shiftTemplate) {
                return next(new ShiftTemplateNotFoundError());
            }

            if (shiftTemplate.establishmentId !== actorAdminMembership.establishmentId) {
                console.warn(`Admin ${actorAdminMembership.id} from establishment ${actorAdminMembership.establishmentId} ` +
                    `attempted to access shift template ${templateId} from establishment ${shiftTemplate.establishmentId}.`);
                return next(new ShiftTemplateNotFoundError('Shift template not found in your establishment.')); // Ou 403
            }

            req.targetShiftTemplate = shiftTemplate.get({ plain: true });
            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Middleware to load a target Membership by a route parameter (e.g., 'membershipId')
 * and verify that this target Membership belongs to the establishment of the authenticated admin.
 * Attaches `req.targetMembership`.
 * Assumes `req.membership` (actor's admin membership for the current establishment) is already attached.
 */
export const loadTargetMembershipForAdminAction = (targetMembershipIdParamName: string = 'membershipId') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const actorAdminMembership = req.membership as MembershipAttributes;
        if (!actorAdminMembership || !actorAdminMembership.establishmentId) {
            return next(new AppError('Forbidden', 403, 'Admin membership context is required.'));
        }

        const targetMembershipId = parseInt(req.params[targetMembershipIdParamName], 10);
        if (isNaN(targetMembershipId)) {
            return next(new AppError('InvalidInput', 400, `Invalid target membership ID parameter: ${targetMembershipIdParamName}.`));
        }

        try {
            const targetMembership = await db.Membership.findByPk(targetMembershipId);

            if (!targetMembership) {
                return next(new MembershipNotFoundError(`Target membership with ID ${targetMembershipId} not found.`));
            }

            if (targetMembership.establishmentId !== actorAdminMembership.establishmentId) {
                console.warn(`Admin ${actorAdminMembership.id} from establishment ${actorAdminMembership.establishmentId} ` +
                    `attempted to access member ${targetMembershipId} from establishment ${targetMembership.establishmentId}.`);
                return next(new MembershipNotFoundError('Target member not found in your establishment.')); // Ou 403
            }

            req.targetMembership = targetMembership.get({ plain: true });
            next();
        } catch (error) {
            next(error);
        }
    };
};

// Erreurs spécifiques (à mettre dans src/errors/planning.errors.ts)
// export class ShiftTemplateNotFoundError extends AppError {
//     constructor(message: string = 'Shift template not found.') {
//         super('ShiftTemplateNotFoundError', 404, message);
//     }
// }