import { Router } from 'express';

import { ServiceService } from '../services/service.service';
import { EstablishmentService } from '../services/establishment.service';
import { AvailabilityService } from '../services/availability.service';
import { ServiceController } from '../controllers/service.controller';
import { EstablishmentController } from '../controllers/establishment.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';
import {MembershipService} from "../services/membership.service";


export const createEstablishmentRouter = (
    establishmentService: EstablishmentService,
    serviceService: ServiceService,
    availabilityService: AvailabilityService,
    membershipService: MembershipService
): Router => {
    const router = Router();

    const serviceController = new ServiceController(serviceService, availabilityService);
    const establishmentController = new EstablishmentController(establishmentService, membershipService);

    router.post('/', requireAuth, verifyCsrfToken, establishmentController.create);

    router.get('/', establishmentController.findPublic);
    router.get('/:id', establishmentController.getPublicById);
    router.get('/:id/services', serviceController.getPublicByEstablishment);

    return router;
};