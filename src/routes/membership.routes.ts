// src/routes/membership.routes.ts
import { Router } from 'express';
import { MembershipController } from '../controllers/membership.controller';
import { TimeOffRequestController } from '../controllers/timeoff-request.controller';
import { MembershipService } from '../services/membership.service';
import { TimeOffRequestService } from '../services/timeoff-request.service';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';
import { requireAuth, ensureAdminOfTargetMembership } from '../middlewares/auth.middleware';
import {
    loadAndVerifyMembershipContext,
    ensureAccessToMembershipResource,
    loadTimeOffRequestAndVerifyAccessDetails
} from '../middlewares/auth.middleware';

import db from '../models';
import { ConsoleNotificationService } from '../services/notification.service';
import { MembershipRole } from '../models';


const notificationServiceInstance = new ConsoleNotificationService();
const membershipService = new MembershipService(db.Membership, db.User, db.Establishment, notificationServiceInstance);
const membershipController = new MembershipController(membershipService);

const timeOffRequestController = new TimeOffRequestController(notificationServiceInstance);

const router = Router();

// --- Routes Membership existantes ---
router.get('/invitation-details/:token', membershipController.getInvitationDetails);
router.post('/activate-after-login', requireAuth, membershipController.activateAfterLogin); // CSRF non nécessaire ici (token + session)

router.patch(
    '/:membershipId',
    requireAuth,
    ensureAdminOfTargetMembership, // Existant: vérifie que l'acteur est Admin de l'établissement du :membershipId cible
    verifyCsrfToken,
    membershipController.updateMembership
);
router.delete(
    '/:membershipId',
    requireAuth,
    ensureAdminOfTargetMembership,
    verifyCsrfToken,
    membershipController.deleteMembership
);


// --- Routes pour TimeOffRequest imbriquées sous /api/memberships/:membershipId/time-off-requests ---
// :membershipId est celui du membre qui possède la demande de congé.

const timeOffRequestSubRouter = Router({ mergeParams: true }); // Pour accéder à :membershipId

// POST /api/memberships/:membershipId/time-off-requests
// L'acteur (req.actorMembershipInTargetContext) doit être le membre lui-même (allowSelf=true) OU un admin (allowedActorRolesInContext=['ADMIN'])
// pour créer une demande pour req.targetMembership.
// Ici, on simplifie : le membre crée pour lui-même.
timeOffRequestSubRouter.post(
    '/',
    ensureAccessToMembershipResource([MembershipRole.ADMIN], true), // Acteur est self (pour targetMembership) ou Admin du contexte
    verifyCsrfToken,
    timeOffRequestController.create // Le contrôleur utilisera req.targetMembership.id pour créer la demande
);

// GET /api/memberships/:membershipId/time-off-requests/:requestId
timeOffRequestSubRouter.get(
    '/:requestId',
    // allowSelfOnResource=true (demandeur peut voir), allowedActorRolesInContext=['ADMIN'] (admin peut voir)
    loadTimeOffRequestAndVerifyAccessDetails('requestId', [MembershipRole.ADMIN], true),
    timeOffRequestController.getById
);

// PATCH /api/memberships/:membershipId/time-off-requests/:requestId (process request)
timeOffRequestSubRouter.patch(
    '/:requestId',
    // Seul un ADMIN de l'établissement de la demande peut traiter
    loadTimeOffRequestAndVerifyAccessDetails('requestId', [MembershipRole.ADMIN], false),
    verifyCsrfToken,
    timeOffRequestController.processRequest
);

// DELETE /api/memberships/:membershipId/time-off-requests/:requestId (cancel request)
timeOffRequestSubRouter.delete(
    '/:requestId',
    loadTimeOffRequestAndVerifyAccessDetails('requestId', [MembershipRole.ADMIN], true),
    verifyCsrfToken,
    timeOffRequestController.cancelRequest
);

// Montage du sous-routeur sous le middleware qui établit le contexte
router.use(
    '/:membershipId/time-off-requests',
    requireAuth,
    loadAndVerifyMembershipContext('membershipId'),
    timeOffRequestSubRouter
);

export default router;