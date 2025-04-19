// src/controllers/booking.controller.ts
import { Request, Response, NextFunction } from 'express';
import { BookingService } from '../services/booking.service';

import {
    CreateBookingSchema, CreateBookingDto, UpdateBookingStatusSchema, UpdateBookingStatusDto
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

            // TODO: Appliquer mapToPublicBookingDto si nécessaire
            res.status(201).json(newBooking.get({ plain: true }));
        } catch (error) {
            next(error); // Gère Zod, ServiceNotFound, Conflict, etc.
        }
    }

    // GET /users/me/bookings
    async getUserBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();

            // TODO: Extraire et valider les query params (pagination, filtres statut/date)
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '10', 10);
            const offset = (page - 1) * limit;
            // Autres filtres à ajouter ici

            const { rows, count } = await this.bookingService.findUserBookings(req.user.id, { limit, offset /*, where: filters */ });

            // TODO: mapToPublicBookingDto si nécessaire
            res.status(200).json({
                data: rows.map(b => b.get({ plain: true })),
                pagination: {
                    totalItems: count,
                    currentPage: page,
                    itemsPerPage: limit,
                    totalPages: Math.ceil(count / limit)
                }
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /establishments/my/bookings
    async getEstablishmentBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();

            // TODO: Extraire et valider les query params (pagination, filtres statut/date/user)
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '10', 10);
            const offset = (page - 1) * limit;
            // Autres filtres

            const { rows, count } = await this.bookingService.findEstablishmentBookings(req.user.id, { limit, offset /*, where: filters */ });

            // TODO: mapToAdminBookingDto si nécessaire
            res.status(200).json({
                data: rows.map(b => b.get({ plain: true })),
                pagination: {
                    totalItems: count,
                    currentPage: page,
                    itemsPerPage: limit,
                    totalPages: Math.ceil(count / limit)
                }
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
            if (!booking) {
                throw new BookingNotFoundError();
            }

            res.status(200).json(booking.get({ plain: true }));

        } catch (error) {
            next(error); // Gère BookingNotFound, etc.
        }
    }

    // PATCH /bookings/:bookingId/cancel (User action)
    async cancelByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') throw new AuthenticationError();
            const bookingId = parseInt(req.params.bookingId, 10);
            if (isNaN(bookingId)) throw new AppError('InvalidParameter', 400, 'Invalid booking ID.');

            // Le service cancelBookingByUser vérifie l'ownership et les règles d'annulation
            const cancelledBooking = await this.bookingService.cancelBookingByUser(bookingId, req.user.id);

            // TODO: mapToPublicBookingDto ?
            res.status(200).json(cancelledBooking.get({ plain: true }));

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

            // Le service updateBookingStatusByAdmin vérifie l'ownership admin et la transition de statut
            const updatedBooking = await this.bookingService.updateBookingStatusByAdmin(bookingId, req.user.id, updateDto);

            // TODO: mapToAdminBookingDto ?
            res.status(200).json(updatedBooking.get({ plain: true }));

        } catch (error) {
            next(error); // Gère Zod, BookingNotFound, BookingOwnershipError, InvalidStatusTransitionError
        }
    }
}