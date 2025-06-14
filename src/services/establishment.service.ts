// src/services/establishment.service.ts
import { ModelCtor, Op, FindOptions } from 'sequelize';
import db from '../models'; // Garder pour accès facile aux autres modèles si besoin
import Establishment, { EstablishmentAttributes, EstablishmentCreationAttributes } from '../models/Establishment';
import User from '../models/User';
import Role from '../models/Role'; // Importer ROLES aussi
import AvailabilityRule from '../models/AvailabilityRule';
import AvailabilityOverride, { AvailabilityOverrideCreationAttributes } from '../models/AvailabilityOverride';
import Country from '../models/Country'; // Importer le modèle Country
import { CreateEstablishmentDto, UpdateEstablishmentDto } from '../dtos/establishment.validation';
import {
    CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto, CreateAvailabilityOverrideDto,
    UpdateAvailabilityOverrideDto, MAX_OVERRIDE_DURATION_YEARS } from '../dtos/availability.validation';
import {
    EstablishmentNotFoundError,
    DuplicateSiretError,
    InvalidSiretFormatError,
    EstablishmentProfilePictureNotFoundError,
    SiretValidationError,
} from '../errors/establishment.errors';
import {
    AvailabilityRuleNotFoundError,
    AvailabilityOverrideNotFoundError,
    AvailabilityRuleConflictError,
} from '../errors/availability.errors';
import { UserNotFoundError } from '../errors/user.errors';
import { fileService } from './file.service';
import { AppError } from '../errors/app.errors';
import { CountryNotFoundError } from "../errors/country.errors";
import { isAfter, addYears } from 'date-fns';

import { MembershipRole, MembershipStatus } from "../models";

export class EstablishmentService {
    private establishmentModel: ModelCtor<Establishment>;
    private userModel: ModelCtor<User>;
    private roleModel: ModelCtor<Role>;
    private availabilityRuleModel: ModelCtor<AvailabilityRule>;
    private availabilityOverrideModel: ModelCtor<AvailabilityOverride>;
    private countryModel: ModelCtor<Country>; // Déclarer la propriété
    // private sireneService: SireneService; // Décommenter si utilisé

    constructor(
        establishmentModel: ModelCtor<Establishment>,
        userModel: ModelCtor<User>,
        roleModel: ModelCtor<Role>,
        availabilityRuleModel: ModelCtor<AvailabilityRule>,
        availabilityOverrideModel: ModelCtor<AvailabilityOverride>,
        countryModel: ModelCtor<Country> // Accepter le modèle Country
        // sireneService: SireneService // Décommenter si utilisé
    ) {
        this.establishmentModel = establishmentModel;
        this.userModel = userModel;
        this.roleModel = roleModel;
        this.availabilityRuleModel = availabilityRuleModel;
        this.availabilityOverrideModel = availabilityOverrideModel;
        this.countryModel = countryModel; // Initialiser la propriété
        // this.sireneService = sireneService; // Décommenter si utilisé
    }

