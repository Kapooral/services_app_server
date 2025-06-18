// src/services/rpm-member-assignment.service.ts
import { ModelCtor, Sequelize, Op, WhereOptions, Transaction } from 'sequelize';

import RecurringPlanningModelMemberAssignment, {RpmMemberAssignmentAttributes} from '../models/RecurringPlanningModelMemberAssignment';
import Membership from '../models/Membership';
import RecurringPlanningModel from '../models/RecurringPlanningModel';
import {
    CreateRpmMemberAssignmentDto,
    UpdateRpmMemberAssignmentDto,
    ListRpmMemberAssignmentsQueryDto,
    RpmMemberAssignmentOutputDto,
    BulkAssignMembersToRpmDto,
    BulkUnassignMembersFromRpmDto,
    RpmBulkAssignmentErrorDetail
} from '../dtos/planning/rpm-member-assignment.validation';
import { PaginationDto, createPaginationResult } from '../dtos/pagination.validation';
import { AppError } from '../errors/app.errors';
import { RpmAssignmentError, RpmAssignmentNotFoundError, RpmNotFoundError, PlanningModuleError } from '../errors/planning.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';

import { ICacheService } from './cache/cache.service.interface';

// Helper pour mapper vers OutputDto
function mapToRpmAssignmentOutputDto(assignment: RecurringPlanningModelMemberAssignment): RpmMemberAssignmentOutputDto {
    return {
        id: assignment.id,
        membershipId: assignment.membershipId,
        recurringPlanningModelId: assignment.recurringPlanningModelId,
        assignmentStartDate: assignment.assignmentStartDate,
        assignmentEndDate: assignment.assignmentEndDate,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
    };
}

export class RpmMemberAssignmentService {
    constructor(
        private rpmMemberAssignmentModel: ModelCtor<RecurringPlanningModelMemberAssignment>,
        private membershipModel: ModelCtor<Membership>,
        private recurringPlanningModelModel: ModelCtor<RecurringPlanningModel>,
        private sequelize: Sequelize,
        private cacheService: ICacheService
    ) {}

    private async validateAssignmentContext(
        membershipId: number,
        rpmId: number,
        establishmentId: number // Contexte de l'admin/de l'opération
    ): Promise<{ member: Membership, rpm: RecurringPlanningModel }> {
        const member = await this.membershipModel.findOne({ where: { id: membershipId, establishmentId } });
        if (!member) {
            throw new MembershipNotFoundError(`Membership ID ${membershipId} not found in establishment ID ${establishmentId}.`);
        }

        const rpm = await this.recurringPlanningModelModel.findOne({ where: { id: rpmId, establishmentId } });
        if (!rpm) {
            throw new RpmNotFoundError(`Recurring Planning Model ID ${rpmId} not found in establishment ID ${establishmentId}.`);
        }
        return { member, rpm };
    }

    private async checkForOverlappingAssignments(
        membershipId: number,
        newStartDateStr: string,
        newEndDateStr: string | null | undefined,
        excludeAssignmentId?: number,
        transaction?: Transaction
    ): Promise<void> {
        const newEnd = newEndDateStr || '9999-12-31'; // Utiliser une date lointaine pour les comparaisons

        const existingAssignments = await this.rpmMemberAssignmentModel.findAll({
            where: {
                membershipId,
                ...(excludeAssignmentId && { id: { [Op.ne]: excludeAssignmentId } }),
            },
            transaction,
        });

        for (const existing of existingAssignments) {
            const existingStart = existing.assignmentStartDate;
            const existingEnd = existing.assignmentEndDate || '9999-12-31';

            // Pour le format 'YYYY-MM-DD', une comparaison de chaînes est sûre et performante.
            // La condition est: (start1 <= end2) ET (start2 <= end1)
            const overlaps = (newStartDateStr <= existingEnd) && (existingStart <= newEnd);

            if (overlaps) {
                throw new RpmAssignmentError(
                    `Assignment period from ${newStartDateStr} to ${newEndDateStr || 'infinity'} ` +
                    `overlaps with existing assignment (ID: ${existing.id}).`,
                    'ASSIGNMENT_PERIOD_OVERLAP',
                    { existingAssignmentId: existing.id }
                );
            }
        }
    }

