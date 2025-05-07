import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import db from '../models';
import Establishment from '../models/Establishment';
import { AccessTokenPayload } from '../dtos/auth.validation';

import { AppError } from '../errors/app.errors';
import { BookingNotFoundError } from '../errors/booking.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';
import { AuthenticationError, AuthorizationError } from '../errors/auth.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';
import { ServiceNotFoundError, ServiceOwnershipError } from '../errors/service.errors';
import { AvailabilityRuleNotFoundError, AvailabilityOverrideNotFoundError, AvailabilityOwnershipError } from '../errors/availability.errors';

import Membership, { MembershipAttributes, MembershipRole, MembershipStatus } from '../models/Membership';

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';
const SUPER_ADMIN = process.env.SUPER_ADMIN_NAME || 'SUPER_ADMIN';
const ESTABLISHMENT_ADMIN_ROLE_NAME = 'ESTABLISHMENT_ADMIN';

async function checkUserPermission(user: Express.Request['user'], requiredPermission: string): Promise<boolean> {
    if (!user) return false;

    if (user.roles.includes(SUPER_ADMIN)) {
        return true;
    }

    // Placeholder pour une logique de permission plus fine basée sur db.Permission si nécessaire
    console.warn(`Permission check failed for user ${user.id}. Required: ${requiredPermission}. Roles: ${user.roles.join(', ')} (Admin check failed).`);
    return false;
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) { return next(new AuthenticationError('Authorization header missing or malformed.')); }
    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
        if (payload.type !== 'access') { return next(new AuthenticationError('Invalid token type provided.')); }

        const user = await db.User.findByPk(payload.userId, {
            include: [{ model: db.Role, as: 'roles', attributes: ['name'], through: { attributes: [] } }],
            attributes: ['id', 'username', 'email', 'is_active']
        });

        if (!user || !user.is_active) { return next(new AuthenticationError('User not found or inactive.')); }
        const roleNames = user.roles ? user.roles.map(role => role.name) : [];
        req.user = { id: user.id, username: user.username, email: user.email, is_active: user.is_active, roles: roleNames };
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return next(new AuthenticationError('Access token expired.'));
        }
        if (error instanceof jwt.JsonWebTokenError) {
            console.warn('JWT Verification Error in requireAuth:', error.message);
            return next(new AuthenticationError('Invalid access token.'));
        }
        console.error('Unexpected error during token verification or user fetch in requireAuth:', error);
        next(error);
    }
};

export const ensureSelf = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return next(new AuthenticationError('Authentication required (ensureSelf).'));
    }

    const requestedUserId = parseInt(req.params.id, 10);
    if (isNaN(requestedUserId)) {
        return next(new AppError('InvalidParameter', 400, 'User ID parameter must be a valid number.'));
    }

    if (req.user.id !== requestedUserId) {
        return next(new AuthorizationError('Forbidden: You can only access your own resource.'));
    }
    next();
};

export const requireRole = (requiredRoleName: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

        if (!req.user.roles || !req.user.roles.includes(requiredRoleName)) {
            if (req.user.roles.includes(SUPER_ADMIN)) {
                console.log(`User ${req.user.id} is Admin, granting access for role ${requiredRoleName}.`);
                return next();
            }
            console.warn(`Authorization failed for user ${req.user.id}. Required role: ${requiredRoleName}. User roles: ${req.user.roles.join(', ')}`);
            return next(new AuthorizationError(`Forbidden: Role '${requiredRoleName}' required.`));
        }
        next();
    };
};

export const requireEstablishmentOwner = (paramName: string = 'id') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

        const establishmentId = parseInt(req.params[paramName], 10);
        if (isNaN(establishmentId)) { return next(new AppError('InvalidParameter', 400, `Invalid establishment ID parameter: ${paramName}`)); }

        try {
            if (!req.user.roles.includes(ESTABLISHMENT_ADMIN_ROLE_NAME)) {
                if (req.user.roles.includes(SUPER_ADMIN)) {
                    console.log(`User ${req.user.id} is Admin, skipping ownership check for establishment ${establishmentId}.`);
                    return next();
                }
                return next(new AuthorizationError('Forbidden: Establishment admin role required.'));
            }

            const establishment = await db.Establishment.findOne({
                where: { id: establishmentId, owner_id: req.user.id },
                attributes: ['id']
            });

            if (!establishment) {
                if (req.user.roles.includes(SUPER_ADMIN)) {
                    console.log(`User ${req.user.id} is Admin, skipping ownership check (establishment ${establishmentId} exists but not owned).`);
                    const targetExists = await db.Establishment.findByPk(establishmentId, { attributes: ['id'] });
                    if (!targetExists) return next(new EstablishmentNotFoundError());
                    return next();
                }
                console.warn(`Authorization failed: User ${req.user.id} tried to access establishment ${establishmentId} but is not the owner.`);
                return next(new EstablishmentNotFoundError(`Establishment not found or not owned by user.`));
            }

            next();

        } catch (error) {
            console.error(`Error in requireEstablishmentOwner middleware for establishment ${establishmentId}:`, error);
            next(error);
        }
    };
};