    /**
     * Crée un établissement pour un utilisateur.
     * Attribue le rôle ESTABLISHMENT_ADMIN si nécessaire.
     * Valide le format du SIRET et l'existence du pays.
     */
    async createEstablishment(ownerId: number, data: CreateEstablishmentDto): Promise<EstablishmentAttributes> {
        const owner = await this.userModel.findByPk(ownerId, {
            include: [{ model: this.roleModel, as: 'roles', attributes: ['name'] }]
        });
        if (!owner || !owner.is_active) { throw new UserNotFoundError('Owner user not found or inactive.'); }

        const siretConflict = await this.establishmentModel.findOne({ where: { siret: data.siret }, attributes: ['id'] });
        if (siretConflict) { throw new DuplicateSiretError(); }
        if (!/^\d{14}$/.test(data.siret)) { throw new InvalidSiretFormatError(); }

        const siren = data.siret.substring(0, 9);

        const country = await this.countryModel.findOne({
            where: { name: data.country_name },
            attributes: ['code', 'timezoneId'],
            include: [{ model: db.Timezone, as: 'defaultTimezone', attributes: ['name'], required: false }]
        });

        if (!country) { throw new CountryNotFoundError(data.country_name); }
        const countryCode = country.code;

        let establishmentTimezone = 'UTC';
        if (country.defaultTimezone && country.defaultTimezone.name) {
            establishmentTimezone = country.defaultTimezone.name;
        } else if (country.timezoneId) {
            const fallbackTimezone = await db.Timezone.findByPk(country.timezoneId, { attributes: ['name'] });
            if (fallbackTimezone && fallbackTimezone.name) {
                establishmentTimezone = fallbackTimezone.name;
            } else {
                console.warn(`Country ${country.code} has timezoneId ${country.timezoneId} but the timezone was not found. Defaulting to UTC for new establishment.`);
            }
        } else {
            console.warn(`Country ${country.code} has no default timezone associated. Defaulting to UTC for new establishment.`);
        }

        const newEstablishmentData: EstablishmentCreationAttributes = {
            ...data,
            name: data.name,
            siret: data.siret,
            siren: siren,
            owner_id: ownerId,
            country_code: countryCode,
            timezone: establishmentTimezone,
            is_validated: false,
        };

        // Filtrer les champs non désirés du DTO avant de passer à create
        // delete (newEstablishmentData as any).country_name; // Si country_name n'est pas un champ du modèle Establishment

        const newEstablishment = await this.establishmentModel.create(newEstablishmentData);

        const adminRole = await this.roleModel.findOne({ where: { name: 'ESTABLISHMENT_ADMIN' } }); // Supposant que ce rôle existe
        if (!adminRole) {
            console.warn("Role ESTABLISHMENT_ADMIN not found. Owner will not be made admin of the new establishment via Membership.");
        } else {
            // Créer un Membership
            await db.Membership.create({
                userId: ownerId,
                establishmentId: newEstablishment.id,
                role: MembershipRole.ADMIN,
                status: MembershipStatus.ACTIVE,
                joinedAt: new Date(),
            });
        }


        const result = await this.establishmentModel.findByPk(newEstablishment.id, {
            include: [
                { model: this.userModel, as: 'owner' },
                {
                    model: this.countryModel,
                    as: 'country', // Définir cette association sur Establishment
                    include: [{ model: db.Timezone, as: 'defaultTimezone' }]
                }
            ]
        });
        if (!result) throw new EstablishmentNotFoundError('Failed to retrieve newly created establishment.'); // Devrait pas arriver
        return result.get({ plain: true });
    }

    /**
     * Trouve les établissements appartenant à un utilisateur spécifique.
     * Utilisé pour la liste dans la section "Mes Établissements".
     */
    async findEstablishmentsByOwner(ownerId: number, options: FindOptions = {}): Promise<Establishment[]> {
        const defaultOptions: FindOptions = {
            where: { owner_id: ownerId },
            // Sélectionner les attributs nécessaires pour la liste admin
            attributes: ['id', 'name', 'city', 'is_validated', 'profile_picture_url', 'createdAt'],
            order: [['name', 'ASC']]
        };
        const mergedOptions = { ...defaultOptions, ...options };
        return this.establishmentModel.findAll(mergedOptions);
    }

    /**
     * Récupère un établissement par son ID.
     * Utilisé après une vérification d'ownership par middleware.
     * Peut inclure des associations si nécessaire.
     */
    async getEstablishmentById(establishmentId: number, options: FindOptions = {}): Promise<Establishment | null> {
        const defaultOptions: FindOptions = {
            // Pas de clause 'where' spécifique ici, l'ID est la clé primaire
            // Inclure des associations par défaut si souvent nécessaire ?
            // include: [{ model: ..., as: ...}]
        };
        const mergedOptions = { ...defaultOptions, ...options };
        return this.establishmentModel.findByPk(establishmentId, mergedOptions);
    }

