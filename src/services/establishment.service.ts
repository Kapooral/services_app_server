// src/services/establishment.service.ts
import { ModelCtor, Op, FindOptions } from 'sequelize';
import db from '../models'; // Garder pour accès facile aux autres modèles si besoin
import Establishment, { EstablishmentAttributes } from '../models/Establishment';
import User from '../models/User';
import Role, { ROLES } from '../models/Role'; // Importer ROLES aussi
import AvailabilityRule, { AvailabilityRuleAttributes } from '../models/AvailabilityRule';
import AvailabilityOverride, { AvailabilityOverrideAttributes } from '../models/AvailabilityOverride';
import Country from '../models/Country'; // Importer le modèle Country
import { CreateEstablishmentDto, UpdateEstablishmentDto } from '../dtos/establishment.validation';
import { CreateAvailabilityRuleDto } from '../dtos/availability.validation';
import { CreateAvailabilityOverrideDto, UpdateAvailabilityOverrideDto } from '../dtos/availability.validation';
import {
    EstablishmentNotFoundError,
    DuplicateSiretError,
    AlreadyOwnerError, // Considérer si cette logique est toujours active
    InvalidSiretFormatError,
    EstablishmentProfilePictureNotFoundError,
    SiretValidationError,
    SireneApiError // Si utilisé
} from '../errors/establishment.errors';
import {
    AvailabilityRuleNotFoundError,
    AvailabilityOverrideNotFoundError,
    AvailabilityRuleConflictError,
    // AvailabilityOwnershipError // Normalement géré par middleware
} from '../errors/availability.errors';
import { UserNotFoundError } from '../errors/user.errors';
import { fileService } from './file.service';
import { AppError } from '../errors/app.errors';
import { CountryNotFoundError } from "../errors/country.errors";
// import { SireneService } from './sirene.service'; // Décommenter si utilisé

const ESTABLISHMENT_ADMIN_ROLE_NAME = ROLES.ESTABLISHMENT_ADMIN; // Utiliser l'enum importé

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
    async createEstablishment(ownerId: number, data: CreateEstablishmentDto): Promise<Establishment> {
        const owner = await this.userModel.findByPk(ownerId, {
            include: [{ model: this.roleModel, as: 'roles', attributes: ['name'] }] // Inclure les rôles pour vérification
        });
        if (!owner || !owner.is_active) {
            throw new UserNotFoundError('Owner user not found or inactive.');
        }

        // Logique de limitation à 1 établissement par user (à confirmer si toujours d'actualité)
        // const existingEstablishmentCheck = await this.establishmentModel.findOne({ where: { owner_id: ownerId }, attributes: ['id'] });
        // if (existingEstablishmentCheck) {
        //     throw new AlreadyOwnerError();
        // }

        // Vérifier l'unicité du SIRET
        const siretConflict = await this.establishmentModel.findOne({ where: { siret: data.siret }, attributes: ['id'] });
        if (siretConflict) {
            throw new DuplicateSiretError();
        }

        // Vérifier le format du SIRET
        if (!/^\d{14}$/.test(data.siret)) { throw new InvalidSiretFormatError(); }
        const siren = data.siret.substring(0, 9);

        // Vérifier et récupérer le code pays
        const country = await this.countryModel.findOne({ where: { name: data.country_name }, attributes: ['code'] });
        if (!country) { throw new CountryNotFoundError(data.country_name); }
        const countryCode = country.code;

        // Créer l'établissement
        const newEstablishment = await this.establishmentModel.create({
            ...data, // Les données validées du DTO
            siren: siren,
            owner_id: ownerId,
            country_code: countryCode, // Code pays récupéré
            is_validated: false, // Non validé par défaut
            // profile_picture_url est géré séparément via upload
        });

        // Attribuer le rôle ESTABLISHMENT_ADMIN si l'utilisateur ne l'a pas déjà
        const hasAdminRole = owner.roles?.some(role => role.name === ESTABLISHMENT_ADMIN_ROLE_NAME);
        if (!hasAdminRole) {
            const adminRole = await this.roleModel.findOne({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
            if (adminRole) {
                await owner.addRole(adminRole);
                console.log(`Role ${ESTABLISHMENT_ADMIN_ROLE_NAME} added to user ${ownerId}.`);
            } else {
                // Cas critique : le rôle n'existe pas en BDD
                console.error(`FATAL: Role ${ESTABLISHMENT_ADMIN_ROLE_NAME} not found in database.`);
                // On pourrait choisir de rollback la création de l'établissement ici si possible
                // ou lancer une erreur 500
                throw new AppError('RoleConfigurationError', 500, `Required role ${ESTABLISHMENT_ADMIN_ROLE_NAME} is missing.`);
            }
        }

        // Re-fetch pour inclure les associations ou valeurs par défaut si nécessaire
        // Utiliser findByPk pour être sûr d'avoir l'instance complète
        return (await this.establishmentModel.findByPk(newEstablishment.id, {
            // Inclure l'owner avec ses rôles pourrait être utile pour le DTO admin
            include: [{ model: this.userModel, as: 'owner' }]
        }))!;
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
        // Ajouter des validations de conflit si nécessaire (chevauchement d'overrides?)
        const newOverride = await this.availabilityOverrideModel.create({
            ...data,
            establishment_id: establishmentId,
        });
        return newOverride;
    }

    /**
     * Récupère toutes les exceptions de disponibilité pour un établissement.
     * L'ownership est vérifié en amont.
     * Peut accepter des options pour filtrer par période.
     */
    async getAvailabilityOverridesForId(establishmentId: number, options: FindOptions = {}): Promise<AvailabilityOverride[]> {
        const defaultOptions: FindOptions = {
            where: { establishment_id: establishmentId },
            order: [['start_datetime', 'ASC']],
            // Sélectionner tous les attributs par défaut
        };
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            where: { ...defaultOptions.where, ...options.where }
        };
        return this.availabilityOverrideModel.findAll(mergedOptions);
    }

    /**
     * Met à jour une exception de disponibilité par son ID.
     * L'ownership est vérifié par le middleware requireOverrideOwner.
     */
    async updateAvailabilityOverrideById(overrideId: number, data: UpdateAvailabilityOverrideDto): Promise<AvailabilityOverride> {
        const override = await this.availabilityOverrideModel.findByPk(overrideId);
        if (!override) {
            throw new AvailabilityOverrideNotFoundError();
        }

        // Valider les dates si les deux sont fournies dans la mise à jour partielle
        const checkData = { ...override.get({ plain: true }), ...data }; // Fusionner ancien et nouveau pour validation
        if (checkData.start_datetime >= checkData.end_datetime) {
            throw new AppError('InvalidInput', 400, 'Start date/time must be before end date/time');
        }

        await override.update(data);
        // Re-fetch pour être sûr
        return (await this.availabilityOverrideModel.findByPk(overrideId))!;
    }

    /**
     * Supprime une exception de disponibilité par son ID.
     * L'ownership est vérifié par le middleware requireOverrideOwner.
     */
    async deleteAvailabilityOverrideById(overrideId: number): Promise<void> {
        const override = await this.availabilityOverrideModel.findByPk(overrideId, { attributes: ['id'] });
        if (!override) {
            throw new AvailabilityOverrideNotFoundError();
        }
        await override.destroy();
    }
}