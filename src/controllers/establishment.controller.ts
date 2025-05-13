// src/controllers/establishment.controller.ts
import { Request, Response, NextFunction } from 'express';
import { EstablishmentService } from '../services/establishment.service';
import { AvailabilityService } from '../services/availability.service';

import {
    CreateEstablishmentSchema, CreateEstablishmentDto,
    UpdateEstablishmentSchema, UpdateEstablishmentDto,
    mapToAdminEstablishmentDto, mapToPublicEstablishmentDto
} from '../dtos/establishment.validation';
import {
    CreateAvailabilityRuleSchema, CreateAvailabilityRuleDto,
    CreateAvailabilityOverrideSchema, CreateAvailabilityOverrideDto,
    UpdateAvailabilityOverrideSchema, UpdateAvailabilityOverrideDto,
    UpdateAvailabilityRuleDto, UpdateAvailabilityRuleSchema
} from '../dtos/availability.validation';

import { AuthenticationError, AuthorizationError } from '../errors/auth.errors';
import { UserAlreadyMemberError, MembershipNotFoundError } from '../errors/membership.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';
import { AppError } from '../errors/app.errors';
import { ZodError } from 'zod';

import { MembershipService } from '../services/membership.service';
import {
    InviteMemberSchema, InviteMemberDto, MembershipDto, mapToMembershipDto,
    GetMembershipsQuerySchema, GetMembershipsQueryDto
} from '../dtos/membership.validation';
import { MembershipAttributes } from '../models/Membership';

export class EstablishmentController {
    private establishmentService: EstablishmentService;
    private membershipService: MembershipService | undefined;

    constructor(establishmentService: EstablishmentService, membershipService: MembershipService) {
        this.establishmentService = establishmentService;
        this.membershipService = membershipService
        // Bind methods
        this.create = this.create.bind(this);
        this.findPublic = this.findPublic.bind(this);
        this.getPublicById = this.getPublicById.bind(this);
        // Nouvelles méthodes pour /me/establishments
        this.listMyEstablishments = this.listMyEstablishments.bind(this);
        this.getMyEstablishmentById = this.getMyEstablishmentById.bind(this);
        this.updateMyEstablishment = this.updateMyEstablishment.bind(this);
        this.requestMyValidation = this.requestMyValidation.bind(this);
        this.updateMyProfilePicture = this.updateMyProfilePicture.bind(this);
        this.deleteMyProfilePicture = this.deleteMyProfilePicture.bind(this);
        // Méthodes pour règles/overrides de l'établissement de l'utilisateur
        this.createMyRule = this.createMyRule.bind(this);
        this.getMyRules = this.getMyRules.bind(this);
        this.createMyOverride = this.createMyOverride.bind(this);
        this.getMyOverrides = this.getMyOverrides.bind(this);
        // Méthodes pour règles/overrides par leur ID (potentiellement appelées depuis le routeur /availability)
        this.updateRule = this.updateRule.bind(this);
        this.deleteRule = this.deleteRule.bind(this);
        this.updateOverride = this.updateOverride.bind(this);
        this.deleteOverride = this.deleteOverride.bind(this);
        this.inviteMember = this.inviteMember.bind(this);
        this.getMemberships = this.getMemberships.bind(this);
        this.getMembershipById = this.getMembershipById.bind(this);
    }

