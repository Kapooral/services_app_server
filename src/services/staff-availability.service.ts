// src/services/staff-availability.service.ts
import { ModelCtor, Op, WhereOptions } from 'sequelize';
import moment from 'moment-timezone';
import db from '../models';
import StaffAvailability, { StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes } from '../models/StaffAvailability';
import Membership, { MembershipAttributes } from '../models/Membership'; // MembershipRole n'est pas utilisé directement ici
import Establishment from '../models/Establishment';
import TimeOffRequest from '../models/TimeOffRequest';

import { AppError } from '../errors/app.errors';
import { StaffAvailabilityNotFoundError, StaffAvailabilityCreationError, StaffAvailabilityUpdateError, StaffAvailabilityConflictError } from '../errors/planning.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';
import { PaginationDto, createPaginationResult } from '../dtos/pagination.validation';
import { RRule } from 'rrule';

// Importer le service de détection de chevauchement et ses types
import { OverlapDetectionService, AvailabilityCandidate, ConflictCheckResult } from './overlap-detection.service';

// Utiliser les types inférés des DTOs Zod
import {
    CreateStaffAvailabilityDto as ZodCreateStaffAvailabilityDto,
    UpdateStaffAvailabilityDto as ZodUpdateStaffAvailabilityDto,
    ListStaffAvailabilitiesQueryDto as ZodListStaffAvailabilitiesQueryDto
} from '../dtos/staff-availability.validation';


export class StaffAvailabilityService {
    private staffAvailabilityModel: ModelCtor<StaffAvailability>;
    private membershipModel: ModelCtor<Membership>;
    private establishmentModel: ModelCtor<Establishment>;
    private timeOffRequestModel: ModelCtor<TimeOffRequest>; // Ajouté pour OverlapDetectionService
    private overlapDetectionService: OverlapDetectionService; // Injection de dépendance

    // MODIFIÉ: Constructeur pour l'injection de dépendances
    constructor(
        overlapDetectionService: OverlapDetectionService,
        staffAvailabilityModel: ModelCtor<StaffAvailability> = db.StaffAvailability,
        membershipModel: ModelCtor<Membership> = db.Membership,
        establishmentModel: ModelCtor<Establishment> = db.Establishment,
        timeOffRequestModel: ModelCtor<TimeOffRequest> = db.TimeOffRequest
    ) {
        this.staffAvailabilityModel = staffAvailabilityModel;
        this.membershipModel = membershipModel;
        this.establishmentModel = establishmentModel;
        this.timeOffRequestModel = timeOffRequestModel; // S'assurer qu'il est initialisé
        this.overlapDetectionService = overlapDetectionService;
    }

    private async validateRRuleString(rruleString: string): Promise<void> {
        try {
            if (!rruleString) { // Gérer explicitement la chaîne vide ou nulle
                throw new Error('RRULE string cannot be empty.');
            }
            // Si la rrule ne contient pas FREQ, elle peut être une simple DTSTART, ce qui est valide pour RRule.fromString
            // mais notre logique dans generateOccurrences pourrait s'attendre à FREQ pour la récurrence.
            // Pour une validation plus stricte au niveau du service (au-delà du DTO Zod):
            if (rruleString.includes('FREQ=')) { // Si c'est censé être une règle récurrente
                const rule = RRule.fromString(rruleString);
                if (!rule.options.freq) { // Vérifier si la fréquence a été correctement parsée
                    throw new Error('RRULE string with FREQ component is invalid or incomplete.');
                }
            } else if (!rruleString.includes('DTSTART=')) { // Si pas de FREQ, au moins un DTSTART est attendu pour un événement unique
                throw new Error('RRULE string for a single event must contain DTSTART.');
            }
            // Laisser RRule.fromString faire la validation syntaxique principale
            RRule.fromString(rruleString);
        } catch (e) {
            throw new StaffAvailabilityCreationError(`Invalid RRule string format: ${(e as Error).message}`);
        }
    }

    private async validateCommonFields(
        dto: { durationMinutes: number; effectiveStartDate: string; effectiveEndDate?: string | null },
    ): Promise<void> {
        if (dto.durationMinutes <= 0) {
            throw new StaffAvailabilityCreationError('Duration must be a positive integer.');
        }
        if (dto.effectiveEndDate && dto.effectiveStartDate && moment(dto.effectiveEndDate).isBefore(moment(dto.effectiveStartDate))) {
            throw new StaffAvailabilityCreationError('Effective end date cannot be before effective start date.');
        }
    }