export const ensureBookingOwnerOrAdmin = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return next(new AuthenticationError('Authentication required.')); }
    const bookingId = parseInt(req.params.bookingId, 10);
    if (isNaN(bookingId)) { return next(new AppError('InvalidParameter', 400, 'Invalid booking ID parameter.')); }

    try {
        const booking = await db.Booking.findByPk(bookingId, {
            attributes: ['id', 'user_id', 'establishment_id'],
            include: [{ model: db.Establishment, as: 'establishment', attributes: ['owner_id'], required: true }]
        });
        if (!booking || !booking.establishment) { return next(new BookingNotFoundError()); }

        const isClientOwner = booking.user_id === req.user.id;
        const isAdminOwner = booking.establishment.owner_id === req.user.id;
        const isSuperAdmin = req.user.roles.includes(SUPER_ADMIN);

        if (isClientOwner || isAdminOwner || isSuperAdmin) { next(); }
        else { return next(new BookingNotFoundError()); }

    } catch (error) {
        if (error instanceof BookingNotFoundError){
            return next(error);
        }
        console.error(`Error in ensureBookingOwnerOrAdmin middleware for booking ${bookingId}:`, error);
        next(error);
    }
};

export const ensureOwnsEstablishment = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

    const establishmentId = parseInt(req.params.establishmentId, 10); // Le param doit s'appeler establishmentId
    if (isNaN(establishmentId)) { return next(new AppError('InvalidParameter', 400, 'Invalid establishment ID parameter.')); }

    if (req.user.roles.includes(SUPER_ADMIN)) {
        const establishmentExists = await db.Establishment.findByPk(establishmentId, { attributes: ['id'] });
        if (!establishmentExists) return next(new EstablishmentNotFoundError());
        return next();
    }

    try {
        const establishment = await db.Establishment.findOne({
            where: { id: establishmentId, owner_id: req.user.id },
            attributes: ['id']
        });

        if (!establishment) {
            console.warn(`Authorization failed or not found: User ${req.user.id} tried to access establishment ${establishmentId}.`);
            return next(new EstablishmentNotFoundError('Establishment not found or not owned by user.'));
        }
        next();

    } catch (error) {
        console.error(`Error in ensureOwnsEstablishment middleware for establishment ${establishmentId}:`, error);
        next(error);
    }
};

export const ensureMembership = (requiredRoles?: MembershipRole[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

        const establishmentIdStr = req.params.establishmentId;
        if (!establishmentIdStr) { return next(new AppError('MissingParameter', 400, 'Establishment ID parameter is missing in the route.')); }

        const establishmentId = parseInt(establishmentIdStr, 10);
        if (isNaN(establishmentId)) { return next(new AppError('InvalidParameter', 400, 'Invalid establishment ID parameter.')); }

        try {
            const membership = await db.Membership.findOne({
                where: {
                    userId: req.user.id,
                    establishmentId: establishmentId,
                    status: MembershipStatus.ACTIVE
                },
            });

            if (!membership) {
                if (req.user.roles.includes(SUPER_ADMIN)) {
                    const establishmentExists = await db.Establishment.findByPk(establishmentId, { attributes: ['id'] });
                    if (!establishmentExists) return next(new EstablishmentNotFoundError());
                    console.log(`User ${req.user.id} is SUPER_ADMIN, granting access to establishment ${establishmentId} despite no active membership.`);
                    return next();
                }

                return next(new AuthorizationError('Forbidden: You are not an active member of this establishment.'));
            }

            if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
                if (req.user.roles.includes(SUPER_ADMIN)) {
                    console.log(`User ${req.user.id} is SUPER_ADMIN, bypassing role check (${requiredRoles.join('/')}) for establishment ${establishmentId}.`);
                } else {
                    console.warn(`Authorization failed for user ${req.user.id} in establishment ${establishmentId}. Required role(s): ${requiredRoles.join('/')}. User role: ${membership.role}`);
                    return next(new AuthorizationError(`Forbidden: Role '${requiredRoles.join(' or ')}' required for this action.`));
                }
            }

            req.membership = membership.get({ plain: true });
            next();

        } catch (error) {
            console.error(`Error in ensureMembership middleware for user ${req.user.id}, establishment ${establishmentId}:`, error);
            next(error);
        }
    };
};

