// src/services/service.service.ts
import { ModelCtor, FindOptions, Op } from 'sequelize';
import db from '../models'; // Assurez-vous que db contient tous les modèles nécessaires
import Service, { ServiceAttributes } from '../models/Service';
import Establishment from '../models/Establishment'; // Utilisé indirectement via db ou EstablishmentService
import Booking, { BookingStatus } from '../models/Booking';
import { EstablishmentService } from './establishment.service';
import { CreateServiceDto, UpdateServiceDto } from '../dtos/service.validation';
import { AppError } from '../errors/app.errors';
import { ServiceNotFoundError } from '../errors/service.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';

export class ServiceService {
    private serviceModel: ModelCtor<Service>;
    private establishmentService: EstablishmentService; // Gardé si besoin pour d'autres logiques futures
    private bookingModel: ModelCtor<Booking>;

    constructor(
        serviceModel: ModelCtor<Service>,
        establishmentService: EstablishmentService
        // Le bookingModel est injecté via db global ou devrait l'être ici si besoin
    ) {
        this.serviceModel = serviceModel;
        this.establishmentService = establishmentService;
        this.bookingModel = db.Booking; // Accès via l'objet db importé
    }

    // --- Méthodes Admin (appelées via les routes /users/me/establishments/:establishmentId/...) ---

    /**
     * Crée un service pour un établissement spécifique.
     * L'ownership de l'établissement est vérifié en amont par le middleware.
     */
    async createServiceForEstablishment(establishmentId: number, data: CreateServiceDto): Promise<Service> {
        // Optionnel: Re-vérifier si l'établissement existe comme sécurité supplémentaire
        const establishmentExists = await db.Establishment.findByPk(establishmentId, { attributes: ['id'] });
        if (!establishmentExists) {
            throw new EstablishmentNotFoundError("Cannot create service: Establishment specified not found.");
        }

        const newService = await this.serviceModel.create({
            ...data,
            establishment_id: establishmentId, // Utilise l'ID de l'établissement fourni
        });

        // Re-fetch pour inclure les associations ou valeurs par défaut si nécessaire pour le retour
        return (await this.serviceModel.findByPk(newService.id))!;
    }

    /**
     * Récupère les services appartenant à un établissement spécifique.
     * L'ownership de l'établissement est vérifié en amont par le middleware.
     */
    async getOwnedServicesByEstablishmentId(establishmentId: number, options: FindOptions = {}): Promise<{ rows: Service[]; count: number }> {
        const defaultOptions: FindOptions = {
            where: { establishment_id: establishmentId },
            // Sélectionner les attributs nécessaires pour la vue admin/propriétaire
            attributes: [
                'id', 'name', 'description', 'duration_minutes', 'price', 'currency',
                'capacity', 'is_active', 'is_promoted',
                'discount_price', 'discount_start_date', 'discount_end_date',
                'createdAt', 'updatedAt' // Inclure timestamps ?
            ],
            order: [['name', 'ASC']],
        };
        const mergedOptions = { ...defaultOptions, ...options }; // Fusionner avec les options de pagination/filtre
        return this.serviceModel.findAndCountAll(mergedOptions);
    }

    // --- Méthodes agissant sur un service par son ID (appelées via /api/services/:serviceId) ---

    /**
     * Récupère un service spécifique en vérifiant qu'il appartient bien
     * à l'établissement donné. Retourne null si non trouvé.
     * L'ownership de l'établissement parent est vérifié en amont.
     */
    async getSpecificOwnedService(establishmentId: number, serviceId: number): Promise<Service> {
        const service = await this.serviceModel.findOne({
            where: {
                id: serviceId,
                establishment_id: establishmentId // Assure l'appartenance
            }
            // Peut inclure des associations si nécessaire pour le DTO admin
            // include: [...]
        });
        if (!service) { throw new ServiceNotFoundError(); }
        return service
    }