    /**
     * Met à jour les informations d'un établissement par son ID.
     * L'ownership est vérifié en amont par le middleware.
     */
    async updateEstablishmentById(establishmentId: number, data: UpdateEstablishmentDto): Promise<Establishment> {
        const establishment = await this.establishmentModel.findByPk(establishmentId);
        if (!establishment) {
            throw new EstablishmentNotFoundError();
        }

        // Si le country_name est mis à jour, mettre à jour country_code aussi
        if (data.country_name && data.country_name !== establishment.country_name) {
            const country = await this.countryModel.findOne({ where: { name: data.country_name }, attributes: ['code'] });
            if (!country) { throw new CountryNotFoundError(data.country_name); }
            data.country_code = country.code; // Ajoute/remplace country_code dans le DTO de mise à jour
        } else if (data.country_name === undefined && data.country_code !== undefined) {
            // Éviter de mettre à jour seulement le code sans le nom si possible, ou valider le code?
            // Pour l'instant, on laisse passer si seul le code est fourni (peut être valide si connu)
        }


        await establishment.update(data);

        // Re-fetch pour s'assurer d'avoir l'état à jour avec toutes les données
        return (await this.establishmentModel.findByPk(establishmentId))!;
    }

    /**
     * Met à jour la photo de profil d'un établissement.
     * Supprime l'ancienne photo si elle existe.
     * L'ownership est vérifié en amont.
     */
    async updateEstablishmentPictureById(establishmentId: number, file: Express.Multer.File): Promise<Establishment> {
        const establishment = await this.establishmentModel.findByPk(establishmentId);
        if (!establishment) { throw new EstablishmentNotFoundError(); }

        const oldPictureUrl = establishment.profile_picture_url;
        let newPictureUrl: string;

        try {
            // Utiliser une sous-dossier spécifique pour les établissements?
            // Pour l'instant, fileService gère un dossier unique 'profile-pictures'
            newPictureUrl = await fileService.saveProfilePicture(file, oldPictureUrl);
        } catch (error) {
            console.error("Error saving establishment profile picture via FileService:", error);
            // Renvoyer une erreur plus spécifique ou générique
            throw new AppError('FileUploadError', 500, 'Failed to process establishment profile picture.');
        }

        await establishment.update({ profile_picture_url: newPictureUrl });
        // Pas besoin de re-fetch, l'instance 'establishment' est mise à jour par .update()
        return establishment;
    }

    /**
     * Supprime la photo de profil d'un établissement.
     * L'ownership est vérifié en amont.
     */
    async deleteEstablishmentPictureById(establishmentId: number): Promise<Establishment> {
        const establishment = await this.establishmentModel.findByPk(establishmentId);
        if (!establishment) { throw new EstablishmentNotFoundError(); }

        const currentPictureUrl = establishment.profile_picture_url;
        if (!currentPictureUrl) {
            throw new EstablishmentProfilePictureNotFoundError(); // L'image n'existe pas déjà
        }

        try {
            await fileService.deleteFileByUrl(currentPictureUrl);
        } catch (error) {
            // Logguer l'erreur de suppression de fichier mais continuer pour mettre à jour la BDD
            console.error(`Error deleting establishment profile picture file (${currentPictureUrl}), but proceeding to update DB:`, error);
        }

        await establishment.update({ profile_picture_url: null });
        return establishment; // L'instance est à jour
    }

    /**
     * Demande (simule) la validation du SIRET pour un établissement.
     * L'ownership est vérifié en amont.
     */
    async requestSiretValidationById(establishmentId: number): Promise<Establishment> {
        const establishment = await this.establishmentModel.findByPk(establishmentId);
        if (!establishment) { throw new EstablishmentNotFoundError(); }

        // Si déjà validé, ne rien faire et retourner l'établissement actuel
        if (establishment.is_validated) {
            console.log(`Establishment ${establishmentId} is already validated.`);
            return establishment;
        }

        const siret = establishment.siret;
        try {
            // Remplacer par l'appel réel au service SIRENE si implémenté
            // const validationData = await this.sireneService.validateAndFetchData(siret);
            const validationData = { isValid: true }; // Placeholder pour la simulation

            if (validationData.isValid) {
                await establishment.update({ is_validated: true });
                console.log(`Establishment ${establishmentId} successfully validated (simulated).`);
                return establishment; // L'instance est à jour
            } else {
                // Le service SIRENE (ou la simulation) a indiqué que ce n'est pas valide
                throw new SiretValidationError("SIRET could not be validated.");
            }
        } catch (error: any) {
            console.error(`Error during SIRET validation call simulation for ${siret}:`, error);
            // Gérer les erreurs spécifiques du service SIRENE ou les erreurs génériques
            // if (error instanceof SireneApiConnectionError) throw new SireneApiError();
            throw new SiretValidationError(error.message || "Validation failed during processing.");
        }
    }

