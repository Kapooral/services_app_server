// src/services/daily-adjustment-slot.service.ts
import { ModelCtor, Sequelize, Op, WhereOptions, Transaction } from 'sequelize';

import DailyAdjustmentSlot, {DailyAdjustmentSlotAttributes, DailyAdjustmentSlotCreationAttributes} from '../models/DailyAdjustmentSlot';
import Membership from '../models/Membership';
import RecurringPlanningModel from '../models/RecurringPlanningModel'; // Pour valider sourceRpmId
import {
    CreateDailyAdjustmentSlotDto,
    UpdateDailyAdjustmentSlotDto,
    ListDailyAdjustmentSlotsQueryDto,
    DailyAdjustmentSlotOutputDto,
    DASTaskDto,
    BulkUpdateDasDto, // NOUVEAU
    BulkDeleteDasDto, // NOUVEAU
    DasBulkErrorDetail, // NOUVEAU
} from '../dtos/planning/daily-adjustment-slot.validation';
import { SlotType } from '../types/planning.enums'; // Import des Enums
import { PaginationDto, createPaginationResult } from '../dtos/pagination.validation';
import { AppError } from '../errors/app.errors';
import { DasCreationError, DasUpdateError, DasNotFoundError, DasConflictError, RpmNotFoundError, PlanningModuleError } from '../errors/planning.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';
import {ICacheService} from "./cache/cache.service.interface";

// Helper pour mapper vers OutputDto
function mapToDasOutputDto(das: DailyAdjustmentSlot): DailyAdjustmentSlotOutputDto {
    return {
        id: das.id,
        membershipId: das.membershipId,
        slotDate: das.slotDate,
        startTime: das.startTime,
        endTime: das.endTime,
        slotType: das.slotType,
        description: das.description,
        sourceRecurringPlanningModelId: das.sourceRecurringPlanningModelId,
        isManualOverride: das.isManualOverride,
        tasks: das.tasks as DASTaskDto[] | null, // Cast si la structure est identique
        establishmentId: das.establishmentId,
        createdAt: das.createdAt,
        updatedAt: das.updatedAt,
    };
}

export class DailyAdjustmentSlotService {
    constructor(
        private dailyAdjustmentSlotModel: ModelCtor<DailyAdjustmentSlot>,
        private membershipModel: ModelCtor<Membership>,
        private recurringPlanningModelModel: ModelCtor<RecurringPlanningModel>,
        private sequelize: Sequelize,
        private cacheService: ICacheService
    ) {}

    private validateTasks(
        tasks: DASTaskDto[] | null | undefined
    ): void {
        if (!tasks || tasks.length === 0) return;
        // Zod valide la structure interne des tâches, les heures de début/fin de tâche,
        // et que les tâches sont dans le slot et ne se chevauchent pas entre elles.
        // Cette fonction est un placeholder pour une logique métier plus complexe si besoin.
    }

    // Validation de non-chevauchement des slots pour un membre à une date donnée
    private async checkForOverlappingSlots(
        membershipId: number,
        slotDate: string,
        newStartTime: string,
        newEndTime: string,
        excludeSlotId?: number,
        transaction?: Transaction
    ): Promise<void> {
        const existingSlots = await this.dailyAdjustmentSlotModel.findAll({
            where: {
                membershipId,
                slotDate,
                ...(excludeSlotId && { id: { [Op.ne]: excludeSlotId } }),
                // On cherche les slots qui pourraient chevaucher :
                // Un slot existant se termine APRÈS le début du nouveau slot ET
                // Un slot existant commence AVANT la fin du nouveau slot.
                startTime: { [Op.lt]: newEndTime },   // existing.startTime < newEndTime
                endTime: { [Op.gt]: newStartTime },   // existing.endTime > newStartTime
            },
            transaction,
        });

        if (existingSlots.length > 0) {
            const conflictingIds = existingSlots.map(s => s.id);
            throw new DasConflictError(
                `Slot from ${newStartTime} to ${newEndTime} on ${slotDate} for member ID ${membershipId} overlaps with existing slot(s): ID(s) ${conflictingIds.join(', ')}.`,
                { conflictingSlotIds: conflictingIds, membershipId, slotDate, attemptedStartTime: newStartTime, attemptedEndTime: newEndTime }
            );
        }
    }

