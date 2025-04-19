// src/routes/my-establishments-root.routes.ts
import { Router } from 'express';
import { EstablishmentController } from '../controllers/establishment.controller';
import { EstablishmentService } from '../services/establishment.service';
import { AvailabilityService } from '../services/availability.service';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';

// Ce routeur sera monté sous /api/users/me/establishments
export const createMyEstablishmentsRootRouter = (
    establishmentService: EstablishmentService,
    availabilityService: AvailabilityService
): Router => {
    const router = Router();
    const establishmentController = new EstablishmentController(establishmentService);

    // Route pour lister les établissements de l'utilisateur
    router.get('/', establishmentController.listMyEstablishments);

    return router;
};