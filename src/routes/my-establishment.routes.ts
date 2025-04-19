// src/routes/my-establishment.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { EstablishmentController } from '../controllers/establishment.controller';
import { ServiceController } from '../controllers/service.controller';
import { BookingController } from '../controllers/booking.controller';
import { EstablishmentService } from '../services/establishment.service';
import { ServiceService } from '../services/service.service';
import { AvailabilityService } from '../services/availability.service';
import { BookingService } from '../services/booking.service';
import { ensureOwnsEstablishment, requireRole } from '../middlewares/auth.middleware'; // Utiliser ensureOwnsEstablishment
import { verifyCsrfToken } from '../middlewares/csrf.middleware';
import { fileService } from '../services/file.service';

const ESTABLISHMENT_ADMIN_ROLE_NAME = 'ESTABLISHMENT_ADMIN';
const establishmentPictureUpload = multer(fileService.multerOptions).single('profilePicture');

// Ce routeur sera monté sous /api/users/me/establishments/:establishmentId
// Il attend establishmentId dans req.params
export const createMyEstablishmentRouter = (
    establishmentService: EstablishmentService,
    serviceService: ServiceService,
    availabilityService: AvailabilityService,
    bookingService: BookingService
): Router => {
    const router = Router({ mergeParams: true });

    const establishmentController = new EstablishmentController(establishmentService);
    const serviceController = new ServiceController(serviceService, availabilityService);
    const bookingController = new BookingController(bookingService);

    router.use(ensureOwnsEstablishment);

    // --- Routes pour l'établissement spécifique ---
    router.get('/', establishmentController.getMyEstablishmentById);
    router.put('/', verifyCsrfToken, establishmentController.updateMyEstablishment);
    router.post('/request-validation', verifyCsrfToken, establishmentController.requestMyValidation);
    router.patch('/profile-picture', verifyCsrfToken, establishmentPictureUpload, establishmentController.updateMyProfilePicture);
    router.delete('/profile-picture', verifyCsrfToken, establishmentController.deleteMyProfilePicture);

    // --- Routes pour les sous-ressources ---
    // Services
    router.post('/services', verifyCsrfToken, serviceController.createForMyEstablishment);
    router.get('/services', serviceController.getOwnedForMyEstablishment);

    // Disponibilité - Règles
    router.post('/availability/rules', verifyCsrfToken, establishmentController.createMyRule);
    router.get('/availability/rules', establishmentController.getMyRules);

    // Disponibilité - Overrides
    router.post('/availability/overrides', verifyCsrfToken, establishmentController.createMyOverride);
    router.get('/availability/overrides', establishmentController.getMyOverrides);

    // Bookings
    router.get('/bookings', bookingController.getEstablishmentBookings);

    return router;
};

// Note: Les routes DELETE/PUT pour rules/overrides/services par leur ID propre
// restent dans leurs routeurs respectifs (availability.routes.ts, service.routes.ts)
// car leur URL n'est pas naturellement imbriquée sous /me/establishments/:id