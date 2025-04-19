// src/services/booking.service.ts
import { ModelCtor, FindOptions, Op, Transaction } from 'sequelize';
import db from '../models';
import Booking, { BookingStatus, PaymentStatus } from '../models/Booking';
import Service from '../models/Service';
import Establishment from '../models/Establishment';
import User from '../models/User';
import { AvailabilityService } from './availability.service';
import { EstablishmentService } from './establishment.service';
import { INotificationService } from './notification.service';
import { CreateBookingDto, UpdateBookingStatusDto } from '../dtos/booking.validation';
import {
    BookingNotFoundError,
    BookingConflictError,
    InvalidBookingOperationError,
    CancellationNotAllowedError,
    InvalidStatusTransitionError,
    BookingOwnershipError
} from '../errors/booking.errors';
import { ServiceNotFoundError } from '../errors/service.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';
import { AppError } from '../errors/app.errors';

const CANCELLATION_WINDOW_HOURS = parseInt(process.env.CANCELLATION_WINDOW_HOURS || '24', 10);

export class BookingService {
    private bookingModel: ModelCtor<Booking>;
    private serviceModel: ModelCtor<Service>;
    private establishmentService: EstablishmentService;
    private availabilityService: AvailabilityService;
    private notificationService: INotificationService;
    private sequelize = db.sequelize;

    constructor(
        bookingModel: ModelCtor<Booking>,
        serviceModel: ModelCtor<Service>,
        establishmentService: EstablishmentService,
        availabilityService: AvailabilityService,
        notificationService: INotificationService
    ) {
        this.bookingModel = bookingModel;
        this.serviceModel = serviceModel;
        this.establishmentService = establishmentService;
        this.availabilityService = availabilityService;
        this.notificationService = notificationService;
    }

    private async checkBookingPermission(bookingId: number, userId: number, requiredRole?: 'CLIENT' | 'ADMIN'): Promise<Booking> {
        const booking = await this.bookingModel.findByPk(bookingId, {
            include: [
                { model: db.Establishment, as: 'establishment', attributes: ['id', 'owner_id'], required: true }
            ]
        });

        if (!booking) { throw new BookingNotFoundError(); }
        if (!booking.establishment) { // Vérification explicite pour TS
            console.error(`Database inconsistency: Booking ${bookingId} has no associated establishment despite 'required: true'.`);
            throw new AppError('DatabaseInconsistency', 500, 'Booking is missing required establishment data.');
        }

        const isClientOwner = booking.user_id === userId;
        const isAdminOwner = booking.establishment.owner_id === userId;

        let hasPermission = false;
        if (requiredRole === 'CLIENT' && isClientOwner) { hasPermission = true; }
        else if (requiredRole === 'ADMIN' && isAdminOwner) { hasPermission = true; }
        else if (!requiredRole && (isClientOwner || isAdminOwner)) { hasPermission = true; }

        if (!hasPermission) {
            let errorMessage = "You do not have permission to access this booking.";
            if (requiredRole === 'CLIENT') errorMessage = "You can only manage your own bookings.";
            if (requiredRole === 'ADMIN') errorMessage = "You can only manage bookings for your own establishment.";
            throw new BookingOwnershipError(errorMessage);
        }
        return booking;
    }

