import { Router } from 'express';
import { BookingService } from '../services/booking.service';
import { BookingController } from '../controllers/booking.controller';
import { requireAuth, requireRole, ensureBookingOwnerOrAdmin } from '../middlewares/auth.middleware';
import { verifyCsrfToken } from '../middlewares/csrf.middleware';

const ESTABLISHMENT_ADMIN_ROLE_NAME = 'ESTABLISHMENT_ADMIN';

export const createBookingRouter = (bookingService: BookingService): Router => {
    const router = Router();

    const bookingController = new BookingController(bookingService);

    router.post('/', requireAuth, verifyCsrfToken, bookingController.create);
    router.get('/:bookingId', requireAuth, ensureBookingOwnerOrAdmin, bookingController.getBookingById);
    router.patch('/:bookingId/cancel', requireAuth, verifyCsrfToken, bookingController.cancelByUser);
    router.patch('/:bookingId', requireAuth, requireRole(ESTABLISHMENT_ADMIN_ROLE_NAME), verifyCsrfToken, bookingController.updateStatusByAdmin);

    return router;
};