    // POST /establishments
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') {
                throw new AuthenticationError('Authentication required.');
            }
            const createDto: CreateEstablishmentDto = CreateEstablishmentSchema.parse(req.body);

            const newEstablishment = await this.establishmentService.createEstablishment(req.user.id, createDto);
            const outputDto = mapToAdminEstablishmentDto(newEstablishment.get({plain: true})); // Utiliser plain pour DTO

            res.status(201).json(outputDto);
        } catch (error) {
            next(error);
        }
    }

    // GET /api/users/me/establishments
    async listMyEstablishments(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.user || typeof req.user.id !== 'number') {
                throw new AuthenticationError('Authentication required.');
            }
            const establishments = await this.establishmentService.findEstablishmentsByOwner(req.user.id);
            const outputDtos = establishments.map(est => mapToAdminEstablishmentDto(est.get({plain: true})));
            res.status(200).json(outputDtos);
        } catch (error) {
            next(error);
        }
    }

    async getMyEstablishmentById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10); // ID validé par le middleware
            // Récupérer l'établissement par ID (le service peut maintenant être plus simple)
            const establishment = await this.establishmentService.getEstablishmentById(establishmentId);
            if (!establishment) {
                throw new EstablishmentNotFoundError();
            } // Sécurité
            const outputDto = mapToAdminEstablishmentDto(establishment.get({plain: true}));
            res.status(200).json(outputDto);
        } catch (error) {
            next(error);
        }
    }

    // PUT /api/users/me/establishments/:establishmentId
    async updateMyEstablishment(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            const updateDto: UpdateEstablishmentDto = UpdateEstablishmentSchema.parse(req.body);
            // Appeler le service pour mettre à jour par ID
            const updatedEstablishment = await this.establishmentService.updateEstablishmentById(establishmentId, updateDto);
            const outputDto = mapToAdminEstablishmentDto(updatedEstablishment.get({plain: true}));
            res.status(200).json(outputDto);
        } catch (error) {
            next(error);
        }
    }

    // POST /api/users/me/establishments/:establishmentId/request-validation
    async requestMyValidation(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            // Appeler le service pour valider par ID
            const validatedEstablishment = await this.establishmentService.requestSiretValidationById(establishmentId);
            const outputDto = mapToAdminEstablishmentDto(validatedEstablishment.get({plain: true}));
            res.status(200).json({
                message: "Validation process initiated or status confirmed.",
                establishment: outputDto
            });
        } catch (error) {
            next(error);
        }
    }

    // PATCH /api/users/me/establishments/:establishmentId/profile-picture
    async updateMyProfilePicture(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.file) {
                throw new AppError('MissingFile', 400, 'No profile picture file uploaded.');
            }
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            // Appeler le service pour mettre à jour par ID
            const updatedEstablishment = await this.establishmentService.updateEstablishmentPictureById(establishmentId, req.file);
            const outputDto = mapToAdminEstablishmentDto(updatedEstablishment.get({plain: true}));
            res.status(200).json({
                message: 'Establishment profile picture updated successfully.',
                establishment: outputDto
            });
        } catch (error) {
            next(error);
        }
    }

    // DELETE /api/users/me/establishments/:establishmentId/profile-picture
    async deleteMyProfilePicture(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            // Appeler le service pour supprimer par ID
            const updatedEstablishment = await this.establishmentService.deleteEstablishmentPictureById(establishmentId);
            const outputDto = mapToAdminEstablishmentDto(updatedEstablishment.get({plain: true}));
            res.status(200).json({
                message: 'Establishment profile picture removed successfully.',
                establishment: outputDto
            });
        } catch (error) {
            next(error);
        }
    }

    // GET /establishments (Public)
    async findPublic(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // TODO: Ajouter la gestion des query params (pagination, filtres)
            const page = parseInt(req.query.page as string || '1', 10);
            const limit = parseInt(req.query.limit as string || '10', 10);
            const offset = (page - 1) * limit;

            const {rows, count} = await this.establishmentService.findPublicEstablishments({limit, offset});

            const publicEstablishments = rows.map(est => mapToPublicEstablishmentDto(est.get({plain: true})));

            res.status(200).json({
                data: publicEstablishments,
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

    // GET /establishments/:id (Public)
    async getPublicById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const establishmentId = parseInt(req.params.id, 10);
            if (isNaN(establishmentId)) {
                throw new AppError('InvalidParameter', 400, 'Invalid establishment ID.');
            }

            const establishment = await this.establishmentService.getPublicEstablishmentById(establishmentId);
            const publicDto = mapToPublicEstablishmentDto(establishment.get({plain: true}));
            res.status(200).json(publicDto);
        } catch (error) {
            // Gère EstablishmentNotFoundError (qui renvoie 404)
            next(error);
        }
    }

    // POST /users/me/establishments/:establishmentId/memberships/invite
    async inviteMember(req: Request, res: Response, next: NextFunction): Promise<void> {
        if (!this.membershipService) {
            return next(new AppError('ServiceNotAvailable', 500, 'Membership service is not configured for this controller.'));
        }
        try {
            const inviterMembership = req.membership;
            if (!inviterMembership || typeof inviterMembership.id !== 'number') {
                throw new AppError('MiddlewareError', 500, 'Inviter membership data not found in request.');
            }

            const establishmentId = parseInt(req.params.establishmentId, 10);
            const inviteDto: InviteMemberDto = InviteMemberSchema.parse(req.body);

            const newMembership = await this.membershipService.inviteMember(
                inviterMembership as MembershipAttributes,
                establishmentId,
                inviteDto
            );

            res.status(201).json({
                message: `Invitation sent successfully to ${inviteDto.email}.`,
                membership: newMembership.get({ plain: true }) // Renvoyer le membership PENDING créé
            });
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({ statusCode: 400, error: 'Validation Error', message: "Invalid input.", details: error.errors });
            }
            else if (error instanceof UserAlreadyMemberError) {
                res.status(409).json({ statusCode: 409, error: 'Conflict', message: error.message });
            }
            else if (error instanceof AppError && error.statusCode === 409) {
                res.status(409).json({ statusCode: 409, error: 'Conflict', message: error.message });
            }
            else {
                next(error);
            }
        }
    }


    // --- Méthodes pour Règles de Disponibilité ---

    // --- Méthodes pour Règles de Disponibilité (attachées à /me/establishments/:id) ---
    async createMyRule(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            const createDto: CreateAvailabilityRuleDto = CreateAvailabilityRuleSchema.parse(req.body);
            // Appeler le service avec l'ID de l'établissement
            const newRule = await this.establishmentService.createAvailabilityRuleForId(establishmentId, createDto);
            res.status(201).json(newRule.get({plain: true}));
        } catch (error) {
            next(error);
        }
    }

    async getMyRules(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            // Appeler le service avec l'ID de l'établissement
            const rules = await this.establishmentService.getAvailabilityRulesForId(establishmentId);
            res.status(200).json(rules.map(r => r.get({plain: true})));
        } catch (error) {
            next(error);
        }
    }

    // --- Méthodes pour Exceptions (Overrides) (attachées à /me/establishments/:id) ---
    async createMyOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            const createDto: CreateAvailabilityOverrideDto = CreateAvailabilityOverrideSchema.parse(req.body);
            // Appeler le service avec l'ID de l'établissement
            const newOverride = await this.establishmentService.createAvailabilityOverrideForId(establishmentId, createDto);
            res.status(201).json(newOverride.get({plain: true}));
        } catch (error) {
            next(error);
        }
    }

    async getMyOverrides(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            // L'ownership est déjà vérifié par le middleware ensureOwnsEstablishment
            const establishmentId = parseInt(req.params.establishmentId, 10);
            // Appeler le service avec l'ID de l'établissement
            const overrides = await this.establishmentService.getAvailabilityOverridesForId(establishmentId);
            res.status(200).json(overrides.map(o => o.get({plain: true})));
        } catch (error) {
            next(error);
        }
    }

    // --- Méthodes pour DELETE/PUT par ID de Règle/Override (appelées depuis /availability routes) ---
    // Ces méthodes supposent que le middleware (requireRuleOwner/requireOverrideOwner) a déjà vérifié l'ownership
    // PUT /api/availability/rules/:ruleId
    async updateRule(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const ruleId = parseInt(req.params.ruleId, 10);
            if (isNaN(ruleId)) throw new AppError('InvalidParameter', 400, 'Invalid rule ID.');

            const updateDto: UpdateAvailabilityRuleDto = UpdateAvailabilityRuleSchema.parse(req.body);
            const updatedRule = await this.establishmentService.updateAvailabilityRuleById(ruleId, updateDto);

            res.status(200).json(updatedRule.get({ plain: true }));
        } catch (error) {
            next(error);
        }
    }

    async deleteRule(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const ruleId = parseInt(req.params.ruleId, 10);
            if (isNaN(ruleId)) throw new AppError('InvalidParameter', 400, 'Invalid rule ID.');
            await this.establishmentService.deleteAvailabilityRuleById(ruleId); // Nouvelle méthode service
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    async updateOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const overrideId = parseInt(req.params.overrideId, 10);
            if (isNaN(overrideId)) throw new AppError('InvalidParameter', 400, 'Invalid override ID.');
            const updateDto: UpdateAvailabilityOverrideDto = UpdateAvailabilityOverrideSchema.parse(req.body);
            const updatedOverride = await this.establishmentService.updateAvailabilityOverrideById(overrideId, updateDto); // Nouvelle méthode service
            res.status(200).json(updatedOverride.get({plain: true}));
        } catch (error) {
            next(error);
        }
    }

    async deleteOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const overrideId = parseInt(req.params.overrideId, 10);
            if (isNaN(overrideId)) throw new AppError('InvalidParameter', 400, 'Invalid override ID.');
            await this.establishmentService.deleteAvailabilityOverrideById(overrideId); // Nouvelle méthode service
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    // GET /establishments/:establishmentId/memberships
    async getMemberships(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const establishmentId = parseInt(req.params.establishmentId, 10); // Validé par middleware ensureMembership
            const actorMembership = req.membership; // Attaché par ensureMembership(['ADMIN'])
            if (!actorMembership) {
                throw new AppError('MiddlewareError', 500, 'Actor membership data not found.');
            }

            // Valider les paramètres de requête pour la pagination, le filtrage et le tri
            const queryParams: GetMembershipsQueryDto = GetMembershipsQuerySchema.parse(req.query);

            const result = await this.membershipService!.getMembershipsByEstablishment(
                establishmentId, actorMembership, queryParams // Passer les paramètres validés
            );

            // Mapper les instances Membership vers MembershipDto
            const outputDtos = result.rows.map(m => mapToMembershipDto(m));

            res.status(200).json({
                data: outputDtos,
                pagination: {
                    totalItems: result.count,
                    totalPages: result.totalPages,
                    currentPage: result.currentPage,
                    itemsPerPage: queryParams.limit // Utiliser le limit effectif
                }
            });
        } catch (error) {
            if (error instanceof ZodError) {
                // Gérer les erreurs de validation Zod pour les query params
                res.status(400).json({
                    statusCode: 400,
                    error: 'Validation Error',
                    message: "Invalid query parameters.",
                    details: error.errors
                });
            } else {
                next(error);
            }
        }
    }

    // GET /establishments/:establishmentId/memberships/:membershipId
    async getMembershipById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const establishmentId = parseInt(req.params.establishmentId, 10); // Validé par middleware
            const membershipId = parseInt(req.params.membershipId, 10);
            if (isNaN(membershipId)) { throw new AppError('InvalidParameter', 400, 'Invalid membership ID.'); }

            const actorMembership = req.membership; // Attaché par middleware (Admin ou Staff)
            if (!actorMembership) { throw new AppError('MiddlewareError', 500, 'Actor membership data not found.'); }

            const membership = await this.membershipService!.getMembershipById(membershipId, establishmentId, actorMembership);
            const outputDto = mapToMembershipDto(membership); // Mapper

            res.status(200).json(outputDto);
        } catch (error) {
            // Gérer MembershipNotFoundError (404) et AuthorizationError (403)
            if (error instanceof MembershipNotFoundError) {
                res.status(404).json({ statusCode: 404, error: 'Not Found', message: error.message });
            } else if (error instanceof AuthorizationError) {
                res.status(403).json({ statusCode: 403, error: 'Forbidden', message: error.message });
            } else {
                next(error);
            }
        }
    }
}