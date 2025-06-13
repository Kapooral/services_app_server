// src/services/booking.service.ts
import { ModelCtor, FindOptions, Op, Transaction, Includeable, WhereOptions, OrderItem, UniqueConstraintError as SequelizeUniqueConstraintError } from 'sequelize';
import db from '../models';
import Booking, { BookingStatus, PaymentStatus, BookingAttributes } from '../models/Booking';
import Service from '../models/Service';

import User from '../models/User';
import { AvailabilityService } from './availability.service';
import { EstablishmentService } from './establishment.service';
import { INotificationService } from './notification.service';
import { CreateBookingDto, UpdateBookingStatusDto, GetEstablishmentBookingsQueryDto } from '../dtos/booking.validation';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

import {
    BookingNotFoundError,
    BookingConflictError,
    InvalidBookingOperationError,
    CancellationNotAllowedError,
    InvalidStatusTransitionError,
    BookingOwnershipError
} from '../errors/booking.errors';
import { ServiceNotFoundError } from '../errors/service.errors';
import { AppError } from '../errors/app.errors';

const adminBookingIncludes: Includeable[] = [
    {
        model: db.User, as: 'client',
        attributes: ['id', 'username', 'email', 'profile_picture']
    },
    {
        model: db.Service, as: 'service',
        attributes: ['id', 'name', 'duration_minutes']
    },
    {
        model: db.Establishment, as: 'establishment',
        attributes: ['id', 'owner_id', 'name']
    }
];


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
        // Fetching with required relations for checks
        const booking = await this.bookingModel.findByPk(bookingId, {
            include: [
                // Establishment needed for owner check
                { model: db.Establishment, as: 'establishment', attributes: ['id', 'owner_id'], required: true },
                // Service needed for deadline check
                { model: db.Service, as: 'service', attributes: ['id', 'cancellation_deadline_minutes'], required: true }
            ]
        });

        if (!booking) { throw new BookingNotFoundError(); }
        // Type guards - required: true should prevent this, but good practice
        if (!booking.establishment) {
            console.error(`Database inconsistency: Booking ${bookingId} has no associated establishment despite 'required: true'.`);
            throw new AppError('DatabaseInconsistency', 500, 'Booking is missing required establishment data.');
        }
        if (!booking.service) {
            console.error(`Database inconsistency: Booking ${bookingId} has no associated service despite 'required: true'.`);
            throw new AppError('DatabaseInconsistency', 500, 'Booking is missing required service data.');
        }

        const isClientOwner = booking.user_id === userId;
        // Access owner_id safely now
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
        return booking; // Return the booking instance with relations loaded for checks
    }

    async createBooking(userId: number, data: CreateBookingDto): Promise<Booking> {
        const { serviceId, startDatetime: startDatetimeStr, userNotes } = data;
        console.log(`[BookingService.createBooking] START - Request for userId: ${userId}, serviceId: ${serviceId}, startDatetimeStr: ${startDatetimeStr}`);

        // --- Vérifications PRÉ-TRANSACTION ---
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
            include: [{ model: db.Establishment, as: 'establishment', required: true, attributes: ['id', 'name', 'address_line1', 'city', 'is_validated', 'owner_id'] }],
            attributes: { include: ['auto_confirm_bookings', 'price', 'currency', 'discount_price', 'discount_start_date', 'discount_end_date', 'duration_minutes', 'establishment_id', 'is_active'] } // Assurer is_active est inclus
        });

        if (!service) { throw new ServiceNotFoundError("Service not found."); }
        if (!service.establishment) {
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
        const dateString = startDatetime.toISOString().split('T')[0]; // Pour getAvailableSlots
        const requestedSlotISO = startDatetime.toISOString(); // Pour comparaison
        let newBooking: Booking;

        try {
            newBooking = await this.sequelize.transaction(async (t: Transaction) => {
                console.log(`[BookingService.createBooking] Entering transaction...`);
                console.log(`[BookingService.createBooking][TX] Checking availability via AvailabilityService for service ${serviceId} on ${dateString}...`);
                let availableSlots: string[];
                try {
                    availableSlots = await this.availabilityService.getAvailableSlots(serviceId, dateString /*, { transaction: t } */ );
                } catch (availError: any) {
                    console.error(`[BookingService.createBooking][TX] Error calling getAvailableSlots: ${availError.message}`, availError.stack);
                    throw new AppError('AvailabilityCheckFailed', 500, 'Could not verify slot availability during transaction.');
                }

                const isSlotAvailable = availableSlots.includes(requestedSlotISO);
                if (!isSlotAvailable) {
                    console.warn(`[BookingService.createBooking][TX] Conflict detected inside transaction by AvailabilityService. Slot ${requestedSlotISO} no longer available.`);
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

                const initialStatus = service.auto_confirm_bookings
                    ? BookingStatus.CONFIRMED
                    : BookingStatus.PENDING_CONFIRMATION;
                console.log(`[BookingService.createBooking][TX] Initial status set to: ${initialStatus} based on service config.`);

                console.log(`[BookingService.createBooking][TX] Attempting DB create...`);
                const bookingData: any = {
                    user_id: userId,
                    establishment_id: establishmentId,
                    service_id: serviceId,
                    start_datetime: startDatetime,
                    end_datetime: endDatetime,
                    status: initialStatus,
                    price_at_booking: priceAtBooking,
                    currency_at_booking: service.currency,
                    payment_status: PaymentStatus.NOT_PAID,
                    user_notes: userNotes ?? null,
                };

                try {
                    const created = await this.bookingModel.create(bookingData, { transaction: t });
                    console.log(`[BookingService.createBooking][TX] Booking ${created.id} created in DB.`);
                    return created;
                } catch (error) {
                    if (error instanceof SequelizeUniqueConstraintError) {
                        console.warn(`[BookingService.createBooking][TX] Database unique constraint violation during create. Assuming booking conflict for slot ${startDatetime.toISOString()}.`);
                        throw new BookingConflictError();
                    }
                    console.error(`[BookingService.createBooking][TX] Unexpected database error during create:`, error);
                    throw error;
                }
            });

            console.log(`[BookingService.createBooking] Booking ${newBooking.id} committed. Proceeding with post-creation logic (notifications).`);
            console.log(`[Payment Simulation] Booking ${newBooking.id}: Payment of ${newBooking.price_at_booking} ${newBooking.currency_at_booking} to be handled offline.`);

            try {
                console.log(`[BookingService.createBooking] Fetching data for notifications for booking ${newBooking.id}...`);

                await newBooking.reload({
                    include: [
                        { model: db.User, as: 'client', attributes: ['id', 'username', 'email'] },
                        { model: db.Service, as: 'service', include: [{ model: db.Establishment, as: 'establishment', attributes: ['name', 'owner_id'] }] }
                    ]
                });

                const client = newBooking.client;
                const loadedService = newBooking.service;
                const establishment = loadedService?.establishment;
                const admin = establishment ? await db.User.findByPk(establishment.owner_id, { attributes: ['email'] }) : null;

                if (!client) { console.error(`[BookingService.createBooking] Client User ${userId} not found post-commit or reload.`); }
                if (!loadedService) { console.error(`[BookingService.createBooking] Service ${serviceId} not found post-commit or reload.`); }
                if (!establishment) { console.error(`[BookingService.createBooking] Establishment for Service ${serviceId} not found post-commit or reload.`);}
                if (!admin) { console.error(`[BookingService.createBooking] Admin User ${establishment?.owner_id} not found post-commit.`); }

                if (client?.email && loadedService && establishment) {
                    this.notificationService.sendBookingConfirmationClient(
                        client.email, newBooking.get({ plain: true }),
                        loadedService.get({ plain: true }), establishment.get({ plain: true })
                    ).catch(e => console.error(`[Notification Error] Failed sending confirmation to client ${client.email}: ${e.message}`));
                }
                if (admin?.email && loadedService && client) {
                    this.notificationService.sendBookingNotificationAdmin(
                        admin.email, newBooking.get({ plain: true }),
                        loadedService.get({ plain: true }), client.get({ plain: true })
                    ).catch(e => console.error(`[Notification Error] Failed sending notification to admin ${admin.email}: ${e.message}`));
                }
            } catch (notifError: any) {
                console.error(`[BookingService.createBooking] Unexpected error during notification process for booking ${newBooking.id}:`, notifError);
            }

            return newBooking;

        } catch (error: any) {
            if (error instanceof BookingConflictError) {
                console.warn(`[BookingService.createBooking] Booking conflict detected: ${error.message}`);
                throw error; // Relancer pour 409
            }
            console.error(`[BookingService.createBooking] Error during booking creation process: ${error.message}`, error.stack);
            if (error instanceof AppError) { throw error; }
            throw new AppError('BookingCreationFailed', 500, `Failed to create booking: ${error.message}`);
        }
    }

    async cancelBookingByUser(bookingId: number, userId: number): Promise<Booking> {
        let booking: Booking;
        try {
            // checkBookingPermission loads establishment and service needed for checks
            booking = await this.checkBookingPermission(bookingId, userId, 'CLIENT');
        } catch (permError: any) {
            if (permError instanceof AppError) throw permError;
            console.error(`[BookingService.cancelBookingByUser] Unexpected error during permission check for booking ${bookingId}: ${permError.message}`, permError);
            throw new AppError('PermissionCheckFailed', 500, 'Failed to check booking permissions.');
        }

        const finalStatusesCancel: BookingStatus[] = [
            BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_ESTABLISHMENT, BookingStatus.CANCELLED_BY_ADMIN,
            BookingStatus.COMPLETED, BookingStatus.NO_SHOW
        ];
        if (finalStatusesCancel.includes(booking.status)) {
            throw new InvalidBookingOperationError(`Cannot cancel a booking that is already ${booking.status}.`);
        }
        if (![BookingStatus.CONFIRMED, BookingStatus.PENDING_CONFIRMATION].includes(booking.status)) {
            throw new InvalidBookingOperationError(`Cannot cancel a booking with status ${booking.status}.`);
        }

        const service = booking.service; // Guaranteed loaded by checkBookingPermission
        if (!service) {
            console.error(`Database inconsistency: Booking ${bookingId} missing service data after permission check.`);
            throw new AppError('DatabaseInconsistency', 500, 'Booking is missing required service data.');
        }
        const now = new Date();
        const startTime = booking.start_datetime;
        if (service.cancellation_deadline_minutes != null && service.cancellation_deadline_minutes >= 0) {
            const deadlineTime = new Date(startTime.getTime() - service.cancellation_deadline_minutes * 60000);
            if (now > deadlineTime) {
                throw new CancellationNotAllowedError(
                    `Cancellation deadline passed. Bookings must be cancelled at least ${service.cancellation_deadline_minutes} minutes before the appointment.`
                );
            }
        }

        booking.status = BookingStatus.CANCELLED_BY_USER;

        try {
            await booking.save();
            console.log(`[BookingService.cancelBookingByUser] Booking ${bookingId} saved with status CANCELLED_BY_USER.`);
            // Reload with consistent includes
            await booking.reload({ include: adminBookingIncludes });
        } catch (saveError: any) {
            console.error(`[BookingService.cancelBookingByUser] Error saving booking ${bookingId} after status update: ${saveError.message}`, saveError);
            throw new AppError('BookingUpdateUserStatus', 500, `Failed to save booking cancellation status for booking ${bookingId}.`);
        }

        console.log(`[Payment Simulation] Booking ${booking.id} cancelled by user: Initiate refund process if applicable (offline).`);

        // Send notifications safely
        try {
            const establishment = booking.establishment; // Should be loaded by reload
            const client = booking.client; // Should be loaded by reload
            let admin: User | null = null;

            if (!establishment) {
                console.error(`[BookingService.cancelBookingByUser] Establishment data not loaded for booking ${booking.id} during notification phase.`);
            } else {
                admin = await db.User.findByPk(establishment.owner_id, { attributes: ['email'] });
                if (!admin) { console.error(`[BookingService.cancelBookingByUser] Admin User ${establishment.owner_id} not found post-commit.`); }
            }

            if (!client) { console.error(`[BookingService.cancelBookingByUser] Client User ${userId} not found or not loaded post-commit.`); }

            const plainBookingForNotif = booking.get({ plain: true });
            if (typeof plainBookingForNotif.price_at_booking === 'string') {
                plainBookingForNotif.price_at_booking = parseFloat(plainBookingForNotif.price_at_booking);
            }
            const plainServiceForNotif = booking.service?.get({ plain: true }); // Use reloaded service

            if (admin?.email && plainServiceForNotif && client) {
                this.notificationService.sendBookingCancellationAdmin(
                    admin.email, plainBookingForNotif,
                    plainServiceForNotif, client.get({ plain: true }) // Pass plain client
                ).catch(e => console.error(`[Notification Error] Failed sending cancellation notification to admin ${admin.email}: ${e.message}`));
            } else {
                console.warn(`[BookingService.cancelBookingByUser] Missing data for admin cancellation notification (Admin: ${!!admin}, Service: ${!!plainServiceForNotif}, Client: ${!!client}) for Booking ID: ${bookingId}`);
            }
        } catch (notifError: any) {
            console.error(`[BookingService.cancelBookingByUser] Error during notification phase for booking ${booking.id}:`, notifError);
        }

        return booking;
    }

    async updateBookingStatusByAdmin(bookingId: number, adminUserId: number, data: UpdateBookingStatusDto): Promise<Booking> {
        const booking = await this.checkBookingPermission(bookingId, adminUserId, 'ADMIN');
        const { status: newStatus, establishmentNotes } = data;
        const oldStatus = booking.status;
        let statusChanged = false;
        let notesChanged = false;

        if (establishmentNotes !== undefined && booking.establishment_notes !== establishmentNotes) {
            console.log(`[BookingService.updateBookingStatusByAdmin] Updating notes for booking ${bookingId}`);
            booking.establishment_notes = establishmentNotes;
            notesChanged = true;
        }

        if (newStatus !== undefined && newStatus !== oldStatus) {
            console.log(`[BookingService.updateBookingStatusByAdmin] Status change requested for booking ${bookingId} from ${oldStatus} to ${newStatus}`);

            const irreversibleStatuses: BookingStatus[] = [
                BookingStatus.CANCELLED_BY_USER,
                BookingStatus.CANCELLED_BY_ESTABLISHMENT,
                BookingStatus.CANCELLED_BY_ADMIN,
                BookingStatus.COMPLETED
            ];
            if (irreversibleStatuses.includes(oldStatus)) {
                throw new InvalidBookingOperationError(`Cannot update status of a booking that is already ${oldStatus}.`);
            }

            const validTransitions: { [key in BookingStatus]?: BookingStatus[] } = {
                [BookingStatus.PENDING_CONFIRMATION]: [
                    BookingStatus.CONFIRMED,
                    BookingStatus.CANCELLED_BY_ESTABLISHMENT
                ],
                [BookingStatus.CONFIRMED]: [
                    BookingStatus.COMPLETED,
                    BookingStatus.NO_SHOW,
                    BookingStatus.CANCELLED_BY_ESTABLISHMENT
                ],
                [BookingStatus.NO_SHOW]: [
                    BookingStatus.COMPLETED
                ],
            };

            if (!validTransitions[oldStatus]?.includes(newStatus)) {
                throw new InvalidStatusTransitionError(oldStatus, newStatus);
            }

            booking.status = newStatus;
            statusChanged = true;
        } else if (newStatus === oldStatus) {
            console.log(`[BookingService.updateBookingStatusByAdmin] Requested status ${newStatus} is the same as the current status for booking ${bookingId}. No status change.`);
        }

        if (statusChanged || notesChanged) {
            await booking.save();
            console.log(`[BookingService.updateBookingStatusByAdmin] Booking ${bookingId} saved. Status changed: ${statusChanged}, Notes changed: ${notesChanged}`);

            if (statusChanged) {
                console.log(`[BookingService.updateBookingStatusByAdmin] Status changed to ${booking.status} for booking ${bookingId}`);
                if ([BookingStatus.CANCELLED_BY_ESTABLISHMENT, BookingStatus.CANCELLED_BY_ADMIN].includes(booking.status)) {
                    console.log(`[Payment Simulation] Booking ${booking.id} cancelled by admin/establishment: Initiate refund process if applicable (offline).`);
                }

                try {
                    await booking.reload({
                        include: [
                            { model: db.User, as: 'client', attributes: ['id', 'username', 'email', 'profile_picture'] },
                            { model: db.Service, as: 'service', attributes: ['id', 'name', 'duration_minutes'] }
                        ]
                    });

                    const client = booking.client;
                    if (client?.email) {
                        const service = booking.service;
                        if (service) {
                            this.notificationService.sendBookingStatusUpdateClient(
                                client.email, booking.get({ plain: true }), service.get({ plain: true })
                            ).catch(e => console.error(`[Notification Error] Failed sending status update to client ${client.email}: ${e.message}`));
                        } else {
                            console.error(`[BookingService.updateBookingStatusByAdmin] Could not find associated service for client notification (Booking ID: ${bookingId}, Service ID: ${booking.service_id})`);
                        }
                    } else {
                        console.warn(`[BookingService.updateBookingStatusByAdmin] Client email not found for booking ${booking.id}, cannot send status update notification.`);
                    }
                } catch (notifError: any) {
                    console.error(`[BookingService.updateBookingStatusByAdmin] Error during notification process for booking ${booking.id}:`, notifError);
                }
            }
        } else {
            console.log(`[BookingService.updateBookingStatusByAdmin] No effective changes requested or needed for booking ${bookingId}`);
        }

        if (!statusChanged && (notesChanged || !(booking.client && booking.service))) {
            try {
                await booking.reload({
                    include: [
                        { model: db.User, as: 'client', attributes: ['id', 'username', 'email', 'profile_picture'] },
                        { model: db.Service, as: 'service', attributes: ['id', 'name', 'duration_minutes'] }
                    ]
                });
            } catch(reloadError: any) {
                console.error(`[BookingService.updateBookingStatusByAdmin] Failed to reload booking ${bookingId} associations before returning:`, reloadError);
            }
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

    async findBookingsForEstablishment(establishmentId: number, queryParams: GetEstablishmentBookingsQueryDto): Promise<{ rows: Booking[]; count: number }> {
        const {
            page, limit, search, status, serviceId,
            startDate, endDate, sortBy, sortOrder
        } = queryParams;

        const offset = (page - 1) * limit;
        const findOptions: FindOptions = {
            limit, offset,
            where: {},
            include: [], order: [], subQuery: false
        };

        const whereClause: WhereOptions<BookingAttributes> = { establishment_id: establishmentId };

        if (status && status.length > 0) { whereClause.status = { [Op.in]: status }; }
        if (serviceId) { whereClause.service_id = serviceId; }
        if (startDate) {
            const start = startOfDay(parseISO(startDate));
            let end;
            if (endDate) { end = endOfDay(parseISO(endDate)); }
            else { end = endOfDay(parseISO(startDate)); }
            whereClause.start_datetime = { [Op.between]: [start, end] };
        }
        else {
            whereClause.start_datetime = { [Op.gte]: startOfDay(new Date()) };
        }

        let searchCondition = {};
        if (search) {
            const searchTerm = `%${search}%`;
            const likeOperator = db.sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
            searchCondition = {
                [Op.or]: [
                    { '$client.username$': { [likeOperator]: searchTerm } },
                    { '$client.email$': { [likeOperator]: searchTerm } },
                    { '$booking.id$': { [likeOperator]: searchTerm } },
                    { establishment_notes: { [likeOperator]: searchTerm } },
                    { user_notes: { [likeOperator]: searchTerm } }
                ]
            };
        }
        findOptions.where = { ...whereClause, ...searchCondition  };

        const clientInclude: Includeable = { model: db.User, as: 'client', attributes: ['id', 'username', 'email', 'profile_picture'], required: false };
        const serviceInclude: Includeable = { model: db.Service, as: 'service', attributes: ['id', 'name', 'duration_minutes'], required: false };
        findOptions.include = [clientInclude, serviceInclude];

        const sortDirection = sortOrder.toUpperCase() as 'ASC' | 'DESC';
        let orderItem: OrderItem;

        switch (sortBy) {
            case 'service_name':
                orderItem = [{ model: db.Service, as: 'service' }, 'name', sortDirection];
                break;
            case 'client_name':
                orderItem = [{ model: db.User, as: 'client' }, 'username', sortDirection];
                break;
            default:
                orderItem = [sortBy, sortDirection];
                break;
        }
        findOptions.order = [orderItem];
        return this.bookingModel.findAndCountAll(findOptions);
    }

    async findBookingById(bookingId: number): Promise<Booking | null> {
        const booking = await this.bookingModel.findByPk(bookingId, {
            include: adminBookingIncludes
        });
        return booking;
    }
}