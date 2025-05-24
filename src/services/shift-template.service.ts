import { ModelCtor, Op, Transaction, WhereOptions  } from 'sequelize';
import moment from 'moment-timezone'; // Pour la gestion des fuseaux horaires
import db from '../models';
import { ShiftTemplate, ShiftTemplateRule, ShiftTemplateAttributes, ShiftTemplateRuleAttributes } from '../models/ShiftTemplate';
import StaffAvailability, { StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes } from '../models/StaffAvailability'; // Assurez-vous que ce modèle existe
import Establishment, { EstablishmentAttributes } from '../models/Establishment';
import Membership, { MembershipAttributes } from '../models/Membership';
import { AppError } from '../errors/app.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';
import { ShiftTemplateCreationError, ShiftTemplateNotFoundError, ApplyTemplateError  } from '../errors/planning.errors';
import { CreateShiftTemplateDto, UpdateShiftTemplateDto, ApplyShiftTemplateDto, ShiftTemplateRuleInputDto, ListShiftTemplatesQueryDto, ApplyTemplateErrorDetail  } from '../dtos/shift-template.validation';
import { PaginationDto, createPaginationResult } from '../dtos/pagination.validation';
import { StaffAvailabilityService } from './staff-availability.service';

// Types temporaires pour les DTOs s'ils ne sont pas encore définis
type ShiftTemplateOutputDto = ShiftTemplateAttributes & { rules: ShiftTemplateRuleAttributes[], creator?: { username: string } }; // Simplifié

export class ShiftTemplateService {
    private shiftTemplateModel: ModelCtor<ShiftTemplate>;
    private shiftTemplateRuleModel: ModelCtor<ShiftTemplateRule>;
    private staffAvailabilityModel: ModelCtor<StaffAvailability>;
    private establishmentModel: ModelCtor<Establishment>;
    private membershipModel: ModelCtor<Membership>;
    private staffAvailabilityService: StaffAvailabilityService; // Optionnel, si la création passe par un service

    constructor(staffAvailabilityService?: StaffAvailabilityService) { // staffAvailabilityService est optionnel
        this.shiftTemplateModel = db.ShiftTemplate;
        this.shiftTemplateRuleModel = db.ShiftTemplateRule;
        this.staffAvailabilityModel = db.StaffAvailability;
        this.establishmentModel = db.Establishment;
        this.membershipModel = db.Membership;
        this.staffAvailabilityService = staffAvailabilityService || new StaffAvailabilityService(); // Ou instancier directement
    }

    async createShiftTemplate(
        dto: CreateShiftTemplateDto,
        actorMembership: MembershipAttributes
    ): Promise<ShiftTemplateOutputDto> {
        const { name, description, rules } = dto;

        const existingTemplate = await this.shiftTemplateModel.findOne({
            where: { name, establishmentId: actorMembership.establishmentId },
        });
        if (existingTemplate) {
            throw new ShiftTemplateCreationError(`A shift template with the name "${name}" already exists for this establishment.`);
        }

        const transaction = await db.sequelize.transaction();
        try {
            const newTemplate = await this.shiftTemplateModel.create({
                name,
                description,
                establishmentId: actorMembership.establishmentId,
                createdByMembershipId: actorMembership.id,
            }, { transaction });

            const rulePromises = rules.map(ruleDto =>
                this.shiftTemplateRuleModel.create({
                    shiftTemplateId: newTemplate.id,
                    ...ruleDto,
                }, { transaction })
            );
            const createdRules = await Promise.all(rulePromises);

            await transaction.commit();

            // Récupérer le créateur pour l'output DTO
            const creator = await this.membershipModel.findByPk(newTemplate.createdByMembershipId, {
                include: [{ model: db.User, as: 'user', attributes: ['username'] }]
            });

            return {
                ...newTemplate.get({ plain: true }),
                rules: createdRules.map(r => r.get({ plain: true })),
                creator: creator?.user ? { username: creator.user.username } : undefined
            };
        } catch (error) {
            await transaction.rollback();
            console.error("Error creating shift template:", error);
            if (error instanceof ShiftTemplateCreationError) throw error;
            throw new ShiftTemplateCreationError(`Failed to create shift template: ${(error as Error).message}`);
        }
    }

