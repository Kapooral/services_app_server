// src/routes/user.routes.ts
import { Router } from 'express';
import multer from 'multer';

// Importer les services nécessaires
import { UserService } from '../services/user.service';
import { BookingService } from '../services/booking.service';
import { EstablishmentService } from '../services/establishment.service';
import { ServiceService } from '../services/service.service';
import { AvailabilityService } from '../services/availability.service';
import { fileService } from '../services/file.service'; // Pour l'upload de photo de profil user

// Importer les contrôleurs
import { UserController } from '../controllers/user.controller';
import { BookingController } from '../controllers/booking.controller'; // Pour /users/me/bookings

// Importer les middlewares
import { requireAuth, ensureSelf, requireRole } from '../middlewares/auth.middleware';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';

// Importer les créateurs de sous-routeurs pour /me/establishments/...
import { createMyEstablishmentsRootRouter } from './my-establishments-root.routes';
import { createMyEstablishmentRouter } from './my-establishment.routes';

// Options Multer pour la photo de profil utilisateur
const profilePictureUpload = multer(fileService.multerOptions).single('profilePicture');
const ESTABLISHMENT_ADMIN_ROLE_NAME = 'ESTABLISHMENT_ADMIN'; // Si besoin pour des routes user spécifiques

export const createUserRouter = (
    // Déclarer toutes les dépendances nécessaires
    userService: UserService,
    bookingService: BookingService,
    establishmentService: EstablishmentService,
    serviceService: ServiceService,
    availabilityService: AvailabilityService
): Router => {
    const router = Router();
    const userController = new UserController(userService);
    const bookingController = new BookingController(bookingService); // Nécessaire pour /users/me/bookings

    // --- Routes Publiques (ou semi-publiques) ---
    router.post('/', userController.create); // Création de compte
    router.post('/activate-account', userController.activateAccount); // Activation via token email
    router.post('/request-password-reset', userController.requestPasswordReset); // Demande de reset
    router.post('/validate-reset-token', userController.validateResetToken); // Validation du token de reset
    router.post('/perform-password-reset', userController.performPasswordReset); // Exécution du reset

    // --- Routes Protégées pour l'utilisateur connecté (/me) ---
    router.get('/me', requireAuth, userController.getMe);
    router.get('/me/bookings', requireAuth, bookingController.getUserBookings); // Récupérer ses propres réservations

    // Montage du routeur pour /me/establishments (liste)
    const myEstablishmentsRootRouter = createMyEstablishmentsRootRouter(establishmentService, availabilityService);
    router.use('/me/establishments', requireAuth, requireRole(ESTABLISHMENT_ADMIN_ROLE_NAME), myEstablishmentsRootRouter);

    // Montage du routeur pour /me/establishments/:establishmentId (détail et actions)
    const myEstablishmentRouter = createMyEstablishmentRouter(establishmentService, serviceService, availabilityService, bookingService);
    // Note: Le middleware requireAuth et requireRole(ESTABLISHMENT_ADMIN_ROLE_NAME) est déjà appliqué par le montage précédent
    // Le middleware ensureOwnsEstablishment est appliqué DANS myEstablishmentRouter
    router.use('/me/establishments/:establishmentId', myEstablishmentRouter);

    // --- Routes Protégées pour un utilisateur spécifique (via /:id) ---
    // Middleware ensureSelf garantit que req.user.id === req.params.id
    // Attention: Ces routes sont similaires à celles sous /me, vérifier s'il y a redondance ou besoin spécifique
    router.get('/:id', requireAuth, ensureSelf, userController.getById); // Récupérer son propre profil par ID
    router.patch('/:id/profile', requireAuth, ensureSelf, verifyCsrfToken, userController.updateProfile);
    router.patch('/:id/password', requireAuth, ensureSelf, verifyCsrfToken, userController.updatePassword);
    router.patch('/:id/email', requireAuth, ensureSelf, verifyCsrfToken, userController.updateEmail);
    router.delete('/:id', requireAuth, ensureSelf, verifyCsrfToken, userController.delete);

    // Upload/Delete photo de profil utilisateur (associé à l'ID de l'utilisateur)
    router.patch('/:id/profile-picture', requireAuth, ensureSelf, verifyCsrfToken, profilePictureUpload, userController.updateProfilePicture);
    router.delete('/:id/profile-picture', requireAuth, ensureSelf, verifyCsrfToken, userController.deleteProfilePicture);

    // (Ré)envoyer la vérification email (si email changé et non vérifié, ou pour revérifier)
    router.post('/:id/request-email-verification', requireAuth, ensureSelf, verifyCsrfToken, userController.requestEmailVerification);
    // La route pour vérifier le code email après changement n'est pas explicitement définie ici,
    // elle pourrait être POST /users/:id/verify-email ou intégrée ailleurs. À clarifier si besoin.

    return router;
};