    async createAssignment(
        dto: CreateRpmMemberAssignmentDto,
        rpmId: number, // Supposons que rpmId est un paramètre de route
        actorEstablishmentId: number
    ): Promise<RpmMemberAssignmentOutputDto> {
        await this.validateAssignmentContext(dto.membershipId, rpmId, actorEstablishmentId);

        await this.checkForOverlappingAssignments(
            dto.membershipId,
            dto.assignmentStartDate,
            dto.assignmentEndDate
        );

        const transaction = await this.sequelize.transaction();
        try {
            const newAssignment = await this.rpmMemberAssignmentModel.create({
                membershipId: dto.membershipId,
                recurringPlanningModelId: rpmId,
                assignmentStartDate: dto.assignmentStartDate,
                assignmentEndDate: dto.assignmentEndDate,
            }, { transaction });
            await transaction.commit();

            await this.cacheService.deleteByPattern(`schedule:estId${actorEstablishmentId}:membId${dto.membershipId}:date*`);

            return mapToRpmAssignmentOutputDto(newAssignment);
        } catch (error) {
            await transaction.rollback();
            if (error instanceof RpmAssignmentError || error instanceof MembershipNotFoundError || error instanceof RpmNotFoundError) throw error;
            console.error("Error creating RPM assignment:", error);
            throw new AppError('DbError', 500, "Could not create the RPM assignment.");
        }
    }

    async getAssignmentById(assignmentId: number, actorEstablishmentId: number): Promise<RpmMemberAssignmentOutputDto | null> {
        const assignment = await this.rpmMemberAssignmentModel.findByPk(assignmentId, {
            include: [ // Inclure pour vérifier le contexte de l'establishmentId
                { model: this.membershipModel, as: 'member', required: true, attributes: ['establishmentId'] },
                // Ou { model: this.recurringPlanningModelModel, as: 'recurringPlanningModel', required: true, attributes: ['establishmentId'] }
            ]
        });

        if (!assignment || assignment.member?.establishmentId !== actorEstablishmentId) {
            // Vérifier si le membre de l'affectation appartient à l'établissement de l'acteur
            return null;
        }
        return mapToRpmAssignmentOutputDto(assignment);
    }

    async listAssignments(
        queryDto: ListRpmMemberAssignmentsQueryDto,
        actorEstablishmentId: number
    ): Promise<PaginationDto<RpmMemberAssignmentOutputDto>> {
        const { page = 1, limit = 10, sortBy = 'assignmentStartDate', sortOrder = 'asc',
            membershipId, recurringPlanningModelId, effectiveOnDate } = queryDto;
        const offset = (page - 1) * limit;

        const whereConditions: WhereOptions<RpmMemberAssignmentAttributes> = {};
        const includeOptions: any[] = [
            {
                model: this.membershipModel,
                as: 'member',
                attributes: [], // Ne pas sélectionner les champs du membre, juste pour la jointure/filtre
                where: { establishmentId: actorEstablishmentId }, // S'assurer que les affectations sont pour cet établissement
                required: true
            }
        ];

        if (membershipId) {
            whereConditions.membershipId = membershipId;
        }
        if (recurringPlanningModelId) {
            whereConditions.recurringPlanningModelId = recurringPlanningModelId;
        }
        if (effectiveOnDate) {
            const dateCondition: WhereOptions<RpmMemberAssignmentAttributes> = {
                assignmentStartDate: { [Op.lte]: effectiveOnDate },
                [Op.or]: [
                    { assignmentEndDate: { [Op.gte]: effectiveOnDate } },
                    { assignmentEndDate: null }
                ]
            };
            Object.assign(whereConditions, dateCondition);
        }

        const { count, rows } = await this.rpmMemberAssignmentModel.findAndCountAll({
            where: whereConditions,
            include: includeOptions,
            limit,
            offset,
            order: [[sortBy, sortOrder.toUpperCase()]],
            distinct: true, // Important si les jointures peuvent dupliquer les lignes de l'affectation
        });

        return createPaginationResult(
            rows.map(mapToRpmAssignmentOutputDto),
            { totalItems: count, currentPage: page, itemsPerPage: limit }
        );
    }