// Middleware pour vérifier si l'utilisateur est ADMIN de l'établissement OU le propriétaire du membership cible
// Utilisé pour GET /establishments/:establishmentId/memberships/:membershipId
export const ensureAdminOrSelfForMembership = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

    // req.membership est attaché par le ensureMembership([ADMIN, STAFF]) qui s'exécute avant pour ce routeur
    const actorMembershipFromPreviousMiddleware = req.membership;

    const establishmentIdStr = req.params.establishmentId;
    const membershipIdStr = req.params.membershipId;
    if (!establishmentIdStr || !membershipIdStr) { return next(new AppError('MissingParameter', 400, 'Establishment ID or Membership ID parameter is missing.')); }

    const establishmentId = parseInt(establishmentIdStr, 10);
    const targetMembershipId = parseInt(membershipIdStr, 10);
    if (isNaN(establishmentId) || isNaN(targetMembershipId)) { return next(new AppError('InvalidParameter', 400, 'Invalid establishment or membership ID.')); }

    try {
        // 1. Vérifier que l'acteur est bien membre de l'établissement spécifié dans l'URL.
        if (actorMembershipFromPreviousMiddleware && actorMembershipFromPreviousMiddleware.establishmentId !== establishmentId) {
            console.warn(`[ensureAdminOrSelf] Mismatch: Actor's active membership establishment (${actorMembershipFromPreviousMiddleware.establishmentId}) does not match URL establishment (${establishmentId}).`);
            return next(new AuthorizationError('Forbidden: Resource access mismatch.'));
        }

        // 2. Trouver le membership cible
        const targetMembership = await db.Membership.findOne({
            where: { id: targetMembershipId, establishmentId: establishmentId },
            attributes: ['id', 'userId', 'establishmentId', 'role', 'status']
        });
        if (!targetMembership) { return next(new MembershipNotFoundError(`Membership ID ${targetMembershipId} not found in establishment ${establishmentId}.`)); }

        // 3. Gérer SUPER_ADMIN (si req.user.roles est disponible et fiable)
        if (req.user.roles.includes(SUPER_ADMIN)) {
            console.log(`User ${req.user.id} is SUPER_ADMIN, granting access to membership ${targetMembershipId}.`);
            req.membership = actorMembershipFromPreviousMiddleware;
            return next();
        }

        // 4. S'assurer que l'acteur a un membership (ce qui devrait être garanti par le ensureMembership précédent)
        if (!actorMembershipFromPreviousMiddleware) {
            console.error("[ensureAdminOrSelf] Critical: actorMembershipFromPreviousMiddleware is undefined, but should have been set by prior ensureMembership.");
            return next(new AuthorizationError('Forbidden: You are not an active member of this establishment.'));
        }

        // 5. Vérifier la permission : Admin OU Soi-même
        const isAdmin = actorMembershipFromPreviousMiddleware.role === MembershipRole.ADMIN;
        // La condition 'isSelf' compare l'ID de l'utilisateur de l'acteur avec l'ID de l'utilisateur du membership cible
        const isSelf = actorMembershipFromPreviousMiddleware.userId === targetMembership.userId;

        if (isAdmin || isSelf) {
            // req.membership est déjà celui de l'acteur, pas besoin de le réassigner si c'est le même objet.
            next();
        } else {
            console.warn(`[ensureAdminOrSelf] AuthZ failed: Actor UserID ${actorMembershipFromPreviousMiddleware.userId} (Role: ${actorMembershipFromPreviousMiddleware.role}) trying to access Target Membership ID ${targetMembership.id} (owned by UserID ${targetMembership.userId})`);
            return next(new AuthorizationError('Forbidden: You can only view your own membership details or you must be an admin of this establishment.'));
        }

    } catch (error) {
        console.error(`Error in ensureAdminOrSelfForMembership middleware for user ${req.user.id}, membership ${targetMembershipId}:`, error);
        next(error);
    }
};
// Middleware pour vérifier si l'utilisateur est ADMIN de l'établissement auquel APPARTIENT le membership cible
// Utilisé pour PATCH /memberships/:membershipId et DELETE /memberships/:membershipId
export const ensureAdminOfTargetMembership = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

    const membershipIdStr = req.params.membershipId; // La route doit avoir :membershipId
    if (!membershipIdStr) { return next(new AppError('MissingParameter', 400, 'Membership ID parameter is missing.')); }

    const membershipId = parseInt(membershipIdStr, 10);
    if (isNaN(membershipId)) { return next(new AppError('InvalidParameter', 400, 'Invalid membership ID.')); }

    try {
        // 1. Trouver le membership cible pour obtenir son establishmentId
        const targetMembership = await db.Membership.findByPk(membershipId, {
            attributes: ['id', 'establishmentId', 'userId', 'role'] // Récupérer les infos nécessaires
        });
        if (!targetMembership) { return next(new MembershipNotFoundError()); } // 404 si la cible n'existe pas du tout

        const targetEstablishmentId = targetMembership.establishmentId;

        // 2. Trouver le membership de l'acteur pour cet establishment cible
        const actorMembership = await db.Membership.findOne({
            where: { userId: req.user.id, establishmentId: targetEstablishmentId, status: MembershipStatus.ACTIVE }
        });

        // 3. Gérer SUPER_ADMIN
        if (req.user.roles.includes(SUPER_ADMIN)) {
            console.log(`User ${req.user.id} is SUPER_ADMIN, granting access to modify membership ${membershipId}.`);
            // Attacher le membership de l'acteur s'il existe
            req.membership = actorMembership?.get({ plain: true });
            // Attacher aussi la cible peut être utile au contrôleur/service
            (req as any).targetMembership = targetMembership.get({ plain: true }); // Utiliser un type plus propre si possible
            return next();
        }

        // 4. Vérifier si l'acteur est membre actif ET admin de l'établissement cible
        if (!actorMembership || actorMembership.role !== MembershipRole.ADMIN) {
            console.warn(`Authorization failed: User ${req.user.id} (Role: ${actorMembership?.role}) trying to modify membership ${membershipId} in establishment ${targetEstablishmentId}. Requires ADMIN.`);
            return next(new AuthorizationError('Forbidden: You must be an administrator of this establishment to perform this action.'));
        }

        // 5. Attacher les infos
        req.membership = actorMembership.get({ plain: true });
        (req as any).targetMembership = targetMembership.get({ plain: true });
        next();

    } catch (error) {
        console.error(`Error in ensureAdminOfTargetMembership middleware for user ${req.user.id}, target membership ${membershipId}:`, error);
        next(error);
    }
};