    async createDas(dto: CreateDailyAdjustmentSlotDto, actorEstablishmentId: number): Promise<DailyAdjustmentSlotOutputDto> {
        const member = await this.membershipModel.findOne({ where: { id: dto.membershipId, establishmentId: actorEstablishmentId } });
        if (!member) {
            throw new MembershipNotFoundError(`Membership ID ${dto.membershipId} not found in establishment ID ${actorEstablishmentId}.`);
        }
        if (dto.establishmentId !== actorEstablishmentId) {
            throw new DasCreationError("Provided establishmentId in DTO does not match actor's establishment context.");
        }

        if (dto.sourceRecurringPlanningModelId) {
            const rpm = await this.recurringPlanningModelModel.findOne({
                where: { id: dto.sourceRecurringPlanningModelId, establishmentId: actorEstablishmentId }
            });
            if (!rpm) {
                throw new RpmNotFoundError(dto.sourceRecurringPlanningModelId, { inEstablishmentId: actorEstablishmentId });
            }
        }

        if (dto.slotType === SlotType.EFFECTIVE_WORK && dto.tasks) {
            this.validateTasks(dto.tasks);
        }

        // **Validation de non-chevauchement renforcée**
        await this.checkForOverlappingSlots(
            dto.membershipId,
            dto.slotDate,
            dto.startTime,
            dto.endTime
        );

        const dasData: DailyAdjustmentSlotCreationAttributes = { ...dto };
        const transaction = await this.sequelize.transaction();
        try {
            const newDas = await this.dailyAdjustmentSlotModel.create(dasData, { transaction });
            await transaction.commit();

            return mapToDasOutputDto(newDas);
        } catch (error) {
            await transaction.rollback();
            if (error instanceof PlanningModuleError) throw error;
            console.error("Error creating Daily Adjustment Slot:", error);
            throw new AppError('DbError', 500, "Could not create the daily adjustment slot.");
        }
    }

    async getDasById(dasId: number, actorEstablishmentId: number): Promise<DailyAdjustmentSlotOutputDto | null> {
        const das = await this.dailyAdjustmentSlotModel.findOne({
            where: { id: dasId, establishmentId: actorEstablishmentId }, // S'assurer que le slot appartient à l'établissement de l'acteur
        });
        return das ? mapToDasOutputDto(das) : null;
    }

    async listDas(
        queryDto: ListDailyAdjustmentSlotsQueryDto,
        // actorEstablishmentId est utilisé pour s'assurer que les filtres membershipId/establishmentId sont dans le contexte
    ): Promise<PaginationDto<DailyAdjustmentSlotOutputDto>> {
        const { page = 1, limit = 10, sortBy = 'slotDate', sortOrder = 'asc',
            membershipId, establishmentId, dateFrom, dateTo, slotType } = queryDto;
        const offset = (page - 1) * limit;

        const whereConditions: WhereOptions<DailyAdjustmentSlotAttributes> = {};

        if (establishmentId) { // Si un establishmentId est fourni comme filtre
            whereConditions.establishmentId = establishmentId;
        }
        // Si l'API est structurée pour que actorEstablishmentId soit toujours le filtre principal, ajuster ici.
        // Par exemple: whereConditions.establishmentId = actorContext.establishmentId;

        if (membershipId) {
            whereConditions.membershipId = membershipId;
        }
        if (slotType) {
            whereConditions.slotType = slotType;
        }
        if (dateFrom && dateTo) {
            whereConditions.slotDate = { [Op.between]: [dateFrom, dateTo] };
        } else if (dateFrom) {
            whereConditions.slotDate = { [Op.gte]: dateFrom };
        } else if (dateTo) {
            whereConditions.slotDate = { [Op.lte]: dateTo };
        }

        const orderClause: any[] = [[sortBy, sortOrder.toUpperCase()]];
        if (sortBy === 'slotDate') { // Trier aussi par startTime si le tri principal est sur slotDate
            orderClause.push(['startTime', sortOrder.toUpperCase()]);
        }


        const { count, rows } = await this.dailyAdjustmentSlotModel.findAndCountAll({
            where: whereConditions,
            limit,
            offset,
            order: orderClause,
        });

        return createPaginationResult(
            rows.map(mapToDasOutputDto),
            { totalItems: count, currentPage: page, itemsPerPage: limit }
        );
    }

