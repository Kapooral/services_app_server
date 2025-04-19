import { Router } from 'express';

import { ServiceService } from '../services/service.service';
import { EstablishmentService } from '../services/establishment.service';
import { AvailabilityService } from '../services/availability.service';
import { ServiceController } from '../controllers/service.controller';
import { EstablishmentController } from '../controllers/establishment.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';


export const createEstablishmentRouter = (
    establishmentService: EstablishmentService,
    serviceService: ServiceService,
    availabilityService: AvailabilityService,
): Router => {
    const router = Router();

    const serviceController = new ServiceController(serviceService, availabilityService);
    const establishmentController = new EstablishmentController(establishmentService);

    router.post('/', requireAuth, verifyCsrfToken, establishmentController.create);

    router.get('/', establishmentController.findPublic);
    router.get('/:id', establishmentController.getPublicById);
    router.get('/:id/services', serviceController.getPublicByEstablishment);

    return router;
};