    async createBooking(userId: number, data: CreateBookingDto): Promise<Booking> {
        const { serviceId, startDatetime: startDatetimeStr, userNotes } = data;
        console.log(`[BookingService.createBooking] START - Request for userId: ${userId}, serviceId: ${serviceId}, startDatetimeStr: ${startDatetimeStr}`);

        let startDatetime: Date;
        try {
            startDatetime = new Date(startDatetimeStr);
            if (isNaN(startDatetime.getTime()) || !startDatetimeStr.endsWith('Z')) {
                throw new Error('Invalid or non-UTC date string provided');
            }
        } catch (e) {
            throw new AppError('InvalidInput', 400, 'Invalid start date/time format (ISO 8601 UTC required).');
        }

        const service = await this.serviceModel.findByPk(serviceId, {
            include: [{
                model: db.Establishment, as: 'establishment', required: true,
                attributes: ['id', 'name', 'address_line1', 'city', 'is_validated', 'owner_id']
            }]
        });
        if (!service) { throw new ServiceNotFoundError("Service not found."); }
        if (!service.establishment) { // Vérification TS
            console.error(`Database inconsistency: Service ${serviceId} has no associated establishment despite 'required: true'.`);
            throw new AppError('DatabaseInconsistency', 500, 'Service is missing required establishment data.');
        }
        if (!service.establishment.is_validated) { throw new ServiceNotFoundError("Cannot book service from a non-validated establishment."); }
        if (!service.is_active) { throw new ServiceNotFoundError("Cannot book an inactive service."); }

        if (startDatetime <= new Date()) {
            throw new AppError('BookingInPast', 400, 'Cannot book a time slot in the past.');
        }

        const establishmentId = service.establishment_id;
        const durationMinutes = service.duration_minutes;
        const endDatetime = new Date(startDatetime.getTime() + durationMinutes * 60000);
        const dateString = startDatetime.toISOString().split('T')[0];
        const requestedSlotISO = startDatetime.toISOString();

        let newBooking: Booking;

        try {
            newBooking = await this.sequelize.transaction(async (t: Transaction) => {
                console.log(`[BookingService.createBooking] Entering transaction...`);
                console.log(`[BookingService.createBooking][TX] Checking availability via AvailabilityService for service ${serviceId} on ${dateString}...`);
                let availableSlots: string[];
                try {
                    availableSlots = await this.availabilityService.getAvailableSlots(serviceId, dateString);
                } catch (availError: any) {
                    console.error(`[BookingService.createBooking][TX] Error calling getAvailableSlots: ${availError.message}`, availError.stack);
                    throw new AppError('AvailabilityCheckFailed', 500, 'Could not verify slot availability during transaction.');
                }

                const isSlotAvailable = availableSlots.includes(requestedSlotISO);
                if (!isSlotAvailable) {
                    console.warn(`[BookingService.createBooking][TX] Conflict detected inside transaction. Slot ${requestedSlotISO} no longer available.`);
                    throw new BookingConflictError();
                }

                const now = new Date();
                let priceAtBooking = service.price;
                const isDiscountActive = service.discount_price != null &&
                    (!service.discount_start_date || service.discount_start_date <= now) &&
                    (!service.discount_end_date || service.discount_end_date >= now);
                if (isDiscountActive && typeof service.discount_price === 'number') {
                    priceAtBooking = service.discount_price;
                }

                console.log(`[BookingService.createBooking][TX] Attempting DB create...`);
                const bookingData: any = {
                    user_id: userId, establishment_id: establishmentId, service_id: serviceId,
                    start_datetime: startDatetime, end_datetime: endDatetime,
                    status: BookingStatus.CONFIRMED, price_at_booking: priceAtBooking,
                    currency_at_booking: service.currency, payment_status: PaymentStatus.NOT_PAID,
                    user_notes: userNotes ?? null,
                };
                const created = await this.bookingModel.create(bookingData, { transaction: t });
                console.log(`[BookingService.createBooking][TX] Booking ${created.id} created in DB.`);
                return created;
            }); // Fin transaction

            console.log(`[BookingService.createBooking] Booking ${newBooking.id} committed. Proceeding with post-creation logic (notifications).`);
            console.log(`[Payment Simulation] Booking ${newBooking.id}: Payment of ${newBooking.price_at_booking} ${newBooking.currency_at_booking} to be handled offline.`);

            try {
                console.log(`[BookingService.createBooking] Fetching data for notifications for booking ${newBooking.id}...`);
                // service.establishment est garanti d'exister ici
                const client = await db.User.findByPk(userId, { attributes: ['id', 'username', 'email'] });
                const admin = await db.User.findByPk(service.establishment.owner_id, { attributes: ['email'] });

                if (!client) { console.error(`[BookingService.createBooking] Client User ${userId} not found post-commit.`); }
                if (!admin) { console.error(`[BookingService.createBooking] Admin User ${service.establishment.owner_id} not found post-commit.`); }

                if (client?.email) {
                    this.notificationService.sendBookingConfirmationClient(
                        client.email, newBooking.get({ plain: true }),
                        service.get({ plain: true }), service.establishment.get({ plain: true })
                    ).catch(e => console.error(`[Notification Error] Failed sending confirmation to client ${client.email}: ${e.message}`));
                }
                if (admin?.email && client) {
                    this.notificationService.sendBookingNotificationAdmin(
                        admin.email, newBooking.get({ plain: true }),
                        service.get({ plain: true }), client.get({ plain: true })
                    ).catch(e => console.error(`[Notification Error] Failed sending notification to admin ${admin.email}: ${e.message}`));
                }
            } catch (notifError: any) {
                console.error(`[BookingService.createBooking] Unexpected error fetching data or sending notifications for booking ${newBooking.id}:`, notifError);
            }
            return newBooking;
        } catch (error: any) {
            console.error(`[BookingService.createBooking] Error during transaction or pre-check: ${error.message}`, error.stack);
            if (error instanceof AppError) { throw error; }
            throw new AppError('BookingCreationFailed', 500, `Failed to create booking: ${error.message}`);
        }
    }

