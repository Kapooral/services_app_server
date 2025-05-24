// src/services/staff-availability.service.ts
import { ModelCtor, Op, WhereOptions } from 'sequelize';
import moment from 'moment-timezone';
import db from '../models';
import StaffAvailability, { StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes } from '../models/StaffAvailability';
import Membership, { MembershipAttributes } from '../models/Membership';
import Establishment from '../models/Establishment';
import TimeOffRequest from '../models/TimeOffRequest';

import { AppError } from '../errors/app.errors';
import { StaffAvailabilityNotFoundError, StaffAvailabilityCreationError, StaffAvailabilityUpdateError, StaffAvailabilityConflictError } from '../errors/planning.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';
import { PaginationDto, createPaginationResult } from '../dtos/pagination.validation';
import { RRule } from 'rrule'; // RRule est utilisé pour validateRRuleString

// Importer le service de détection de chevauchement et ses types
import { OverlapDetectionService, AvailabilityCandidate } from './overlap-detection.service'; // ConflictCheckResult est implicitement utilisé via le retour de checkForConflicts

// Utiliser les types inférés des DTOs Zod
import {
    CreateStaffAvailabilityDto as ZodCreateStaffAvailabilityDto,
    UpdateStaffAvailabilityDto as ZodUpdateStaffAvailabilityDto,
    ListStaffAvailabilitiesQueryDto as ZodListStaffAvailabilitiesQueryDto
} from '../dtos/staff-availability.validation';

// Importer les utilitaires pour les rrules
import { generateOccurrences, calculateRuleActualEndDateUTC } from '../utils/rrule.utils';

export class StaffAvailabilityService {
    private staffAvailabilityModel: ModelCtor<StaffAvailability>;
    private membershipModel: ModelCtor<Membership>;
    private establishmentModel: ModelCtor<Establishment>;
    // timeOffRequestModel n'est plus une propriété directe, il est utilisé par OverlapDetectionService
    private overlapDetectionService: OverlapDetectionService;

    constructor(
        overlapDetectionService: OverlapDetectionService, // Injecté
        staffAvailabilityModel: ModelCtor<StaffAvailability> = db.StaffAvailability,
        membershipModel: ModelCtor<Membership> = db.Membership,
        establishmentModel: ModelCtor<Establishment> = db.Establishment,
        // timeOffRequestModel: ModelCtor<TimeOffRequest> = db.TimeOffRequest // Plus besoin de l'injecter ici directement
    ) {
        this.staffAvailabilityModel = staffAvailabilityModel;
        this.membershipModel = membershipModel;
        this.establishmentModel = establishmentModel;
        // this.timeOffRequestModel = timeOffRequestModel; // Retiré
        this.overlapDetectionService = overlapDetectionService;
    }

    // Méthode privée pour récupérer le fuseau horaire, utilisée par plusieurs méthodes
    private async getEstablishmentTimezone(establishmentId: number): Promise<string> {
        const establishment = await this.establishmentModel.findByPk(establishmentId, {
            attributes: ['timezone'],
        });
        if (!establishment?.timezone) {
            throw new AppError('EstablishmentConfigurationError', 500, `Establishment ID ${establishmentId} timezone not configured or establishment not found.`);
        }
        return establishment.timezone;
    }

    private async validateRRuleString(rruleString: string): Promise<void> {
        // ... (inchangé par rapport à la version précédente)
        try {
            if (!rruleString) {
                throw new Error('RRULE string cannot be empty.');
            }
            if (rruleString.includes('FREQ=')) {
                const rule = RRule.fromString(rruleString);
                if (!rule.options.freq) {
                    throw new Error('RRULE string with FREQ component is invalid or incomplete.');
                }
            } else if (!rruleString.includes('DTSTART=')) {
                throw new Error('RRULE string for a single event must contain DTSTART.');
            }
            RRule.fromString(rruleString);
        } catch (e) {
            throw new StaffAvailabilityCreationError(`Invalid RRule string format: ${(e as Error).message}`);
        }
    }

    private async validateCommonFields(
        dto: { durationMinutes: number; effectiveStartDate: string; effectiveEndDate?: string | null },
    ): Promise<void> {
        // ... (inchangé par rapport à la version précédente)
        if (dto.durationMinutes <= 0) {
            throw new StaffAvailabilityCreationError('Duration must be a positive integer.');
        }
        if (dto.effectiveEndDate && dto.effectiveStartDate && moment(dto.effectiveEndDate).isBefore(moment(dto.effectiveStartDate))) {
            throw new StaffAvailabilityCreationError('Effective end date cannot be before effective start date.');
        }
    }