    async updateAssignment(
        assignmentId: number,
        dto: UpdateRpmMemberAssignmentDto,
        actorEstablishmentId: number
    ): Promise<RpmMemberAssignmentOutputDto> {
        const transaction = await this.sequelize.transaction();
        try {
            const assignment = await this.rpmMemberAssignmentModel.findByPk(assignmentId, {
                transaction,
                lock: transaction.LOCK.UPDATE,
                include: [{ model: this.membershipModel, as: 'member', required: true }]
            });

            if (!assignment || assignment.member?.establishmentId !== actorEstablishmentId) {
                throw new RpmAssignmentNotFoundError();
            }

            const newStartDate = dto.assignmentStartDate ?? assignment.assignmentStartDate;
            const newEndDate = dto.assignmentEndDate !== undefined ? dto.assignmentEndDate : assignment.assignmentEndDate; // Gérer null explicitement

            await this.checkForOverlappingAssignments(
                assignment.membershipId,
                newStartDate,
                newEndDate,
                assignment.id // Exclure l'affectation actuelle de la vérification
            );

            await assignment.update({
                assignmentStartDate: newStartDate,
                assignmentEndDate: newEndDate,
            }, { transaction });
            await transaction.commit();

            await this.cacheService.deleteByPattern(`schedule:estId${actorEstablishmentId}:membId${assignment.membershipId}:date*`);

            return mapToRpmAssignmentOutputDto(assignment);
        } catch (error) {
            await transaction.rollback();
            if (error instanceof RpmAssignmentNotFoundError || error instanceof RpmAssignmentError) throw error;
            console.error(`Error updating RPM assignment ID ${assignmentId}:`, error);
            throw new AppError('DbError', 500, "Could not update the RPM assignment.");
        }
    }

    async deleteAssignment(assignmentId: number, actorEstablishmentId: number): Promise<void> {
        const transaction = await this.sequelize.transaction();
        try {
            const assignment = await this.rpmMemberAssignmentModel.findByPk(assignmentId, {
                transaction,
                include: [{ model: this.membershipModel, as: 'member', required: true }]
            });

            if (!assignment || assignment.member?.establishmentId !== actorEstablishmentId) {
                throw new RpmAssignmentNotFoundError();
            }

            await assignment.destroy({ transaction });
            await transaction.commit();

            await this.cacheService.deleteByPattern(`schedule:estId${actorEstablishmentId}:membId${assignment.member.id}:date*`);
        } catch (error) {
            await transaction.rollback();
            if (error instanceof RpmAssignmentNotFoundError) throw error;
            console.error(`Error deleting RPM assignment ID ${assignmentId}:`, error);
            throw new AppError('DbError', 500, "Could not delete the RPM assignment.");
        }
    }