    async createStaffAvailability(
        dto: ZodCreateStaffAvailabilityDto, // MODIFIÉ: Utilise le type Zod
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

        const staffAvailData: StaffAvailabilityCreationAttributes = {
            rruleString: dto.rruleString,
            durationMinutes: dto.durationMinutes,
            isWorking: dto.isWorking,
            effectiveStartDate: dto.effectiveStartDate,
            effectiveEndDate: dto.effectiveEndDate ?? null, // Assurer null si undefined
            description: dto.description ?? null,         // Assurer null si undefined
            membershipId: targetMembershipId,
            createdByMembershipId: actorAdminMembership.id,
            appliedShiftTemplateRuleId: null,
            potential_conflict_details: conflictResult.potentialConflictDetails,
        };

        try {
            const newStaffAvailability = await this.staffAvailabilityModel.create(staffAvailData);
            return newStaffAvailability.get({ plain: true });
        } catch (error: any) {
            if (error.name === 'SequelizeValidationError') {
                throw new StaffAvailabilityCreationError(`Validation failed: ${error.errors.map((e:any) => e.message).join(', ')}`);
            }
            console.error("Error creating staff availability:", error); // Garder pour le débogage serveur
            throw new StaffAvailabilityCreationError(`Failed to create staff availability: ${error.message}`);
        }
    }

    async getStaffAvailabilityById(
        staffAvailabilityId: number,
        establishmentId: number
    ): Promise<StaffAvailabilityAttributes | null> {
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
        establishmentId: number,
        queryDto: Partial<ZodListStaffAvailabilitiesQueryDto>
    ): Promise<PaginationDto<StaffAvailabilityAttributes>> {
        const { page = 1, limit = 10, sortBy = 'effectiveStartDate', sortOrder = 'asc', isWorking } = queryDto;
        const offset = (page - 1) * limit;

        const targetMembership = await this.membershipModel.findOne({
            where: { id: targetMembershipId, establishmentId: establishmentId }
        });
        if (!targetMembership) {
            throw new MembershipNotFoundError(`Target membership ID ${targetMembershipId} not found in establishment ID ${establishmentId}.`);
        }

        const whereConditions: WhereOptions<StaffAvailabilityAttributes> = {
            membershipId: targetMembershipId,
        };
        if (isWorking !== undefined) {
            whereConditions.isWorking = isWorking;
        }

        const { count, rows } = await this.staffAvailabilityModel.findAndCountAll({
            where: whereConditions,
            limit,
            offset,
            order: [[sortBy, sortOrder.toUpperCase() as 'ASC' | 'DESC']],
        });
        const totalItems = Array.isArray(count) ? (count[0]?.count || 0) : count;

        return createPaginationResult(
            rows.map(r => r.get({ plain: true })),
            { totalItems, currentPage: page, itemsPerPage: limit }
        );
    }