    // --- Méthode Privée pour Calculer les Champs Computed ---
    private async calculateComputedTimingFields(
        data: {
            rruleString: string;
            durationMinutes: number;
            effectiveStartDate: string;
            effectiveEndDate?: string | null;
        },
        establishmentTimezone: string
    ): Promise<{ computed_min_start_utc: Date; computed_max_end_utc: Date | null }> {
        // Calcul de computed_min_start_utc
        // Fenêtre de recherche pour la première occurrence: autour de effectiveStartDate
        // On prend une fenêtre un peu large pour capturer la première occurrence même si BYDAY la décale.
        const searchWindowStartForMin = moment.tz(data.effectiveStartDate, 'YYYY-MM-DD', establishmentTimezone)
            .startOf('day').subtract(7, 'days').utc().toDate(); // Une semaine avant au cas où
        const searchWindowEndForMin = moment.tz(data.effectiveStartDate, 'YYYY-MM-DD', establishmentTimezone)
            .endOf('day').add(Math.max(7, data.durationMinutes / (24*60) + 14), 'days').utc().toDate(); // Une fenêtre raisonnable après

        const firstOccurrences = generateOccurrences(
            data.rruleString,
            data.durationMinutes,
            data.effectiveStartDate,
            data.effectiveEndDate,
            searchWindowStartForMin,
            searchWindowEndForMin,
            establishmentTimezone
        );

        if (firstOccurrences.length === 0) {
            throw new StaffAvailabilityCreationError("The RRule provided does not generate any occurrences within its effective period or a reasonable forecast.");
        }
        const computed_min_start_utc = firstOccurrences[0].start;

        // Calcul de computed_max_end_utc
        const computed_max_end_utc = calculateRuleActualEndDateUTC(
            data.rruleString,
            data.durationMinutes,
            data.effectiveStartDate,
            data.effectiveEndDate,
            establishmentTimezone
        );

        return { computed_min_start_utc, computed_max_end_utc };
    }


    async createStaffAvailability(
        dto: ZodCreateStaffAvailabilityDto,
        actorAdminMembership: MembershipAttributes,
        targetMembershipId: number
    ): Promise<StaffAvailabilityAttributes> {
        await this.validateRRuleString(dto.rruleString);
        await this.validateCommonFields(dto);

        const targetMembership = await this.membershipModel.findOne({
            where: { id: targetMembershipId, establishmentId: actorAdminMembership.establishmentId }
        });
        if (!targetMembership) {
            throw new MembershipNotFoundError(`Target membership ID ${targetMembershipId} not found in establishment ID ${actorAdminMembership.establishmentId}.`);
        }

        // --- Calcul des champs computed_* ---
        const establishmentTimezone = await this.getEstablishmentTimezone(actorAdminMembership.establishmentId);
        const { computed_min_start_utc, computed_max_end_utc } = await this.calculateComputedTimingFields(
            {
                rruleString: dto.rruleString,
                durationMinutes: dto.durationMinutes,
                effectiveStartDate: dto.effectiveStartDate,
                effectiveEndDate: dto.effectiveEndDate,
            },
            establishmentTimezone
        );
        // --- Fin Calcul ---

        // --- Détection de Chevauchement ---
        const candidate: AvailabilityCandidate = {
            rruleString: dto.rruleString,
            durationMinutes: dto.durationMinutes,
            effectiveStartDate: dto.effectiveStartDate,
            effectiveEndDate: dto.effectiveEndDate,
        };
        const conflictResult = await this.overlapDetectionService.checkForConflicts(
            candidate,
            targetMembershipId,
            actorAdminMembership.establishmentId
        );

        if (conflictResult.hasBlockingConflict && conflictResult.blockingConflictError) {
            throw conflictResult.blockingConflictError;
        }
        // --- Fin Détection ---

        const staffAvailData: StaffAvailabilityCreationAttributes = {
            rruleString: dto.rruleString,
            durationMinutes: dto.durationMinutes,
            isWorking: dto.isWorking,
            effectiveStartDate: dto.effectiveStartDate,
            effectiveEndDate: dto.effectiveEndDate ?? null,
            description: dto.description ?? null,
            membershipId: targetMembershipId,
            createdByMembershipId: actorAdminMembership.id,
            appliedShiftTemplateRuleId: null,
            potential_conflict_details: conflictResult.potentialConflictDetails,
            computed_min_start_utc, // Ajouté
            computed_max_end_utc,   // Ajouté
        };

        try {
            const newStaffAvailability = await this.staffAvailabilityModel.create(staffAvailData);
            return newStaffAvailability.get({ plain: true });
        } catch (error: any) {
            // ... (gestion d'erreur inchangée) ...
            if (error.name === 'SequelizeValidationError') {
                throw new StaffAvailabilityCreationError(`Validation failed: ${error.errors.map((e:any) => e.message).join(', ')}`);
            }
            console.error("Error creating staff availability:", error);
            throw new StaffAvailabilityCreationError(`Failed to create staff availability: ${error.message}`);
        }
    }

