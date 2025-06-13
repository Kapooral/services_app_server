// src/services/recurring-planning-model.service.ts
import { ModelCtor, Sequelize, Op, Transaction } from 'sequelize';
import { RRule } from 'rrule';
import { v4 as uuidv4 } from 'uuid'; // Pour générer les ID des breaks
import RecurringPlanningModel, {RecurringPlanningModelCreationAttributes, RPMBreak} from '../models/RecurringPlanningModel';
import RecurringPlanningModelMemberAssignment from '../models/RecurringPlanningModelMemberAssignment';
import {
    CreateRecurringPlanningModelDto,
    UpdateRecurringPlanningModelDto,
    ListRecurringPlanningModelsQueryDto,
    RecurringPlanningModelOutputDto,
    RPMBreakDto // S'assurer que RPMBreakDto inclut 'id: z.string().uuid()'
} from '../dtos/planning/recurring-planning-model.validation';

import { ICacheService } from './cache/cache.service.interface';
import { PaginationDto, createPaginationResult } from '../dtos/pagination.validation';
import { AppError } from '../errors/app.errors';
import { RpmCreationError, RpmNotFoundError, PlanningModuleError, RpmNameConflictError } from '../errors/planning.errors';

function mapToRpmOutputDto(rpm: RecurringPlanningModel): RecurringPlanningModelOutputDto {
    return {
        id: rpm.id,
        name: rpm.name,
        description: rpm.description,
        referenceDate: rpm.referenceDate,
        globalStartTime: rpm.globalStartTime,
        globalEndTime: rpm.globalEndTime,
        rruleString: rpm.rruleString,
        defaultBlockType: rpm.defaultBlockType,
        breaks: rpm.breaks as RPMBreakDto[] | null, // Cast basé sur la validation
        establishmentId: rpm.establishmentId,
        createdAt: rpm.createdAt,
        updatedAt: rpm.updatedAt,
    };
}

export class RecurringPlanningModelService {
    constructor(
        private recurringPlanningModelModel: ModelCtor<RecurringPlanningModel>,
        private rpmMemberAssignmentModel: ModelCtor<RecurringPlanningModelMemberAssignment>, // Conservé pour une future vérification avant suppression
        private sequelize: Sequelize,
        private cacheService: ICacheService
    ) {}

    // Clés de cache
    private rpmCacheKey(establishmentId: number, rpmId: number): string {
        return `rpm:estId${establishmentId}:id${rpmId}`;
    }
    private rpmsListCacheKeyPrefix(establishmentId: number): string {
        return `rpms:estId${establishmentId}:list:*`; // Pattern pour l'invalidation des listes
    }

    // Méthode privée refactorisée pour la recherche et verrouillage
    private async findRpmForUpdate(rpmId: number, establishmentId: number, transaction?: Transaction): Promise<RecurringPlanningModel> {
        const rpm = await this.recurringPlanningModelModel.findOne({
            where: { id: rpmId, establishmentId },
            transaction, // Utiliser la transaction fournie si elle existe
            ...(transaction && { lock: transaction.LOCK.UPDATE }) // Appliquer le verrou si dans une transaction
        });
        if (!rpm) {
            throw new RpmNotFoundError(rpmId);
        }
        return rpm;
    }

    // Méthode privée refactorisée pour la validation lors de la MàJ
    private async validateRpmUpdate(dto: UpdateRecurringPlanningModelDto, existingRpm: RecurringPlanningModel, establishmentId: number): Promise<void> {
        if (dto.name && dto.name !== existingRpm.name) {
            const existingByName = await this.recurringPlanningModelModel.findOne({
                where: { name: dto.name, establishmentId, id: { [Op.ne]: existingRpm.id } },
            });
            if (existingByName) {
                throw new RpmNameConflictError(dto.name, establishmentId);
            }
        }
        if (dto.rruleString) {
            this.validateRruleStringFormat(dto.rruleString);
        }
        //  Les validations Zod sur les breaks (format, dans l'enveloppe, non-chevauchement) sont appliquées par le parse du DTO.
        //  Si on veut une validation plus poussée ici, on la remettrait.
        //  Ex: si dto.breaks ou dto.globalStartTime/EndTime sont modifiés:
        //  const effectiveGlobalStartTime = dto.globalStartTime ?? existingRpm.globalStartTime;
        //  const effectiveGlobalEndTime = dto.globalEndTime ?? existingRpm.globalEndTime;
        //  const effectiveBreaks = dto.breaks !== undefined ? dto.breaks : existingRpm.breaks;
        //  if (dto.breaks !== undefined || dto.globalStartTime !== undefined || dto.globalEndTime !== undefined) {
        //       this.validateBreaks(effectiveBreaks, effectiveGlobalStartTime, effectiveGlobalEndTime); // (ou une version adaptée pour update)
        //  }
    }