    async updateDas(
        dasId: number,
        dto: UpdateDailyAdjustmentSlotDto,
        actorEstablishmentId: number
    ): Promise<DailyAdjustmentSlotOutputDto> {
        const transaction = await this.sequelize.transaction();
        try {
            const das = await this.dailyAdjustmentSlotModel.findOne({
                where: { id: dasId, establishmentId: actorEstablishmentId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!das) {
                throw new DasNotFoundError(dasId);
            }

            const newStartTime = dto.startTime ?? das.startTime;
            const newEndTime = dto.endTime ?? das.endTime;
            const newSlotType = dto.slotType ?? das.slotType;
            const newTasks = dto.tasks !== undefined ? dto.tasks : das.tasks;
            const newDescription = dto.description !== undefined ? dto.description : das.description;


            if (newStartTime >= newEndTime) {
                throw new DasUpdateError("Slot endTime must be after startTime.", 'DAS_INVALID_TIMES');
            }

            if (newSlotType === SlotType.EFFECTIVE_WORK && newTasks) {
                for (const task of newTasks) {
                    if (task.taskStartTime < newStartTime || task.taskEndTime > newEndTime) {
                        throw new DasUpdateError(
                            `Update rejected: One or more tasks (e.g., '${task.taskName}') would fall outside the new slot time boundaries of ${newStartTime}-${newEndTime}.`,
                            'DAS_TASK_OUT_OF_BOUNDS'
                        );
                    }
                }
            }

            // **Validation de non-chevauchement renforcée lors de la mise à jour si les heures changent**
            if (dto.startTime || dto.endTime) {
                await this.checkForOverlappingSlots(
                    das.membershipId,
                    das.slotDate,
                    newStartTime,
                    newEndTime,
                    das.id, // Exclure le slot actuel
                    transaction
                );
            }

            const updatePayload: Partial<DailyAdjustmentSlotAttributes> = {
                // Ne mettre à jour que les champs présents dans le DTO
                ...(dto.startTime && { startTime: newStartTime }),
                ...(dto.endTime && { endTime: newEndTime }),
                ...(dto.slotType && { slotType: newSlotType }),
                ...(dto.description !== undefined && { description: newDescription }),
                ...(dto.tasks !== undefined && { tasks: newTasks }),
                isManualOverride: true, // Une mise à jour manuelle est un override
            };
            // Filtrer les clés undefined du payload pour ne pas écraser avec undefined
            const filteredUpdatePayload = Object.entries(updatePayload).reduce((acc, [key, value]) => {
                if (value !== undefined) (acc as any)[key] = value;
                return acc;
            }, {});


            if (Object.keys(filteredUpdatePayload).length > 0) {
                await das.update(filteredUpdatePayload, { transaction });
            } else if (dto.description === null || dto.tasks === null) {
                // Gérer le cas où on veut explicitement mettre à null des champs nullables
                await das.update({
                    description: dto.description === null ? null : das.description,
                    tasks: dto.tasks === null ? null : das.tasks,
                }, { transaction });
            }


            await transaction.commit();

            // Recharger pour obtenir l'état final après update (surtout si des hooks Sequelize existent)
            const reloadedDas = await this.dailyAdjustmentSlotModel.findByPk(das.id);
            if(!reloadedDas) throw new DasNotFoundError(das.id); // Ne devrait pas arriver
            return mapToDasOutputDto(reloadedDas);
        } catch (error) {
            await transaction.rollback();
            if (error instanceof PlanningModuleError) throw error;
            console.error(`Error updating DAS ID ${dasId}:`, error);
            throw new AppError('DbError', 500, "Could not update the daily adjustment slot.");
        }
    }

    async deleteDas(dasId: number, actorEstablishmentId: number): Promise<void> {
        const transaction = await this.sequelize.transaction();
        try {
            const das = await this.dailyAdjustmentSlotModel.findOne({
                where: { id: dasId, establishmentId: actorEstablishmentId },
                transaction,
            });

            if (!das) {
                throw new DasNotFoundError();
            }

            await das.destroy({ transaction });
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            if (error instanceof DasNotFoundError) throw error;
            console.error(`Error deleting DAS ID ${dasId}:`, error);
            throw new AppError('DbError', 500, "Could not delete the daily adjustment slot.");
        }
    }

    async bulkUpdateDas(
        dto: BulkUpdateDasDto,
        actorEstablishmentId: number
    ): Promise<{ updatedSlots: DailyAdjustmentSlotOutputDto[], errors: DasBulkErrorDetail[] }> {
        const updatedSlots: DailyAdjustmentSlotOutputDto[] = [];
        const errors: DasBulkErrorDetail[] = [];

        for (const updateItem of dto.updates) {
            const transaction = await this.sequelize.transaction();
            try {
                const das = await this.dailyAdjustmentSlotModel.findOne({
                    where: { id: updateItem.id, establishmentId: actorEstablishmentId },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });

                if (!das) {
                    errors.push({ dasId: updateItem.id, error: `DAS ID ${updateItem.id} not found.`, errorCode: 'DAS_NOT_FOUND' });
                    await transaction.rollback();
                    continue;
                }

                // Préparer les données pour validation et mise à jour
                const newStartTime = updateItem.startTime ?? das.startTime;
                const newEndTime = updateItem.endTime ?? das.endTime;
                const newSlotType = updateItem.slotType ?? das.slotType;
                const newTasks = updateItem.tasks !== undefined ? updateItem.tasks : das.tasks; // Gérer null pour effacer les tâches
                const newDescription = updateItem.description !== undefined ? updateItem.description : das.description;


                if (newStartTime >= newEndTime) {
                    throw new DasUpdateError("Slot endTime must be after startTime.", 'DAS_INVALID_TIMES');
                }

                // Valider les tâches si le type de slot est EFFECTIVE_WORK et que les tâches ou les heures sont modifiées
                if (newSlotType === SlotType.EFFECTIVE_WORK && (updateItem.tasks !== undefined || updateItem.startTime || updateItem.endTime)) {
                    this.validateTasks(newTasks); // Zod valide déjà la structure interne des tâches
                }

                // Validation de non-chevauchement si les heures ont changé
                if (updateItem.startTime || updateItem.endTime) {
                    await this.checkForOverlappingSlots(
                        das.membershipId,
                        das.slotDate,
                        newStartTime,
                        newEndTime,
                        das.id, // Exclure le slot actuel
                        transaction // Passer la transaction
                    );
                }

                const updatePayload: Partial<DailyAdjustmentSlotAttributes> = {
                    startTime: newStartTime,
                    endTime: newEndTime,
                    slotType: newSlotType,
                    description: newDescription,
                    tasks: newTasks,
                    isManualOverride: true, // Une mise à jour manuelle est un override
                };


                await das.update(updatePayload, { transaction });
                updatedSlots.push(mapToDasOutputDto(das)); // das est mis à jour en mémoire
                await transaction.commit();

            } catch (error: any) {
                await transaction.rollback();
                let errorCode = 'DAS_BULK_ITEM_UPDATE_FAILED';
                if (error instanceof PlanningModuleError && error.errorCode) {
                    errorCode = error.errorCode;
                }
                errors.push({
                    dasId: updateItem.id,
                    error: error.message || `Failed to update DAS ID ${updateItem.id}.`,
                    errorCode
                });
            }
        }
        return { updatedSlots, errors };
    }

    async bulkDeleteDas(
        dto: BulkDeleteDasDto,
        actorEstablishmentId: number
    ): Promise<{ deletedCount: number, errors: DasBulkErrorDetail[] }> {
        // Pour cette V1, nous utilisons une suppression en masse sans vérifier chaque ID individuellement pour l'appartenance
        // avant la requête de suppression, pour la performance. Le filtre establishmentId dans la clause WHERE s'en charge.
        // Si un ID n'existe pas ou n'appartient pas à l'establishment, il ne sera simplement pas supprimé.
        // Le 'deletedCount' reflétera le nombre de suppressions effectives.
        const transaction = await this.sequelize.transaction();
        try {
            const deletedCount = await this.dailyAdjustmentSlotModel.destroy({
                where: {
                    id: { [Op.in]: dto.dasIds },
                    establishmentId: actorEstablishmentId, // S'assurer qu'on ne supprime que les DAS du bon établissement
                },
                transaction,
            });
            await transaction.commit();
            return { deletedCount, errors: [] }; // Pas d'erreurs partielles si l'opération DB réussit
        } catch (error: any) {
            await transaction.rollback();
            console.error("Error in bulkDeleteDas:", error);
            throw new PlanningModuleError('BulkDeleteFailed',500, error.message || "Failed to bulk delete Daily Adjustment Slots.");
        }
    }
}