    async getStaffAvailabilityById(
        staffAvailabilityId: number,
        establishmentId: number
    ): Promise<StaffAvailabilityAttributes | null> {
        // ... (méthode inchangée) ...
        const staffAvailability = await this.staffAvailabilityModel.findByPk(staffAvailabilityId, {
            include: [{
                model: this.membershipModel,
                as: 'membership',
                attributes: ['id', 'establishmentId'],
                required: true,
            }]
        });

        if (!staffAvailability || staffAvailability.membership?.establishmentId !== establishmentId) {
            return null;
        }
        return staffAvailability.get({ plain: true });
    }

    async listStaffAvailabilitiesForMember(
        targetMembershipId: number,
        establishmentIdOfContext: number,
        queryDto: Partial<ZodListStaffAvailabilitiesQueryDto>
    ): Promise<PaginationDto<StaffAvailabilityAttributes>> {
        const {
            page = 1,
            limit = 10,
            sortBy = 'effectiveStartDate',
            sortOrder = 'asc',
            isWorking,
            filterRangeStart,
            filterRangeEnd
        } = queryDto;

        const targetMembership = await this.membershipModel.findOne({
            where: { id: targetMembershipId, establishmentId: establishmentIdOfContext },
            include: [{ model: this.establishmentModel, as: 'establishment', attributes: ['timezone', 'id'] }]
        });

        if (!targetMembership?.establishment?.timezone) {
            throw new MembershipNotFoundError(`Target membership ID ${targetMembershipId} not found in establishment ID ${establishmentIdOfContext}, or its establishment timezone is missing.`);
        }
        const establishmentTimezone = targetMembership.establishment.timezone;

        const whereClauseItems: WhereOptions<StaffAvailabilityAttributes>[] = [];

        // Condition de base toujours présente
        whereClauseItems.push({ membershipId: targetMembershipId });

        if (isWorking !== undefined) {
            whereClauseItems.push({ isWorking: isWorking });
        }

        let filterRangeStartUTC: Date | null = null;
        let filterRangeEndUTC: Date | null = null;
        let isDateRangeFilterActive = false;

        if (filterRangeStart && filterRangeEnd) { // Zod refine assure que les deux sont là ou aucun
            filterRangeStartUTC = moment.tz(filterRangeStart, 'YYYY-MM-DD', establishmentTimezone).startOf('day').utc().toDate();
            filterRangeEndUTC = moment.tz(filterRangeEnd, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate();
            isDateRangeFilterActive = true;

            // Ajouter la condition de plage de dates aux clauses
            whereClauseItems.push({
                computed_min_start_utc: { [Op.lt]: filterRangeEndUTC }, // lt strict pour que la fin du filtre soit exclusive
                [Op.or]: [
                    { computed_max_end_utc: { [Op.gt]: filterRangeStartUTC } }, // gt strict pour que le début du filtre soit exclusif
                    { computed_max_end_utc: null }
                ]
            });
        }

        // Construire l'objet final whereConditions
        let finalWhereConditions: WhereOptions<StaffAvailabilityAttributes> = {};
        if (whereClauseItems.length > 1) {
            finalWhereConditions = { [Op.and]: whereClauseItems };
        } else if (whereClauseItems.length === 1) {
            finalWhereConditions = whereClauseItems[0];
        }
        // Si whereClauseItems est vide (ne devrait pas arriver à cause de membershipId), finalWhereConditions reste {}

        // 3. Pagination SQL d'Abord
        const { count: countResult, rows: pageOfCandidates } = await this.staffAvailabilityModel.findAndCountAll({
            where: finalWhereConditions, // Utiliser l'objet where construit
            limit,
            offset: (page - 1) * limit,
            order: [[sortBy, sortOrder.toUpperCase() as 'ASC' | 'DESC']],
        });

        let finalFilteredRulesOnPage: StaffAvailabilityAttributes[];
        const totalItemsForPagination = Array.isArray(countResult) ? (countResult[0]?.count || 0) : countResult;

        if (isDateRangeFilterActive && filterRangeStartUTC && filterRangeEndUTC) { // S'assurer que les dates UTC sont non-nulles
            // 4. Filtrage Fin en Mémoire UNIQUEMENT sur la page de candidats récupérée
            const rulesMeetingFineFilter: StaffAvailabilityAttributes[] = [];
            for (const ruleCandidateInstance of pageOfCandidates) {
                const occurrences = generateOccurrences(
                    ruleCandidateInstance.rruleString,
                    ruleCandidateInstance.durationMinutes,
                    ruleCandidateInstance.effectiveStartDate,
                    ruleCandidateInstance.effectiveEndDate,
                    filterRangeStartUTC,
                    filterRangeEndUTC,
                    establishmentTimezone
                );
                if (occurrences.length > 0) {
                    rulesMeetingFineFilter.push(ruleCandidateInstance.get({ plain: true }));
                }
            }
            finalFilteredRulesOnPage = rulesMeetingFineFilter;
        } else {
            finalFilteredRulesOnPage = pageOfCandidates.map(r => r.get({ plain: true }));
        }

        // 5. Construire le résultat
        return createPaginationResult(
            finalFilteredRulesOnPage,
            {
                totalItems: totalItemsForPagination,
                currentPage: page,
                itemsPerPage: limit
            }
        );
    }

    async updateStaffAvailability(
        staffAvailabilityId: number,
        dto: ZodUpdateStaffAvailabilityDto,
        establishmentId: number, // EstablishmentId du contexte de l'admin
        actorAdminMembershipId: number
    ): Promise<StaffAvailabilityAttributes> {
        const existingStaffAvailability = await this.staffAvailabilityModel.findByPk(staffAvailabilityId, {
            include: [{ model: this.membershipModel, as: 'membership', where: { establishmentId }, required: true }]
        });

        if (!existingStaffAvailability) {
            throw new StaffAvailabilityNotFoundError(`Staff availability ID ${staffAvailabilityId} not found in establishment ID ${establishmentId}.`);
        }
        const establishmentTimezone = await this.getEstablishmentTimezone(establishmentId);


        // Appliquer les validations sur les données qui *seraient* après mise à jour
        if (dto.rruleString !== undefined) {
            await this.validateRRuleString(dto.rruleString ?? existingStaffAvailability.rruleString); // Utiliser existant si DTO est null
        }
        await this.validateCommonFields({
            durationMinutes: dto.durationMinutes ?? existingStaffAvailability.durationMinutes,
            effectiveStartDate: dto.effectiveStartDate ?? existingStaffAvailability.effectiveStartDate,
            effectiveEndDate: dto.effectiveEndDate !== undefined ? dto.effectiveEndDate : existingStaffAvailability.effectiveEndDate,
        });

        // --- Calcul des champs computed_* SI nécessaire ---
        const updateData: Partial<StaffAvailabilityAttributes> = {};
        let needsRecomputeTimingFields = false;
        if (dto.rruleString !== undefined || dto.durationMinutes !== undefined ||
            dto.effectiveStartDate !== undefined || dto.effectiveEndDate !== undefined) {
            needsRecomputeTimingFields = true;
        }

        if (needsRecomputeTimingFields) {
            const currentRuleData = {
                rruleString: dto.rruleString ?? existingStaffAvailability.rruleString,
                durationMinutes: dto.durationMinutes ?? existingStaffAvailability.durationMinutes,
                effectiveStartDate: dto.effectiveStartDate ?? existingStaffAvailability.effectiveStartDate,
                effectiveEndDate: dto.effectiveEndDate !== undefined ? dto.effectiveEndDate : existingStaffAvailability.effectiveEndDate,
            };
            try {
                const { computed_min_start_utc, computed_max_end_utc } = await this.calculateComputedTimingFields(
                    currentRuleData,
                    establishmentTimezone
                );
                updateData.computed_min_start_utc = computed_min_start_utc;
                updateData.computed_max_end_utc = computed_max_end_utc;
            } catch (e) { // Erreur si la règle mise à jour ne produit pas d'occurrence
                throw new StaffAvailabilityUpdateError((e as Error).message);
            }
        }
        // --- Fin Calcul ---

        // --- Détection de Chevauchement ---
        const candidate: AvailabilityCandidate = {
            rruleString: dto.rruleString ?? existingStaffAvailability.rruleString,
            durationMinutes: dto.durationMinutes ?? existingStaffAvailability.durationMinutes,
            effectiveStartDate: dto.effectiveStartDate ?? existingStaffAvailability.effectiveStartDate,
            effectiveEndDate: dto.effectiveEndDate !== undefined ? dto.effectiveEndDate : existingStaffAvailability.effectiveEndDate,
            idToExclude: existingStaffAvailability.id,
        };

        const conflictResult = await this.overlapDetectionService.checkForConflicts(
            candidate,
            existingStaffAvailability.membershipId,
            establishmentId
        );

        if (conflictResult.hasBlockingConflict && conflictResult.blockingConflictError) {
            throw conflictResult.blockingConflictError;
        }
        // --- Fin Détection ---

        // Appliquer les champs du DTO à updateData
        if (dto.rruleString !== undefined) updateData.rruleString = dto.rruleString;
        if (dto.durationMinutes !== undefined) updateData.durationMinutes = dto.durationMinutes;
        if (dto.isWorking !== undefined) updateData.isWorking = dto.isWorking;
        if (dto.effectiveStartDate !== undefined) updateData.effectiveStartDate = dto.effectiveStartDate;
        if (dto.effectiveEndDate !== undefined) updateData.effectiveEndDate = dto.effectiveEndDate;
        if (dto.description !== undefined) updateData.description = dto.description;


        // Logique de détachement et de mise à jour de createdByMembershipId
        // (Rappel: idéalement un champ `updatedByMembershipId`)
        const hasActualDtoChanges = Object.keys(dto).some(key => (dto as any)[key] !== undefined);

        if (hasActualDtoChanges) { // S'il y a au moins un champ dans le DTO
            updateData.createdByMembershipId = actorAdminMembershipId;
            if (existingStaffAvailability.appliedShiftTemplateRuleId) {
                updateData.appliedShiftTemplateRuleId = null;
                if (dto.description === undefined) { // Préfixer seulement si la description n'est pas explicitement mise à jour
                    updateData.description = `(Manually override) ${existingStaffAvailability.description || ''}`.trim();
                }
            }
        }

        updateData.potential_conflict_details = conflictResult.potentialConflictDetails;

        // Ne procéder à l'update que si des données sont effectivement à mettre à jour
        // ou si potential_conflict_details a changé.
        const oldPotentialConflict = JSON.stringify(existingStaffAvailability.potential_conflict_details);
        const newPotentialConflict = JSON.stringify(updateData.potential_conflict_details);

        if (Object.keys(updateData).length === 1 && 'potential_conflict_details' in updateData && oldPotentialConflict === newPotentialConflict && !hasActualDtoChanges) {
            // Cas où seul potential_conflict_details est dans updateData mais n'a pas changé
            // ET aucun autre champ du DTO n'a été fourni.
        } else if (Object.keys(updateData).filter(k => k !== 'potential_conflict_details').length === 0 && oldPotentialConflict === newPotentialConflict) {
            // Si updateData ne contient QUE potential_conflict_details ET qu'il n'a pas changé,
            // alors aucun update n'est nécessaire.
            return existingStaffAvailability.get({ plain: true });
        }


        try {
            const [updateCount] = await this.staffAvailabilityModel.update(updateData, {
                where: { id: staffAvailabilityId },
            });

            const updatedInstance = await this.staffAvailabilityModel.findByPk(staffAvailabilityId);
            if (!updatedInstance) {
                throw new StaffAvailabilityNotFoundError(`Failed to re-fetch staff availability ID ${staffAvailabilityId} after update attempt.`);
            }
            return updatedInstance.get({ plain: true });

        } catch (error: any) {
            // ... (gestion d'erreur inchangée) ...
            if (error.name === 'SequelizeValidationError') {
                throw new StaffAvailabilityUpdateError(`Validation failed: ${error.errors.map((e:any) => e.message).join(', ')}`);
            }
            console.error(`Error updating staff availability ID ${staffAvailabilityId}:`, error);
            if (error instanceof StaffAvailabilityNotFoundError || error instanceof StaffAvailabilityConflictError) throw error;
            throw new StaffAvailabilityUpdateError(`Failed to update staff availability: ${error.message}`);
        }
    }

    async deleteStaffAvailability(staffAvailabilityId: number, establishmentId: number): Promise<void> {
        // ... (méthode inchangée) ...
        const staffAvailability = await this.staffAvailabilityModel.findOne({
            where: { id: staffAvailabilityId },
            include: [{ model: this.membershipModel, as: 'membership', where: { establishmentId }, required: true }]
        });

        if (!staffAvailability) {
            throw new StaffAvailabilityNotFoundError(`Staff availability ID ${staffAvailabilityId} not found in establishment ID ${establishmentId}.`);
        }
        await staffAvailability.destroy();
    }
}