    /**
     * Met à jour un service spécifique par son ID.
     * L'ownership est vérifié en amont par le middleware requireServiceOwner.
     */
    async updateServiceById(serviceId: number, data: UpdateServiceDto): Promise<Service> {
        const service = await this.serviceModel.findByPk(serviceId);
        if (!service) { throw new ServiceNotFoundError(); }

        // Appliquer la mise à jour partielle
        await service.update(data);

        // Re-fetch pour s'assurer d'avoir l'état complet et à jour
        return (await this.serviceModel.findByPk(serviceId))!;
    }

    /**
     * Supprime un service spécifique par son ID.
     * L'ownership est vérifié en amont par le middleware requireServiceOwner.
     * Vérifie qu'il n'y a pas de réservations futures confirmées.
     */
    async deleteServiceById(serviceId: number): Promise<void> {
        const service = await this.serviceModel.findByPk(serviceId, { attributes: ['id'] });
        if (!service) { throw new ServiceNotFoundError(); }

        const futureBookingsCount = await this.bookingModel.count({
            where: {
                service_id: serviceId,
                start_datetime: { [Op.gte]: new Date() },
                status: { [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING_CONFIRMATION] }
            }
        });

        if (futureBookingsCount > 0) {
            console.warn(`Attempted to delete service ${serviceId} which has ${futureBookingsCount} upcoming bookings.`);
            throw new AppError('ServiceDeletionConflict', 409, `Cannot delete service with ${futureBookingsCount} upcoming confirmed/pending bookings. Please cancel them first or deactivate the service.`);
        }

        await service.destroy();
    }


    // --- Méthodes Publiques (appelées via /api/establishments/:id/services) ---

    /**
     * Récupère les services publics (actifs) d'un établissement validé.
     */
    async findPublicServicesByEstablishment(establishmentId: number, options: FindOptions = {}): Promise<Service[]> {
        // Vérifie que l'établissement parent est public/validé
        await this.establishmentService.getPublicEstablishmentById(establishmentId);

        const defaultOptions: FindOptions = {
            where: {
                establishment_id: establishmentId,
                is_active: true // Ne retourne que les services actifs
            },
            attributes: [ // Sélectionner les champs pertinents pour le public
                'id', 'name', 'description', 'duration_minutes', 'price', 'currency',
                'capacity', // La capacité peut être utile pour le frontend
                'discount_price', 'discount_start_date', 'discount_end_date' // Inclure les infos promo
            ],
            order: [['name', 'ASC']]
        };
        const mergedOptions = { ...defaultOptions, ...options };
        return await this.serviceModel.findAll(mergedOptions);
    }

    /**
     * Récupère un service public spécifique par son ID,
     * en vérifiant qu'il est actif et que son établissement est validé.
     */
    async getPublicServiceById(serviceId: number): Promise<Service | null> {
        const service = await this.serviceModel.findOne({
            where: {
                id: serviceId,
                is_active: true // Service doit être actif
            },
            include: [{
                model: db.Establishment, // Assurez-vous que l'alias est correct si défini
                as: 'establishment', // Utilise l'alias défini dans les associations
                attributes: ['id', 'is_validated'], // Juste besoin de vérifier la validation
                required: true // Assure une jointure interne
            }],
            attributes: [ // Attributs publics du service
                'id', 'name', 'description', 'duration_minutes', 'price', 'currency',
                'capacity', 'discount_price', 'discount_start_date', 'discount_end_date',
                'establishment_id' // Peut être utile pour le contexte
            ]
        });

        // Vérifier si le service a été trouvé ET si son établissement est validé
        if (!service || !service.establishment || !service.establishment.is_validated) {
            return null; // Ou lancer une ServiceNotFoundError si on préfère 404
        }

        // Optionnel: Nettoyer l'objet avant de le retourner si on ne veut pas exposer l'objet 'establishment' imbriqué
        const plainService = service.get({ plain: true });
        // @ts-ignore
        delete plainService.establishment; // Supprime la propriété imbriquée après vérification

        return plainService as Service; // Retourne l'objet service nettoyé
    }
}