// Ajouter targetMembership à l'interface Request si on l'attache
declare global {
    namespace Express {
        interface Request {
            // ... (user, membership existants) ...
            targetMembership?: MembershipAttributes; // <-- AJOUTER
        }
    }
}

export const requireServiceOwner = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

    const serviceId = parseInt(req.params.serviceId, 10);
    if (isNaN(serviceId)) { return next(new AppError('InvalidParameter', 400, 'Invalid service ID parameter.')); }

    // Gérer le cas SUPER ADMIN
    if (req.user.roles.includes(SUPER_ADMIN)) {
        console.log(`User ${req.user.id} is Admin, bypassing service ownership check for service ${serviceId}.`);
        const serviceExists = await db.Service.findByPk(serviceId, { attributes: ['id'] });
        if (!serviceExists) return next(new ServiceNotFoundError());
        return next();
    }

    if (!req.user.roles.includes(ESTABLISHMENT_ADMIN_ROLE_NAME)) {
        return next(new AuthorizationError('Forbidden: Establishment admin role required.'));
    }

    try {
        const service = await db.Service.findByPk(serviceId, {
            attributes: ['id', 'establishment_id'],
            include: [{ model: db.Establishment, as: 'establishment', attributes: ['owner_id'], required: true }]
        });

        if (!service || !service.establishment) {
            return next(new ServiceNotFoundError());
        }
        if (service.establishment.owner_id !== req.user.id) {
            console.warn(`Authorization failed: User ${req.user.id} tried to access service ${serviceId} owned by user ${service.establishment.owner_id}.`);
            return next(new ServiceOwnershipError());
        }

        next();
    } catch (error) {
        if (error instanceof ServiceNotFoundError){
            return next(error);
        }
        console.error(`Error in requireServiceOwner middleware for service ${serviceId}:`, error);
        next(error);
    }
};