    async cancelBookingByUser(bookingId: number, userId: number): Promise<Booking> {
        const booking = await this.checkBookingPermission(bookingId, userId, 'CLIENT');

        if (![BookingStatus.CONFIRMED, BookingStatus.PENDING_CONFIRMATION].includes(booking.status)) {
            throw new InvalidBookingOperationError(`Cannot cancel a booking with status ${booking.status}.`);
        }

        const now = new Date();
        const startTime = booking.start_datetime;
        const timeDiffHours = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (timeDiffHours < CANCELLATION_WINDOW_HOURS) {
            throw new CancellationNotAllowedError(`Cancellation is only allowed up to ${CANCELLATION_WINDOW_HOURS} hours before the appointment.`);
        }

        booking.status = BookingStatus.CANCELLED_BY_USER;
        await booking.save();

        console.log(`[Payment Simulation] Booking ${booking.id} cancelled by user: Initiate refund process if applicable (offline).`);

        try {
            // Vérification explicite pour TypeScript avant d'accéder à owner_id
            if (!booking.establishment) {
                console.error(`[BookingService.cancelBookingByUser] Booking ${booking.id} missing establishment data for admin notification.`);
                // Continuer sans envoyer de notif admin dans ce cas improbable
            } else {
                const admin = await db.User.findByPk(booking.establishment.owner_id, { attributes: ['email'] });
                const service = await db.Service.findByPk(booking.service_id);
                const client = await db.User.findByPk(userId); // On a userId en paramètre

                if (admin?.email && service && client) {
                    this.notificationService.sendBookingCancellationAdmin(
                        admin.email, booking.get({ plain: true }),
                        service.get({ plain: true }), client.get({ plain: true })
                    ).catch(e => console.error(`[Notification Error] Failed sending cancellation notification to admin ${admin.email}: ${e.message}`));
                } else {
                    console.error(`[BookingService.cancelBookingByUser] Missing data for admin notification (Admin: ${!!admin}, Service: ${!!service}, Client: ${!!client}) for Booking ID: ${bookingId}`);
                }
            }
        } catch (notifError: any) {
            console.error(`[BookingService.cancelBookingByUser] Error sending cancellation notification to admin for booking ${booking.id}:`, notifError);
        }
        return booking;
    }