    async updateStaffAvailability(
        staffAvailabilityId: number,
        dto: ZodUpdateStaffAvailabilityDto, // MODIFIÉ: Utilise le type Zod
        establishmentId: number,
        actorAdminMembershipId: number
    ): Promise<StaffAvailabilityAttributes> {
        const existingStaffAvailability = await this.staffAvailabilityModel.findByPk(staffAvailabilityId, {
            include: [{ model: this.membershipModel, as: 'membership', where: { establishmentId }, required: true }]
        });

        if (!existingStaffAvailability) {
            throw new StaffAvailabilityNotFoundError(`Staff availability ID ${staffAvailabilityId} not found in establishment ID ${establishmentId}.`);
        }

        // Appliquer les validations sur les données qui *seraient* après mise à jour
        if (dto.rruleString !== undefined) { // Valider seulement si fourni (même si nullish)
            await this.validateRRuleString(dto.rruleString ?? ''); // Passer chaîne vide si null/undefined pour validation
        }
        await this.validateCommonFields({
            durationMinutes: dto.durationMinutes ?? existingStaffAvailability.durationMinutes,
            effectiveStartDate: dto.effectiveStartDate ?? existingStaffAvailability.effectiveStartDate,
            effectiveEndDate: dto.effectiveEndDate !== undefined ? dto.effectiveEndDate : existingStaffAvailability.effectiveEndDate,
        });

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

        // Construire updateData uniquement avec les champs fournis dans le DTO
        const updateData: Partial<StaffAvailabilityAttributes> = {};
        let hasRelevantChanges = false; // Pour suivre si des champs affectant le "détachement" sont modifiés

        if (dto.rruleString !== undefined) { updateData.rruleString = dto.rruleString; hasRelevantChanges = true; }
        if (dto.durationMinutes !== undefined) { updateData.durationMinutes = dto.durationMinutes; hasRelevantChanges = true; }
        if (dto.isWorking !== undefined) { updateData.isWorking = dto.isWorking; hasRelevantChanges = true; }
        if (dto.effectiveStartDate !== undefined) { updateData.effectiveStartDate = dto.effectiveStartDate; hasRelevantChanges = true; }
        if (dto.effectiveEndDate !== undefined) { updateData.effectiveEndDate = dto.effectiveEndDate; hasRelevantChanges = true; } // Permet de passer null
        if (dto.description !== undefined) { updateData.description = dto.description; hasRelevantChanges = true; }


        if (hasRelevantChanges) {
            // MODIFIÉ: Utiliser `updatedByMembershipId` si disponible, sinon `createdByMembershipId` reste pertinent
            // Pour l'instant, le modèle StaffAvailability n'a pas `updatedByMembershipId`.
            // Donc, `createdByMembershipId` est mis à jour pour refléter le dernier modificateur admin.
            // Idéalement, on aurait un champ `updatedByMembershipId`.
            updateData.createdByMembershipId = actorAdminMembershipId;

            if (existingStaffAvailability.appliedShiftTemplateRuleId) {
                updateData.appliedShiftTemplateRuleId = null;
                // Si la description n'est pas explicitement mise à jour par le DTO, on préfixe l'ancienne.
                // Si dto.description est null (effacement explicite), il sera null.
                // Si dto.description est une chaîne, elle sera utilisée.
                if (dto.description === undefined) { // Seulement si description n'est pas dans le DTO
                    updateData.description = `(Manually override) ${existingStaffAvailability.description || ''}`.trim();
                }
            }
        } else if (Object.keys(dto).length > 0) {
            // Cas où le DTO n'est pas vide, mais ne contient que des champs non pertinents
            // (par exemple, un champ non reconnu par la logique de mise à jour).
            // On met quand même à jour createdByMembershipId pour tracer l'action.
            // Mais ce cas est peu probable si on utilise les types Zod.
            updateData.createdByMembershipId = actorAdminMembershipId;
        }


        updateData.potential_conflict_details = conflictResult.potentialConflictDetails;

        // Ne procéder à l'update que si des données sont effectivement à mettre à jour
        if (Object.keys(updateData).length === 0 && !conflictResult.potentialConflictDetails && existingStaffAvailability.potential_conflict_details === null) {
            // Aucun changement réel, retourner l'instance existante
            return existingStaffAvailability.get({ plain: true });
        }


        try {
            const [updateCount] = await this.staffAvailabilityModel.update(updateData, {
                where: { id: staffAvailabilityId },
            });

            // Même si updateCount est 0 (pas de changement de valeur détecté par Sequelize),
            // il faut re-fetch pour obtenir l'état potentiellement mis à jour par un autre processus
            // ou pour refléter potential_conflict_details.
            const updatedInstance = await this.staffAvailabilityModel.findByPk(staffAvailabilityId);
            if (!updatedInstance) {
                throw new StaffAvailabilityNotFoundError(`Failed to re-fetch staff availability ID ${staffAvailabilityId} after update attempt.`);
            }
            return updatedInstance.get({ plain: true });

        } catch (error: any) {
            if (error.name === 'SequelizeValidationError') {
                throw new StaffAvailabilityUpdateError(`Validation failed: ${error.errors.map((e:any) => e.message).join(', ')}`);
            }
            console.error(`Error updating staff availability ID ${staffAvailabilityId}:`, error);
            if (error instanceof StaffAvailabilityNotFoundError || error instanceof StaffAvailabilityConflictError) throw error;
            throw new StaffAvailabilityUpdateError(`Failed to update staff availability: ${error.message}`);
        }
    }

    async deleteStaffAvailability(staffAvailabilityId: number, establishmentId: number): Promise<void> {
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