    /**
     * Récupère les établissements publics (validés) pour affichage général.
     * Gère la pagination.
     */
    async findPublicEstablishments(options: FindOptions = {}): Promise<{ rows: Establishment[]; count: number }> {
        const defaultOptions: FindOptions = {
            where: { is_validated: true }, // Seulement les établissements validés
            attributes: [ // Sélectionner les champs publics
                'id', 'name', 'description', 'address_line1', 'address_line2',
                'city', 'postal_code', 'region', 'country_name', 'country_code',
                'latitude', 'longitude', 'phone_number', 'email',
                'profile_picture_url', 'createdAt', 'updatedAt'
            ],
            order: [['name', 'ASC']] // Ordre par défaut
        };
        // Fusionner les options (pagination, filtres supplémentaires potentiels)
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            where: { ...defaultOptions.where, ...options.where } // Fusionner les 'where'
        };
        return this.establishmentModel.findAndCountAll(mergedOptions);
    }

    /**
     * Récupère UN établissement public spécifique par son ID.
     * Vérifie qu'il existe et qu'il est validé.
     */
    async getPublicEstablishmentById(id: number): Promise<Establishment> {
        const establishment = await this.establishmentModel.findByPk(id, {
            // Inclure seulement les attributs publics
            attributes: [
                'id', 'name', 'description', 'address_line1', 'address_line2',
                'city', 'postal_code', 'region', 'country_name', 'country_code',
                'latitude', 'longitude', 'phone_number', 'email',
                'profile_picture_url', 'is_validated', // Inclure is_validated pour la vérification
                'createdAt', 'updatedAt'
            ],
        });

        // Vérifier si trouvé ET validé
        if (!establishment || !establishment.is_validated) {
            throw new EstablishmentNotFoundError(); // 404 si non trouvé ou non validé
        }

        // Optionnel: Exclure 'is_validated' de l'objet retourné si on ne veut pas l'exposer
        // const { is_validated, ...publicData } = establishment.get({ plain: true });
        // return publicData as Establishment;

        return establishment; // Retourne l'objet complet (incluant is_validated = true)
    }

    // --- Méthodes pour Availability Rules ---

    /**
     * Crée une règle de disponibilité pour un établissement.
     * L'ownership est vérifié en amont.
     * Vérifie les conflits potentiels (une seule règle par jour).
     */
    async createAvailabilityRuleForId(establishmentId: number, data: CreateAvailabilityRuleDto): Promise<AvailabilityRule> {
        // Vérifier si une règle existe déjà pour ce jour
        const existingRule = await this.availabilityRuleModel.findOne({
            where: { establishment_id: establishmentId, day_of_week: data.day_of_week },
            attributes: ['id']
        });
        if (existingRule) {
            throw new AvailabilityRuleConflictError(`An availability rule already exists for day ${data.day_of_week}. Use PUT to update.`);
        }

        const newRule = await this.availabilityRuleModel.create({
            ...data,
            establishment_id: establishmentId,
        });
        return newRule;
    }

    /**
     * Récupère toutes les règles de disponibilité pour un établissement.
     * L'ownership est vérifié en amont.
     */
    async getAvailabilityRulesForId(establishmentId: number, options: FindOptions = {}): Promise<AvailabilityRule[]> {
        const defaultOptions: FindOptions = {
            where: { establishment_id: establishmentId },
            order: [['day_of_week', 'ASC']],
            // Sélectionner tous les attributs de la règle par défaut
        };
        const mergedOptions = { ...defaultOptions, ...options };
        return this.availabilityRuleModel.findAll(mergedOptions);
    }

    /**
     * Met à jour une règle de disponibilité par son ID.
     * Vérifie les conflits si le jour de la semaine change.
     * L'ownership est vérifié par le middleware requireRuleOwner.
     */
    async updateAvailabilityRuleById(ruleId: number, data: UpdateAvailabilityRuleDto): Promise<AvailabilityRule> {
        const rule = await this.availabilityRuleModel.findByPk(ruleId);
        if (!rule) {
            throw new AvailabilityRuleNotFoundError();
        }

        if (data.day_of_week !== undefined && data.day_of_week !== rule.day_of_week) {
            const conflictCheck = await this.availabilityRuleModel.findOne({
                where: {
                    establishment_id: rule.establishment_id,
                    day_of_week: data.day_of_week,
                    id: { [Op.ne]: ruleId }
                },
                attributes: ['id']
            });
            if (conflictCheck) {
                throw new AvailabilityRuleConflictError(`An availability rule already exists for the target day ${data.day_of_week}.`);
            }
        }
        await rule.update(data);
        return rule;
    }

    /**
     * Supprime une règle de disponibilité par son ID.
     * L'ownership est vérifié par le middleware requireRuleOwner.
     */
    async deleteAvailabilityRuleById(ruleId: number): Promise<void> {
        const rule = await this.availabilityRuleModel.findByPk(ruleId, { attributes: ['id'] });
        if (!rule) {
            throw new AvailabilityRuleNotFoundError();
        }
        await rule.destroy();
    }

    // --- Méthodes pour Availability Overrides ---

    /**
     * Crée une exception de disponibilité pour un établissement.
     * L'ownership est vérifié en amont.
     */
    async createAvailabilityOverrideForId(establishmentId: number, data: CreateAvailabilityOverrideDto): Promise<AvailabilityOverride> {
        const createData: AvailabilityOverrideCreationAttributes = {
            establishment_id: establishmentId,
            start_datetime: data.start_datetime, // Validé par Zod
            end_datetime: data.end_datetime,     // Validé par Zod
            is_available: data.is_available,     // Validé par Zod
            reason: data.reason ?? null
        };
        return await this.availabilityOverrideModel.create(createData);
    }

    /**
     * Récupère toutes les règles de disponibilité pour un établissement.
     * L'ownership est vérifié en amont.
     */
    async getAvailabilityOverridesForId(establishmentId: number, options: FindOptions = {}): Promise<AvailabilityOverride[]> {
        const defaultOptions: FindOptions = { where: { establishment_id: establishmentId }, order: [['start_datetime', 'ASC']]};
        const mergedOptions = { ...defaultOptions, ...options, where: { ...defaultOptions.where, ...options.where } };
        return this.availabilityOverrideModel.findAll(mergedOptions);
    }

    /**
     * Met à jour une exception de disponibilité par son ID.
     * L'ownership est vérifié par le middleware requireOverrideOwner.
     */
    async updateAvailabilityOverrideById(overrideId: number, data: UpdateAvailabilityOverrideDto): Promise<AvailabilityOverride> {
        const override = await this.availabilityOverrideModel.findByPk(overrideId);
        if (!override) { throw new AvailabilityOverrideNotFoundError(); }

        const proposedData = { ...override.get({ plain: true }), ...data };
        const proposedStartDate = new Date(proposedData.start_datetime);
        const proposedEndDate = new Date(proposedData.end_datetime);

        if (data.start_datetime) {
            const now = new Date();
            if (proposedStartDate.getTime() <= now.getTime()) {
                throw new AppError('InvalidInput', 400, 'Start date/time cannot be set in the past');
            }
        }
        if (proposedStartDate >= proposedEndDate) {
            throw new AppError('InvalidInput', 400, 'Start date/time must be before end date/time');
        }
        if (isAfter(proposedEndDate, addYears(proposedStartDate, MAX_OVERRIDE_DURATION_YEARS))) {
            throw new AppError('Validation Error', 400, `Availability override duration cannot exceed ${MAX_OVERRIDE_DURATION_YEARS} year(s)`);
        }

        await override.update(data);
        return override
    }

    /**
     * Supprime une exception de disponibilité par son ID.
     * L'ownership est vérifié par le middleware requireOverrideOwner.
     */
    async deleteAvailabilityOverrideById(overrideId: number): Promise<void> {
        const override = await this.availabilityOverrideModel.findByPk(overrideId, { attributes: ['id'] });
        if (!override) { throw new AvailabilityOverrideNotFoundError(); }
        await override.destroy();
    }
}