    private ensureBreaksHaveIds(breaks: RPMBreakDto[] | null | undefined): RPMBreak[] | null {
        if (!breaks) return null;
        return breaks.map(b => ({
            ...b,
            id: b.id || uuidv4(), // Assigne un UUID si l'id n'est pas fourni
        }));
    }

    private validateRruleStringFormat(rruleString: string): void {
        try {
            const rule = RRule.parseString(rruleString); // Valide la syntaxe générale
            if (!rule.freq) { // RRule.parseString retourne une instance de RRuleOptions
                // Un RPM est intrinsèquement récurrent. S'il ne l'est pas, utiliser DailyAdjustmentSlot.
                throw new Error("RRULE string for a Recurring Planning Model must contain a FREQ component.");
            }
            // Note: La présence ou l'absence de DTSTART dans la rruleString stockée est gérée par
            // DailyScheduleService qui construira le DTSTART effectif. Il est conseillé
            // que la rruleString stockée ne contienne pas DTSTART, ou que sa partie date soit ignorée.
        } catch (e: any) {
            throw new RpmCreationError(`Invalid rruleString format: ${e.message}`);
        }
    }


    async createRpm(dto: CreateRecurringPlanningModelDto, establishmentId: number): Promise<RecurringPlanningModelOutputDto> {
        const transaction = await this.sequelize.transaction();
        try {
            const existingByName = await this.recurringPlanningModelModel.findOne({
                where: { name: dto.name, establishmentId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (existingByName) {
                throw new RpmNameConflictError(dto.name, establishmentId);
            }

            // ... (logique de création identique)
            const processedBreaks = this.ensureBreaksHaveIds(dto.breaks);
            const rpmData: RecurringPlanningModelCreationAttributes = {
                ...dto,
                breaks: processedBreaks,
                establishmentId,
            };
            const newRpm = await this.recurringPlanningModelModel.create(rpmData, { transaction });

            await transaction.commit();

            await this.cacheService.deleteByPattern(this.rpmsListCacheKeyPrefix(establishmentId));
            return mapToRpmOutputDto(newRpm);

        } catch (error) {
            await transaction.rollback();

            if (error instanceof PlanningModuleError) {
                throw error; // On relance les erreurs métier déjà traitées (comme RpmNameConflictError)
            }

            // Pour toutes les autres erreurs (DB, etc.), on log et on lance une erreur générique.
            console.error("Error creating RPM:", error);
            throw new AppError('DbError', 500, "Could not create the recurring planning model.");
        }
    }

    async getRpmById(rpmId: number, establishmentId: number): Promise<RecurringPlanningModelOutputDto | null> {
        const cacheKey = this.rpmCacheKey(establishmentId, rpmId);
        const cachedRpm = await this.cacheService.get<RecurringPlanningModelOutputDto>(cacheKey);
        if (cachedRpm) {
            return cachedRpm;
        }

        const rpm = await this.recurringPlanningModelModel.findOne({
            where: { id: rpmId, establishmentId },
        });

        if (!rpm) {
            return null;
        }

        const outputDto = mapToRpmOutputDto(rpm);
        await this.cacheService.set(cacheKey, outputDto, 3600); // Cache pour 1 heure
        return outputDto;
    }

    // listRpmsForEstablishment pourrait aussi utiliser le cache, mais la clé serait complexe avec tous les query params.
    // Pour V1, on peut le laisser sans cache ou mettre un cache avec une clé plus simple si la recherche n'est pas trop variée.
    // Si on cache la liste, la clé doit inclure tous les paramètres de queryDto.
    async listRpmsForEstablishment(
        queryDto: ListRecurringPlanningModelsQueryDto,
        establishmentId: number
    ): Promise<PaginationDto<RecurringPlanningModelOutputDto>> {
        const { page = 1, limit = 10, sortBy = 'name', sortOrder = 'asc', searchByName } = queryDto;

        // Exemple de clé de cache pour la liste (peut devenir long)
        const cacheKey = `rpms:estId${establishmentId}:p${page}:l${limit}:sb${sortBy}:so${sortOrder}:sN${searchByName || ''}`;
        const cachedList = await this.cacheService.get<PaginationDto<RecurringPlanningModelOutputDto>>(cacheKey);
        if (cachedList) {
            return cachedList;
        }

        const offset = (page - 1) * limit;

        const whereConditions: any = { establishmentId };
        if (searchByName) {
            whereConditions.name = { [Op.like]: `%${searchByName}%` };
        }

        const { count, rows } = await this.recurringPlanningModelModel.findAndCountAll({
            where: whereConditions,
            limit,
            offset,
            order: [[sortBy, sortOrder.toUpperCase() as 'ASC' | 'DESC']],
        });

        const result = createPaginationResult(
            rows.map(mapToRpmOutputDto),
            { totalItems: count, currentPage: page, itemsPerPage: limit }
        );
        await this.cacheService.set(cacheKey, result, 300); // Cache pour 5 minutes
        return result;
    }

    async updateRpm(
        rpmId: number,
        dto: UpdateRecurringPlanningModelDto,
        establishmentId: number
    ): Promise<RecurringPlanningModelOutputDto> {
        // Refactorisation : séparer la validation et la persistance
        const rpm = await this.findRpmForUpdate(rpmId, establishmentId); // Lève RpmNotFoundError

        await this.validateRpmUpdate(dto, rpm, establishmentId); // Valide nom, rrule, breaks

        let processedBreaks: RPMBreak[] | null | undefined = undefined;
        if (dto.breaks !== undefined) {
            processedBreaks = this.ensureBreaksHaveIds(dto.breaks);
        }

        const updateData = { ...dto };
        if (processedBreaks !== undefined) {
            (updateData as any).breaks = processedBreaks;
        }

        const transaction = await this.sequelize.transaction();
        try {
            await rpm.update(updateData, { transaction });
            await transaction.commit();

            const assignments = await this.rpmMemberAssignmentModel.findAll({
                where: { recurringPlanningModelId: rpmId },
                attributes: ['membershipId', 'establishmentId'] // establishmentId est déjà là
            });
            const uniqueMemberContexts = new Map<string, { establishmentId: number, membershipId: number }>();
            for (const assign of assignments) {
                // Récupérer l'establishmentId du membre via une jointure ou si le rpm a establishmentId
                // Ici, on a déjà l'establishmentId du RPM.
                uniqueMemberContexts.set(
                    `est${establishmentId}:memb${assign.membershipId}`,
                    { establishmentId, membershipId: assign.membershipId }
                );
            }

            for (const context of uniqueMemberContexts.values()) {
                // Invalide tous les schedules mis en cache pour ce membre dans cet établissement.
                // Le pattern doit correspondre à celui utilisé par DailyScheduleService.scheduleCacheKey.
                // `schedule:estId<EID>:membId<MID>:date<YYYY-MM-DD>`
                // Pour MemoryCacheService, `deleteByPattern` doit être capable de gérer cela.
                await this.cacheService.deleteByPattern(`schedule:estId${context.establishmentId}:membId${context.membershipId}:date*`);
            }

            return mapToRpmOutputDto(rpm); // rpm est mis à jour en mémoire
        } catch (error) {
            await transaction.rollback();
            if (error instanceof PlanningModuleError) throw error;
            console.error(`Error updating RPM ID ${rpmId}:`, error);
            throw new AppError('DbError', 500, "Could not update the recurring planning model.");
        }
    }

    async deleteRpm(rpmId: number, establishmentId: number): Promise<void> {
        const transaction = await this.sequelize.transaction();
        try {
            const rpm = await this.findRpmForUpdate(rpmId, establishmentId, transaction); // Utilise la même logique pour trouver/verrouiller

            await rpm.destroy({ transaction });
            await transaction.commit();

            const assignments = await this.rpmMemberAssignmentModel.findAll({
                where: { recurringPlanningModelId: rpmId },
                attributes: ['membershipId', 'establishmentId'] // establishmentId est déjà là
            });
            const uniqueMemberContexts = new Map<string, { establishmentId: number, membershipId: number }>();
            for (const assign of assignments) {
                // Récupérer l'establishmentId du membre via une jointure ou si le rpm a establishmentId
                // Ici, on a déjà l'establishmentId du RPM.
                uniqueMemberContexts.set(
                    `est${establishmentId}:memb${assign.membershipId}`,
                    { establishmentId, membershipId: assign.membershipId }
                );
            }

            for (const context of uniqueMemberContexts.values()) {
                // Invalide tous les schedules mis en cache pour ce membre dans cet établissement.
                // Le pattern doit correspondre à celui utilisé par DailyScheduleService.scheduleCacheKey.
                // `schedule:estId<EID>:membId<MID>:date<YYYY-MM-DD>`
                // Pour MemoryCacheService, `deleteByPattern` doit être capable de gérer cela.
                await this.cacheService.deleteByPattern(`schedule:estId${context.establishmentId}:membId${context.membershipId}:date*`);
            }

        } catch (error) {
            await transaction.rollback();
            if (error instanceof PlanningModuleError) throw error;
            console.error(`Error deleting RPM ID ${rpmId}:`, error);
            throw new AppError('DbError', 500, "Could not delete the recurring planning model.");
        }
    }
}