    async updateBookingStatusByAdmin(bookingId: number, adminUserId: number, data: UpdateBookingStatusDto): Promise<Booking> {
        const booking = await this.checkBookingPermission(bookingId, adminUserId, 'ADMIN');
        const { status: newStatus, establishmentNotes } = data;
        const oldStatus = booking.status;

        const validTransitions: { [key in BookingStatus]?: BookingStatus[] } = {
            [BookingStatus.PENDING_CONFIRMATION]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED_BY_ESTABLISHMENT, BookingStatus.CANCELLED_BY_ADMIN],
            [BookingStatus.CONFIRMED]: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW, BookingStatus.CANCELLED_BY_ESTABLISHMENT, BookingStatus.CANCELLED_BY_ADMIN],
            [BookingStatus.CANCELLED_BY_USER]: [],
            [BookingStatus.CANCELLED_BY_ESTABLISHMENT]: [],
            [BookingStatus.COMPLETED]: [],
            [BookingStatus.NO_SHOW]: [],
            [BookingStatus.CANCELLED_BY_ADMIN]: []
        };

        if (!validTransitions[oldStatus]?.includes(newStatus)) {
            throw new InvalidStatusTransitionError(oldStatus, newStatus);
        }

        booking.status = newStatus;
        if (establishmentNotes !== undefined) { booking.establishment_notes = establishmentNotes; }
        await booking.save();

        if ([BookingStatus.CANCELLED_BY_ESTABLISHMENT, BookingStatus.CANCELLED_BY_ADMIN].includes(newStatus)) {
            console.log(`[Payment Simulation] Booking ${booking.id} cancelled by admin: Initiate refund process if applicable (offline).`);
        }

        try {
            const client = await db.User.findByPk(booking.user_id, { attributes: ['email'] });
            if (client?.email) {
                const service = await db.Service.findByPk(booking.service_id);
                if (service) {
                    this.notificationService.sendBookingStatusUpdateClient(
                        client.email, booking.get({ plain: true }), service.get({ plain: true })
                    ).catch(e => console.error(`[Notification Error] Failed sending status update to client ${client.email}: ${e.message}`));
                } else {
                    console.error(`[BookingService.updateBookingStatusByAdmin] Could not find service for client notification (Booking ID: ${bookingId})`);
                }
            }
        } catch (notifError: any) {
            console.error(`[BookingService.updateBookingStatusByAdmin] Error sending status update notification to client for booking ${booking.id}:`, notifError);
        }
        return booking;
    }

    async findUserBookings(userId: number, options: FindOptions = {}): Promise<{ rows: Booking[]; count: number }> {
        const defaultOptions: FindOptions = {
            where: { user_id: userId },
            include: [
                { model: db.Service, as: 'service', attributes: ['id', 'name', 'duration_minutes'] },
                { model: db.Establishment, as: 'establishment', attributes: ['id', 'name', 'city', 'profile_picture_url'] }
            ],
            attributes: { exclude: ['establishment_notes'] },
            order: [['start_datetime', 'DESC']],
        };
        const mergedOptions = { ...defaultOptions, ...options, where: { ...defaultOptions.where, ...options.where } };
        return this.bookingModel.findAndCountAll(mergedOptions);
    }

    async findEstablishmentBookings(adminUserId: number, options: FindOptions = {}): Promise<{ rows: Booking[]; count: number }> {
        const establishments = await this.establishmentService.findEstablishmentsByOwner(adminUserId, { attributes: ['id'] });
        if (!establishments || establishments.length === 0) { return { rows: [], count: 0 }; }
        const establishmentId = establishments[0].id; // Prend le premier établissement

        const defaultOptions: FindOptions = {
            where: { establishment_id: establishmentId },
            include: [
                { model: db.Service, as: 'service', attributes: ['id', 'name'] },
                { model: db.User, as: 'client', attributes: ['id', 'username', 'email', 'profile_picture'] }
            ],
            attributes: { exclude: ['user_notes'] },
            order: [['start_datetime', 'ASC']],
        };
        const mergedOptions = { ...defaultOptions, ...options, where: { ...defaultOptions.where, ...options.where } };
        return this.bookingModel.findAndCountAll(mergedOptions);
    }

    async findBookingById(bookingId: number): Promise<Booking | null> {
        // La permission est supposée vérifiée en amont par ensureBookingOwnerOrAdmin
        const booking = await this.bookingModel.findByPk(bookingId, {
            include: [
                { model: db.Service, as: 'service' },
                { model: db.Establishment, as: 'establishment' },
                { model: db.User, as: 'client', attributes: { exclude: ['password', 'salt'] } }
            ]
        });
        if (!booking) { throw new BookingNotFoundError(); }
        return booking;
    }
}