    async bulkAssignMembersToRpm(
        dto: BulkAssignMembersToRpmDto,
        rpmId: number,
        actorEstablishmentId: number
    ): Promise<{ successfulAssignments: RpmMemberAssignmentOutputDto[], errors: RpmBulkAssignmentErrorDetail[] }> {
        const { membershipIds, assignmentStartDate, assignmentEndDate } = dto;
        const successfulAssignments: RpmMemberAssignmentOutputDto[] = [];
        const errors: RpmBulkAssignmentErrorDetail[] = [];

        // Valider le RPM une seule fois
        const rpm = await this.recurringPlanningModelModel.findOne({ where: { id: rpmId, establishmentId: actorEstablishmentId } });
        if (!rpm) {
            throw new RpmNotFoundError(`Recurring Planning Model ID ${rpmId} not found in establishment ID ${actorEstablishmentId}.`);
        }

        for (const membershipId of membershipIds) {
            const transaction = await this.sequelize.transaction(); // Transaction par membre pour erreurs partielles
            try {
                // Valider le membre
                const member = await this.membershipModel.findOne({ where: { id: membershipId, establishmentId: actorEstablishmentId }, transaction });
                if (!member) {
                    errors.push({ membershipId, error: `Membership ID ${membershipId} not found.`, errorCode: 'MEMBERSHIP_NOT_FOUND' });
                    await transaction.rollback(); // Rollback la transaction pour ce membre
                    continue;
                }

                // Vérifier les chevauchements pour ce membre
                await this.checkForOverlappingAssignments(
                    membershipId,
                    assignmentStartDate,
                    assignmentEndDate,
                    undefined, // pas d'ID à exclure
                    transaction // passer la transaction
                );

                const newAssignment = await this.rpmMemberAssignmentModel.create({
                    membershipId,
                    recurringPlanningModelId: rpmId,
                    assignmentStartDate,
                    assignmentEndDate,
                }, { transaction });

                successfulAssignments.push(mapToRpmAssignmentOutputDto(newAssignment));
                await transaction.commit();

                await this.cacheService.deleteByPattern(`schedule:estId${actorEstablishmentId}:membId${membershipId}:date*`);
            } catch (error: any) {
                await transaction.rollback();
                let errorCode = 'RPM_ASSIGNMENT_BULK_ITEM_FAILED';
                if (error instanceof RpmAssignmentError && error.errorCode) { // Si c'est une erreur de chevauchement avec son propre code
                    errorCode = error.errorCode;
                } else if (error instanceof MembershipNotFoundError) {
                    errorCode = 'MEMBERSHIP_NOT_FOUND'; // Redondant si déjà géré au-dessus, mais bon pour la capture générale
                }
                errors.push({
                    membershipId,
                    error: error.message || "Failed to assign RPM to member.",
                    errorCode
                });
            }
        }
        return { successfulAssignments, errors };
    }

    async bulkUnassignMembersFromRpm(
        dto: BulkUnassignMembersFromRpmDto,
        rpmId: number,
        actorEstablishmentId: number
    ): Promise<{ successCount: number, errors: RpmBulkAssignmentErrorDetail[] }> {
        const { membershipIds } = dto;
        let successCount = 0;
        const errors: RpmBulkAssignmentErrorDetail[] = [];

        // Valider le RPM une seule fois
        const rpm = await this.recurringPlanningModelModel.findOne({ where: { id: rpmId, establishmentId: actorEstablishmentId } });
        if (!rpm) {
            // Si le RPM n'existe pas, aucune affectation ne peut exister pour lui.
            // On pourrait retourner successCount = 0 et une erreur globale ou simplement ne rien faire.
            // Pour être cohérent avec la suppression par ID, on devrait lever une erreur.
            throw new RpmNotFoundError(`Recurring Planning Model ID ${rpmId} not found in establishment ID ${actorEstablishmentId}.`);
        }

        const transaction = await this.sequelize.transaction();
        try {
            // Valider que tous les membres appartiennent à l'établissement avant suppression
            const members = await this.membershipModel.findAll({
                where: {
                    id: { [Op.in]: membershipIds },
                    establishmentId: actorEstablishmentId
                },
                attributes: ['id'],
                transaction
            });
            const validMembershipIds = members.map(m => m.id);

            for (const requestedId of membershipIds) {
                if (!validMembershipIds.includes(requestedId)) {
                    errors.push({ membershipId: requestedId, error: `Membership ID ${requestedId} not found in establishment.`, errorCode: 'MEMBERSHIP_NOT_FOUND' });
                }
            }

            if (validMembershipIds.length > 0) {
                const deletedCount = await this.rpmMemberAssignmentModel.destroy({
                    where: {
                        membershipId: { [Op.in]: validMembershipIds },
                        recurringPlanningModelId: rpmId,
                    },
                    transaction,
                });
                successCount = deletedCount;
            }
            await transaction.commit();

            await validMembershipIds.forEach(i => {
                this.cacheService.deleteByPattern(`schedule:estId${actorEstablishmentId}:membId${i}:date*`);
            })

        } catch (error: any) {
            await transaction.rollback();
            console.error("Error in bulkUnassignMembersFromRpm:", error);
            // Si une erreur DB générique survient
            throw new PlanningModuleError('BulkUnassignFailed', 500, error.message || "Failed to bulk unassign members from RPM.");
        }

        return { successCount, errors };
    }

}