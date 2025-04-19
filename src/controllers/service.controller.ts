// src/controllers/service.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ServiceService } from '../services/service.service';
import { AvailabilityService } from '../services/availability.service';
import { GetAvailabilityQuerySchema, GetAvailabilityQueryDto } from '../dtos/availability.validation';
import {
    CreateServiceSchema, CreateServiceDto, UpdateServiceSchema, UpdateServiceDto,
    mapToAdminServiceDto, mapToPublicServiceDto
} from '../dtos/service.validation';
import { AppError } from '../errors/app.errors';
import { AuthenticationError } from '../errors/auth.errors';
import { ServiceNotFoundError } from '../errors/service.errors';
// EstablishmentNotFoundError n'est plus nécessaire ici si le service le gère

export class ServiceController {
    private serviceService: ServiceService;
    private availabilityService: AvailabilityService;

    constructor(serviceService: ServiceService, availabilityService: AvailabilityService) {
        this.serviceService = serviceService;
        this.availabilityService = availabilityService;

        // Bind methods
        this.createForMyEstablishment = this.createForMyEstablishment.bind(this);
        this.getOwnedForMyEstablishment = this.getOwnedForMyEstablishment.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.getPublicByEstablishment = this.getPublicByEstablishment.bind(this);
        this.getAvailability = this.getAvailability.bind(this);
    }

    // POST /users/me/establishments/:establishmentId/services
    async createForMyEstablishment(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'authentification est vérifiée par requireAuth
            // L'ownership de l'établissement est vérifié par ensureOwnsEstablishment sur le routeur parent
            const establishmentId = parseInt(req.params.establishmentId, 10);
            if (isNaN(establishmentId)) throw new AppError('InvalidParameter', 400, 'Invalid establishment ID parameter.');

            const createDto: CreateServiceDto = CreateServiceSchema.parse(req.body);

            // Appeler le service avec l'ID de l'établissement
            const newService = await this.serviceService.createServiceForEstablishment(establishmentId, createDto);
            const outputDto = mapToAdminServiceDto(newService.get({ plain: true }));

            res.status(201).json(outputDto);
        } catch (error) {
            next(error); // Passe à errorMiddleware (gère Zod, EstablishmentNotFound, etc.)
        }
    }

    // GET /users/me/establishments/:establishmentId/services
    async getOwnedForMyEstablishment(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Auth et Ownership vérifiés par les middlewares
            const establishmentId = parseInt(req.params.establishmentId, 10);
            if (isNaN(establishmentId)) throw new AppError('InvalidParameter', 400, 'Invalid establishment ID parameter.');

            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '10', 10);
            if (isNaN(page) || page < 1) { throw new AppError('InvalidParameter', 400, 'Invalid page number.'); }
            if (isNaN(limit) || limit < 1 || limit > 100) { throw new AppError('InvalidParameter', 400, 'Invalid limit value (must be 1-100).'); }
            const offset = (page - 1) * limit;

            // Appel corrigé à la nouvelle méthode du service
            const { rows, count } = await this.serviceService.getOwnedServicesByEstablishmentId(establishmentId, { limit, offset });

            const outputDtos = rows.map(svc => mapToAdminServiceDto(svc.get({ plain: true })));

            res.status(200).json({
                data: outputDtos,
                pagination: { totalItems: count, currentPage: page, itemsPerPage: limit, totalPages: Math.ceil(count / limit) }
            });
        } catch (error) {
            next(error);
        }
    }

    // PUT /api/services/:serviceId
    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Auth et Ownership vérifiés par requireAuth et requireServiceOwner
            const serviceId = parseInt(req.params.serviceId, 10);
            if (isNaN(serviceId)) { throw new AppError('InvalidParameter', 400, 'Invalid service ID parameter.'); }

            const updateDto: UpdateServiceDto = UpdateServiceSchema.parse(req.body);

            // Appeler le service en passant juste l'ID et les données
            const updatedService = await this.serviceService.updateServiceById(serviceId, updateDto); // Appel à la méthode renommée/correcte
            const outputDto = mapToAdminServiceDto(updatedService.get({ plain: true }));

            res.status(200).json(outputDto);
        } catch (error) {
            next(error); // Gère Zod, ServiceNotFound, etc.
        }
    }

    // DELETE /api/services/:serviceId
    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // Auth et Ownership vérifiés par requireAuth et requireServiceOwner
            const serviceId = parseInt(req.params.serviceId, 10);
            if (isNaN(serviceId)) { throw new AppError('InvalidParameter', 400, 'Invalid service ID parameter.'); }

            // Appeler le service en passant juste l'ID
            await this.serviceService.deleteServiceById(serviceId); // Appel à la méthode renommée/correcte

            res.status(204).send();
        } catch (error) {
            next(error); // Gère ServiceNotFound, ServiceDeletionConflict (409), etc.
        }
    }

    // GET /api/establishments/:id/services (Public)
    async getPublicByEstablishment(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const establishmentId = parseInt(req.params.id, 10); // Note: le param s'appelle 'id' dans la route establishment.routes.ts
            if (isNaN(establishmentId)) { throw new AppError('InvalidParameter', 400, 'Invalid establishment ID parameter.'); }

            const services = await this.serviceService.findPublicServicesByEstablishment(establishmentId);
            // Utiliser le mapper DTO public
            const outputDtos = services.map(svc => mapToPublicServiceDto(svc.get({ plain: true })));

            res.status(200).json(outputDtos);
        } catch (error) {
            next(error); // Gère EstablishmentNotFound (lancé par le service)
        }
    }

    // GET /api/services/:serviceId/availability (Public)
    async getAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const serviceId = parseInt(req.params.serviceId, 10);
            if (isNaN(serviceId)) { throw new AppError('InvalidParameter', 400, 'Invalid service ID parameter.'); }

            // Valider les paramètres de la query string
            const queryParams: GetAvailabilityQueryDto = GetAvailabilityQuerySchema.parse(req.query);

            const availableSlots = await this.availabilityService.getAvailableSlots(serviceId, queryParams.date);
            res.status(200).json({ availableSlots });
        } catch (error) {
            next(error); // Gère ZodError, ServiceNotFound, InvalidDateFormat, etc.
        }
    }
}