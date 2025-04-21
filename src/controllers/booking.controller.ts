// src/controllers/booking.controller.ts
import { Request, Response, NextFunction } from 'express';
import { BookingService } from '../services/booking.service';

import {
    CreateBookingSchema, CreateBookingDto, UpdateBookingStatusSchema, UpdateBookingStatusDto,
    mapToAdminBookingDto, AdminBookingOutputDto
} from '../dtos/booking.validation';

import { AppError } from '../errors/app.errors';
import { AuthenticationError } from '../errors/auth.errors';
import { BookingNotFoundError, BookingOwnershipError } from '../errors/booking.errors';

export class BookingController {
    private bookingService: BookingService;

    constructor(bookingService: BookingService) {
        this.bookingService = bookingService;
        // Bind methods
        this.create = this.create.bind(this);
        this.getUserBookings = this.getUserBookings.bind(this);
        this.getEstablishmentBookings = this.getEstablishmentBookings.bind(this);
        this.getBookingById = this.getBookingById.bind(this);
        this.cancelByUser = this.cancelByUser.bind(this);
        this.updateStatusByAdmin = this.updateStatusByAdmin.bind(this);
    }

    // POST /bookings
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();
            const createDto: CreateBookingDto = CreateBookingSchema.parse(req.body);
            const newBooking = await this.bookingService.createBooking(req.user.id, createDto);
            const outputDto = mapToAdminBookingDto(newBooking);
            res.status(201).json(outputDto);
        } catch (error) {
            next(error); // Gère Zod, ServiceNotFound, Conflict, etc.
        }
    }

    // GET /users/me/bookings
    async getUserBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '10', 10);
            if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1 || limit > 100) { throw new AppError('InvalidParameter', 400, 'Invalid pagination parameters.'); }
            const offset = (page - 1) * limit;
            const { rows, count } = await this.bookingService.findUserBookings(req.user.id, { limit, offset });
            res.status(200).json({
                data: rows.map(b => b.get({ plain: true })),
                pagination: { totalItems: count, currentPage: page, itemsPerPage: limit, totalPages: Math.ceil(count / limit) }
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /establishments/my/bookings
    async getEstablishmentBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const establishmentId = parseInt(req.params.establishmentId, 10);
            if (isNaN(establishmentId)) { throw new AppError('InvalidParameter', 400, 'Invalid establishment ID parameter.'); }
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '10', 10);
            if (isNaN(page) || page < 1 || isNaN(limit) || limit < 1 || limit > 100) { throw new AppError('InvalidParameter', 400, 'Invalid pagination parameters.'); }
            const offset = (page - 1) * limit;

            const { rows, count } = await this.bookingService.findBookingsForEstablishment(establishmentId, { limit, offset });
            const data: AdminBookingOutputDto[] = rows.map(booking => mapToAdminBookingDto(booking));

            res.status(200).json({
                data: data,
                pagination: { totalItems: count, currentPage: page, itemsPerPage: limit, totalPages: Math.ceil(count / limit) }
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /bookings/:bookingId
    async getBookingById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();
            const bookingId = parseInt(req.params.bookingId, 10);
            if (isNaN(bookingId)) throw new AppError('InvalidParameter', 400, 'Invalid booking ID.');

            const booking = await this.bookingService.findBookingById(bookingId);
            if (!booking) { throw new BookingNotFoundError(); }
            const outputDto = mapToAdminBookingDto(booking);

            res.status(200).json(outputDto);
        } catch (error) {
            next(error);
        }
    }

    // PATCH /bookings/:bookingId/cancel (User action)
    async cancelByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();
            const bookingId = parseInt(req.params.bookingId, 10);
            if (isNaN(bookingId)) throw new AppError('InvalidParameter', 400, 'Invalid booking ID.');

            const cancelledBooking = await this.bookingService.cancelBookingByUser(bookingId, req.user.id);
            const outputDto = mapToAdminBookingDto(cancelledBooking);
            res.status(200).json(outputDto);

        } catch (error) {
            next(error); // Gère BookingNotFound, BookingOwnershipError, CancellationNotAllowedError, InvalidBookingOperationError
        }
    }

    // PATCH /bookings/:bookingId (Admin action)
    async updateStatusByAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();
            const bookingId = parseInt(req.params.bookingId, 10);
            if (isNaN(bookingId)) throw new AppError('InvalidParameter', 400, 'Invalid booking ID.');

            const updateDto: UpdateBookingStatusDto = UpdateBookingStatusSchema.parse(req.body);
            const updatedBooking = await this.bookingService.updateBookingStatusByAdmin(bookingId, req.user.id, updateDto);
            const outputDto = mapToAdminBookingDto(updatedBooking);

            res.status(200).json(outputDto);

        } catch (error) {
            next(error); // Gère Zod, BookingNotFound, BookingOwnershipError, InvalidStatusTransitionError
        }
    }
}