    async getShiftTemplateById(templateId: number, establishmentId: number): Promise<ShiftTemplateOutputDto | null> {
        const template = await this.shiftTemplateModel.findOne({
            where: { id: templateId, establishmentId },
            include: [
                { model: this.shiftTemplateRuleModel, as: 'rules' },
                { model: this.membershipModel, as: 'creator', include: [{ model: db.User, as: 'user', attributes: ['username']}] }
            ],
        });

        if (!template) return null;

        return {
            ...template.get({ plain: true }),
            rules: template.rules ? template.rules.map(r => r.get({ plain: true })) : [],
            creator: template.creator?.user ? { username: template.creator.user.username } : undefined
        };
    }

    async listShiftTemplatesForEstablishment(
        establishmentId: number,
        queryDto: ListShiftTemplatesQueryDto
    ): Promise<PaginationDto<ShiftTemplateOutputDto>> {
        const { page = 1, limit = 10, sortBy = 'name', sortOrder = 'asc', search } = queryDto;
        const offset = (page - 1) * limit;

        const whereConditions: WhereOptions<ShiftTemplateAttributes> = {
            establishmentId,
        };
        if (search) {
            whereConditions.name = { [Op.iLike]: `%${search}%` }; // Ajuster iLike pour MySQL -> LIKE
        }

        const { count: countResult, rows } = await this.shiftTemplateModel.findAndCountAll({
            where: whereConditions,
            include: [
                { model: this.membershipModel, as: 'creator', include: [{ model: db.User, as: 'user', attributes: ['username']}] }
            ],
            limit,
            offset,
            order: [[sortBy, sortOrder.toUpperCase() as 'ASC' | 'DESC']],
        });

        const totalItems = Array.isArray(countResult) && countResult.length > 0
            ? countResult[0].count
            : (typeof countResult === 'number' ? countResult : 0);

        const data = rows.map(template => ({
            ...template.get({ plain: true }),
            rules: [],
            creator: template.creator?.user ? { username: template.creator.user.username } : undefined
        }));

        return createPaginationResult(data, { totalItems, currentPage: page, itemsPerPage: limit });
    }

    async updateShiftTemplate(
        templateId: number,
        dto: UpdateShiftTemplateDto,
        establishmentId: number
    ): Promise<ShiftTemplateOutputDto> {
        const { name, description, rules } = dto;

        const template = await this.shiftTemplateModel.findOne({
            where: { id: templateId, establishmentId },
        });
        if (!template) {
            throw new ShiftTemplateNotFoundError();
        }

        if (name && name !== template.name) {
            const existingName = await this.shiftTemplateModel.findOne({
                where: { name, establishmentId, id: { [Op.ne]: templateId } },
            });
            if (existingName) {
                throw new ShiftTemplateCreationError(`A shift template with the name "${name}" already exists.`);
            }
        }

        const transaction = await db.sequelize.transaction();
        try {
            await template.update({
                name: name ?? template.name,
                description: description !== undefined ? description : template.description,
            }, { transaction });

            if (rules) { // Si des règles sont fournies, remplacer les existantes
                await this.shiftTemplateRuleModel.destroy({ where: { shiftTemplateId: templateId }, transaction });
                const rulePromises = rules.map(ruleDto =>
                    this.shiftTemplateRuleModel.create({
                        shiftTemplateId: templateId,
                        ...ruleDto,
                    }, { transaction })
                );
                await Promise.all(rulePromises);
            }
            await transaction.commit();

            // Re-fetch pour inclure les règles mises à jour et le créateur
            const updatedTemplateInstance = await this.getShiftTemplateById(templateId, establishmentId);
            if (!updatedTemplateInstance) throw new ShiftTemplateNotFoundError("Failed to re-fetch updated template."); // Ne devrait pas arriver
            return updatedTemplateInstance;

        } catch (error) {
            await transaction.rollback();
            console.error(`Error updating shift template ID ${templateId}:`, error);
            if (error instanceof ShiftTemplateCreationError || error instanceof ShiftTemplateNotFoundError) throw error;
            throw new AppError('UpdateError', 500, `Failed to update shift template: ${(error as Error).message}`);
        }
    }

