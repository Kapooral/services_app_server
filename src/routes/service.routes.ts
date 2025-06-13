// src/routes/service.routes.ts
import { Router } from 'express';
import { ServiceService } from '../services/service.service';
import { AvailabilityService } from '../services/availability.service';
import { ServiceController } from '../controllers/service.controller';
import { requireAuth, requireServiceOwner, ensureMembership } from '../middlewares/auth.middleware';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';
import { MembershipRole } from '../models'

export interface ServiceRouters {
    servicesRootRouter: Router; // Router pour /api/services/:serviceId/...
    myServicesRouter: Router;   // Router pour /users/me/establishments/:establishmentId/services/...
}

export const createServiceRouter = (
    serviceService: ServiceService,
    availabilityService: AvailabilityService
): ServiceRouters => {
    // Routeur pour les actions directes sur un service via son ID
    const servicesRootRouter = Router();
    // Routeur pour les actions sur les services d'un établissement spécifique de l'utilisateur
    const myServicesRouter = Router({ mergeParams: true }); // Important: mergeParams pour récupérer :establishmentId

    const serviceController = new ServiceController(serviceService, availabilityService );

    // --- Routes sous /api/services/:serviceId ---
    servicesRootRouter.put(
        '/:serviceId',
        requireAuth,
        requireServiceOwner, // Vérifie que l'utilisateur possède le service via l'établissement parent
        verifyCsrfToken,
        serviceController.update // OK: serviceController.update existe
    );
    servicesRootRouter.delete(
        '/:serviceId',
        requireAuth,
        requireServiceOwner, // Vérifie l'ownership
        verifyCsrfToken,
        serviceController.delete // OK: serviceController.delete existe
    );
    servicesRootRouter.get(
        '/:serviceId/availability',
        // Pas d'auth requise, c'est public
        serviceController.getAvailability // OK: serviceController.getAvailability existe
    );

    // --- Routes sous /users/me/establishments/:establishmentId/services ---
    myServicesRouter.post(
        '/',
        // Middleware ensureOwnsEstablishment est appliqué sur le routeur parent (my-establishment.routes.ts)
        // requireAuth est aussi appliqué en amont
        ensureMembership([MembershipRole.ADMIN]), // Vérifie le rôle
        verifyCsrfToken,
        serviceController.createForMyEstablishment // Appel Corrigé
    );
    myServicesRouter.get(
        '/',
        // Middlewares ensureOwnsEstablishment et requireAuth appliqués en amont
        ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]), // Vérifie le rôle
        serviceController.getOwnedForMyEstablishment // Appel Corrigé
    );

    return { servicesRootRouter, myServicesRouter };
};