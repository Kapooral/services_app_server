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
import { fileService } from '../services/file.service';
import { MembershipService } from '../services/membership.service';

import { ensureOwnsEstablishment, requireRole } from '../middlewares/auth.middleware';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';
import { ensureMembership, ensureAdminOrSelfForMembership, ensureCanListMemberTimeOffRequestsOnEstablishmentRoute } from '../middlewares/auth.middleware';

import { MembershipRole } from '../models'
import {TimeOffRequestController} from "../controllers/timeoff-request.controller";
import {ConsoleNotificationService} from "../services/notification.service";
import shiftTemplateAdminRouter from './planning/shift-template.routes';
import staffAvailabilityAdminRouter from './planning/staff-availability.routes';

const ESTABLISHMENT_ADMIN_ROLE_NAME = 'ESTABLISHMENT_ADMIN';
const establishmentPictureUpload = multer(fileService.multerOptions).single('profilePicture');

export const createMyEstablishmentRouter = (
    establishmentService: EstablishmentService,
    serviceService: ServiceService,
    availabilityService: AvailabilityService,
    bookingService: BookingService,
    membershipService: MembershipService
): Router => {
    const router = Router({ mergeParams: true }); // Important: mergeParams pour récupérer :establishmentId

    const establishmentController = new EstablishmentController(establishmentService, membershipService);
    const serviceController = new ServiceController(serviceService, availabilityService);
    const bookingController = new BookingController(bookingService);

    const notificationServiceInstance = new ConsoleNotificationService()
    const timeOffRequestController = new TimeOffRequestController(notificationServiceInstance);

    // Appliquer le middleware d'ownership à toutes les routes de ce routeur
    router.use(ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]));

    // --- Routes pour l'établissement spécifique ---
    router.get('/', ensureOwnsEstablishment, establishmentController.getMyEstablishmentById);
    router.put('/', ensureOwnsEstablishment, verifyCsrfToken, establishmentController.updateMyEstablishment);
    router.post('/request-validation', ensureOwnsEstablishment, verifyCsrfToken, establishmentController.requestMyValidation);
    router.patch('/profile-picture', ensureOwnsEstablishment, verifyCsrfToken, establishmentPictureUpload, establishmentController.updateMyProfilePicture);
    router.delete('/profile-picture', ensureOwnsEstablishment, verifyCsrfToken, establishmentController.deleteMyProfilePicture);

    // --- Routes pour les sous-ressources ---
    // Services
    router.post('/services', ensureMembership([MembershipRole.ADMIN]), verifyCsrfToken, serviceController.createForMyEstablishment);
    router.get('/services', ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]), serviceController.getOwnedForMyEstablishment);
    router.get('/services/:serviceId', ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]), serviceController.getOwnedServiceById);

    // Disponibilité - Règles
    router.post('/availability/rules', ensureMembership([MembershipRole.ADMIN]), verifyCsrfToken, establishmentController.createMyRule);
    router.get('/availability/rules', ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]), establishmentController.getMyRules);

    // Disponibilité - Overrides
    router.post('/availability/overrides', ensureMembership([MembershipRole.ADMIN]), verifyCsrfToken, establishmentController.createMyOverride);
    router.get('/availability/overrides', ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]), establishmentController.getMyOverrides);

    // Bookings
    router.get('/bookings', ensureMembership([MembershipRole.ADMIN, MembershipRole.STAFF]), bookingController.getEstablishmentBookings);

    router.get('/memberships', ensureMembership([MembershipRole.ADMIN]), establishmentController.getMemberships);
    router.get('/memberships/:membershipId', ensureAdminOrSelfForMembership, establishmentController.getMembershipById);
    router.get('/memberships/:membershipId/time-off-requests', ensureCanListMemberTimeOffRequestsOnEstablishmentRoute, timeOffRequestController.listForMember);
    router.post('/memberships/invite', ensureMembership([MembershipRole.ADMIN]), verifyCsrfToken, establishmentController.inviteMember);

    router.get('/time-off-requests', ensureMembership([MembershipRole.ADMIN]), timeOffRequestController.listForEstablishment);

    router.use('/planning-shift-templates', ensureMembership([MembershipRole.ADMIN]), shiftTemplateAdminRouter);
    router.use('/staff-availabilities-management', ensureMembership([MembershipRole.ADMIN]), staffAvailabilityAdminRouter);

    return router;
};