    async deleteShiftTemplate(templateId: number, establishmentId: number): Promise<void> {
        const template = await this.shiftTemplateModel.findOne({
            where: { id: templateId, establishmentId },
        });
        if (!template) {
            throw new ShiftTemplateNotFoundError();
        }
        // La suppression des ShiftTemplateRule se fera par ON DELETE CASCADE
        // Les StaffAvailability.appliedShiftTemplateRuleId seront mis à NULL par ON DELETE SET NULL
        await template.destroy();
    }

    async applyShiftTemplateToMemberships(
        templateId: number,
        dto: ApplyShiftTemplateDto,
        establishmentId: number,
        actorAdminMembershipId: number
    ): Promise<{ generatedAvailabilitiesCount: number; errors: ApplyTemplateErrorDetail[] }> {
        const { targetMembershipIds, applicationStartDate, applicationEndDate, overwriteMode = 'REPLACE_ALL_IN_PERIOD' } = dto;
        const errors: ApplyTemplateErrorDetail[] = [];
        let generatedAvailabilitiesCount = 0;

        const template = await this.shiftTemplateModel.findOne({
            where: { id: templateId, establishmentId },
            include: [{ model: this.shiftTemplateRuleModel, as: 'rules', required: true }],
        });
        if (!template || !template.rules || template.rules.length === 0) {
            throw new ShiftTemplateNotFoundError("Shift template not found or has no rules.");
        }

        const establishment = await this.establishmentModel.findByPk(establishmentId);
        if (!establishment || !establishment.timezone) {
            throw new EstablishmentNotFoundError("Establishment not found or timezone not configured.");
        }
        const establishmentTimezone = establishment.timezone;

        const transaction = await db.sequelize.transaction();
        try {
            for (const targetMembershipId of targetMembershipIds) {
                const targetMembership = await this.membershipModel.findOne({
                    where: { id: targetMembershipId, establishmentId },
                });
                if (!targetMembership) {
                    errors.push({ membershipId: targetMembershipId, error: `Membership ID ${targetMembershipId} not found or does not belong to establishment ID ${establishmentId}.` });
                    continue;
                }

                // 1. Gérer les StaffAvailability existantes selon overwriteMode
                const periodStart = moment.tz(applicationStartDate, 'YYYY-MM-DD', establishmentTimezone).startOf('day').utc().toDate();
                const periodEnd = applicationEndDate
                    ? moment.tz(applicationEndDate, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate()
                    : moment(periodStart).add(10, 'years').endOf('day').utc().toDate();

                // Conditions de base pour le chevauchement de période
                const baseDeleteConditions: WhereOptions<StaffAvailabilityAttributes> = {
                    membershipId: targetMembershipId,
                    effectiveStartDate: { [Op.lte]: moment(periodEnd).format('YYYY-MM-DD') },
                    [Op.or]: [
                        { effectiveEndDate: { [Op.gte]: moment(periodStart).format('YYYY-MM-DD') } },
                        { effectiveEndDate: null }
                    ]
                };

                if (overwriteMode === 'REPLACE_ALL_IN_PERIOD') {
                    await this.staffAvailabilityModel.destroy({ where: baseDeleteConditions, transaction });
                } else if (overwriteMode === 'REPLACE_TEMPLATE_GENERATED_IN_PERIOD') {
                    // Fusionner la condition supplémentaire dans une nouvelle clause where
                    const specificDeleteConditions: WhereOptions<StaffAvailabilityAttributes> = {
                        ...baseDeleteConditions, // Inclure les conditions de base
                        appliedShiftTemplateRuleId: { [Op.not]: null } // Ajouter la condition spécifique
                    };
                    await this.staffAvailabilityModel.destroy({ where: specificDeleteConditions, transaction });
                }
                // 'ADD_ONLY_IF_NO_CONFLICT' n'est pas implémenté ici, génèrera des doublons ou des erreurs si uniques

                // 2. Générer et créer les nouvelles StaffAvailability
                for (const rule of template.rules) {
                    // Analyser la rruleString de la règle du template pour extraire l'heure DTSTART
                    // Exemple: FREQ=WEEKLY;BYDAY=MO;DTSTART=T090000 -> extraire T090000
                    const dtStartTimeMatch = rule.rruleString.match(/DTSTART=([^;T0-9]*T?([0-9]{2})([0-9]{2})([0-9]{2}))/);
                    let ruleDtStartHour = 9, ruleDtStartMinute = 0, ruleDtStartSecond = 0;
                    if (dtStartTimeMatch) {
                        ruleDtStartHour = parseInt(dtStartTimeMatch[2], 10);
                        ruleDtStartMinute = parseInt(dtStartTimeMatch[3], 10);
                        ruleDtStartSecond = parseInt(dtStartTimeMatch[4], 10);
                    } else {
                        console.warn(`Could not parse DTSTART time from rule rruleString: "${rule.rruleString}". Defaulting to 00:00:00.`);
                        // Ou lancer une erreur si une heure DTSTART est impérative dans les règles de template
                    }

                    // Construire le DTSTART absolu en UTC pour la StaffAvailability
                    // Le premier jour d'application devient le point de départ pour l'heure de la règle
                    const absoluteDtStartUTC = moment.tz(applicationStartDate, 'YYYY-MM-DD', establishmentTimezone)
                        .hour(ruleDtStartHour)
                        .minute(ruleDtStartMinute)
                        .second(ruleDtStartSecond)
                        .millisecond(0)
                        .utc()
                        .toDate();

                    // Reconstruire la rruleString pour StaffAvailability avec le DTSTART absolu UTC
                    // Enlever l'ancien DTSTART et ajouter le nouveau. Garder les autres parties de la règle.
                    let staffAvailRRuleString = rule.rruleString.replace(/DTSTART=[^;]*/, '');
                    const baseRRule = staffAvailRRuleString.replace(/^;/, '');
                    staffAvailRRuleString = `DTSTART=${moment.utc(absoluteDtStartUTC).format('YYYYMMDDTHHmmss')}Z;${baseRRule}`.replace(/;;/g,';');


                    const staffAvailData: StaffAvailabilityCreationAttributes = {
                        membershipId: targetMembershipId,
                        rruleString: staffAvailRRuleString,
                        durationMinutes: rule.durationMinutes,
                        isWorking: rule.isWorking,
                        effectiveStartDate: applicationStartDate,
                        effectiveEndDate: applicationEndDate,
                        description: rule.ruleDescription || `Generated by template: ${template.name}`,
                        appliedShiftTemplateRuleId: rule.id,
                        createdByMembershipId: actorAdminMembershipId,
                    };

                    // Valider que effectiveEndDate n'est pas avant effectiveStartDate
                    if (applicationEndDate && moment(applicationEndDate).isBefore(moment(applicationStartDate))) {
                        errors.push({ membershipId: targetMembershipId, ruleId: rule.id, error: 'Application end date cannot be before start date.' });
                        continue;
                    }

                    await this.staffAvailabilityModel.create(staffAvailData, { transaction });
                    generatedAvailabilitiesCount++;
                }
            }
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error(`Error applying shift template ID ${templateId}:`, error);
            throw new AppError('ApplyTemplateError', 500, `Failed to apply shift template: ${(error as Error).message}`);
        }
        return { generatedAvailabilitiesCount, errors };
    }
}