export const requireRuleOwner = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

    const ruleId = parseInt(req.params.ruleId, 10);
    if (isNaN(ruleId)) { return next(new AppError('InvalidParameter', 400, 'Invalid rule ID parameter.')); }

    if (req.user.roles.includes(SUPER_ADMIN)) {
        const ruleExists = await db.AvailabilityRule.findByPk(ruleId, { attributes: ['id'] });
        if (!ruleExists) return next(new AvailabilityRuleNotFoundError());
        return next();
    }

    if (!req.user.roles.includes(ESTABLISHMENT_ADMIN_ROLE_NAME)) {
        return next(new AuthorizationError('Forbidden: Establishment admin role required.'));
    }

    try {
        const rule = await db.AvailabilityRule.findByPk(ruleId, {
            attributes: ['id', 'establishment_id'],
            include: [{ model: db.Establishment, as: 'establishment', attributes: ['owner_id'], required: true }]
        });

        if (!rule || !rule.establishment) { return next(new AvailabilityRuleNotFoundError()); }

        if (rule.establishment.owner_id !== req.user.id) {
            console.warn(`Authorization failed: User ${req.user.id} tried to access rule ${ruleId} owned by user ${rule.establishment.owner_id}.`);
            return next(new AvailabilityOwnershipError()); // 403
        }
        next();
    } catch (error) {
        if (error instanceof AvailabilityRuleNotFoundError){ return next(error); }
        console.error(`Error in requireRuleOwner middleware for rule ${ruleId}:`, error);
        next(error);
    }
};

export const requireOverrideOwner = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return next(new AuthenticationError('Authentication required.')); }

    const overrideId = parseInt(req.params.overrideId, 10);
    if (isNaN(overrideId)) { return next(new AppError('InvalidParameter', 400, 'Invalid override ID parameter.')); }

    if (req.user.roles.includes(SUPER_ADMIN)) {
        const overrideExists = await db.AvailabilityOverride.findByPk(overrideId, { attributes: ['id'] });
        if (!overrideExists) return next(new AvailabilityOverrideNotFoundError());
        return next();
    }

    if (!req.user.roles.includes(ESTABLISHMENT_ADMIN_ROLE_NAME)) {
        return next(new AuthorizationError('Forbidden: Establishment admin role required.'));
    }

    try {
        const override = await db.AvailabilityOverride.findByPk(overrideId, {
            attributes: ['id', 'establishment_id'],
            include: [{ model: db.Establishment, as: 'establishment', attributes: ['owner_id'], required: true }]
        });

        if (!override || !override.establishment) { return next(new AvailabilityOverrideNotFoundError()); }

        if (override.establishment.owner_id !== req.user.id) {
            console.warn(`Authorization failed: User ${req.user.id} tried to access override ${overrideId} owned by user ${override.establishment.owner_id}.`);
            return next(new AvailabilityOwnershipError()); // 403
        }
        next();
    } catch (error) {
        if (error instanceof AvailabilityOverrideNotFoundError){ return next(error); }
        console.error(`Error in requireOverrideOwner middleware for override ${overrideId}:`, error);
        next(error);
    }
};

/*
export const ensureSelfOrAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return next(new AuthenticationError('Authentication required (ensureSelfOrAdmin).'));
    }

    const requestedUserId = parseInt(req.params.id, 10);
    if (isNaN(requestedUserId)) {
        return next(new AppError('InvalidParameter', 400, 'User ID parameter must be a valid number.'));
    }

    const isAdmin = req.user.roles.includes(SUPER_ADMIN);
    const isSelf = req.user.id === requestedUserId;

    if (isAdmin || isSelf) {
        next();
    } else {
        console.warn(`Authorization failed for user ${req.user.id} accessing resource ${requestedUserId}. Roles: ${req.user.roles.join(', ')}`);
        return next(new AuthorizationError('Forbidden: Insufficient permissions or resource mismatch.'));
    }
};

export const requirePermission = (requiredPermission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AuthenticationError('Authentication required (requirePermission).'));
        }

        const hasPermission = await checkUserPermission(req.user, requiredPermission);

        if (hasPermission) {
            next();
        } else {
            return next(new AuthorizationError(`Forbidden: Requires permission '${requiredPermission}'.`));
        }
    };
};
 */