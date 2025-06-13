// src/services/timeoff-request.service.ts
import { ModelCtor, Op, WhereOptions } from 'sequelize';
import db from '../models';
import TimeOffRequest, { TimeOffRequestAttributes, TimeOffRequestCreationAttributes, TimeOffRequestStatus } from '../models/TimeOffRequest';
import Membership, { MembershipAttributes, MembershipRole, MembershipStatus as MemberStatus } from '../models/Membership';
import User from '../models/User'; // Pour les infos de l'acteur dans les notifications
import Establishment from '../models/Establishment'; // Pour les infos dans les notifications
import {
    CreateTimeOffRequestDto,
    ListTimeOffRequestsQueryDto,
    ProcessTimeOffRequestDto,
    CancelTimeOffRequestDto,
    ListAllTimeOffRequestsForEstablishmentQueryDto
} from '../dtos/timeoff-request.validation';
import { PaginationDto, createPaginationResult } from '../dtos/pagination.validation';
import { AppError } from '../errors/app.errors';
import { TimeOffRequestNotFoundError, TimeOffRequestInvalidActionError } from '../errors/availability.errors';

import { INotificationService } from './notification.service'; // Interface pour le service de notification

export class TimeOffRequestService {
    private timeOffRequestModel: ModelCtor<TimeOffRequest>;
    private membershipModel: ModelCtor<Membership>;
    private userModel: ModelCtor<User>;
    private establishmentModel: ModelCtor<Establishment>;
    private notificationService: INotificationService;

    constructor(notificationService: INotificationService) {
        this.timeOffRequestModel = db.TimeOffRequest;
        this.membershipModel = db.Membership;
        this.userModel = db.User;
        this.establishmentModel = db.Establishment;
        this.notificationService = notificationService;
    }

    /**
     * Creates a new time off request for the acting member.
     */
    async createTimeOffRequest(
        dto: CreateTimeOffRequestDto,
        actorMembership: MembershipAttributes
    ): Promise<TimeOffRequestAttributes> {
        if (!actorMembership.establishmentId || !actorMembership.userId) {
            throw new AppError('InvalidActorContext', 500, 'Actor membership context is incomplete (missing establishmentId or userId).');
        }
        if (new Date(dto.endDate) < new Date(dto.startDate)) {
            throw new AppError('InvalidInput', 400, 'End date cannot be before start date.');
        }

        const timeOffRequestData: TimeOffRequestCreationAttributes = {
            membershipId: actorMembership.id,
            establishmentId: actorMembership.establishmentId,
            type: dto.type,
            startDate: dto.startDate,
            endDate: dto.endDate,
            reason: dto.reason || null,
            status: TimeOffRequestStatus.PENDING,
        };

        const overlappingRequest = await this.timeOffRequestModel.findOne({
            where: {
                membershipId: actorMembership.id,
                status: { [Op.in]: [TimeOffRequestStatus.PENDING, TimeOffRequestStatus.APPROVED] },
                startDate: { [Op.lte]: dto.endDate },
                endDate: { [Op.gte]: dto.startDate },
            }
        });
        if (overlappingRequest) {
            throw new TimeOffRequestInvalidActionError(
                `An overlapping time off request (ID: ${overlappingRequest.id}, Status: ${overlappingRequest.status}) already exists for these dates.`
            );
        }

        const newTimeOffRequest = await this.timeOffRequestModel.create(timeOffRequestData);

        // MODIFIED SECTION START (Correction Erreur TS2345 pour actorMembership.userId)
        if (!actorMembership.userId) {
            // Ce cas ne devrait pas arriver si actorMembership est toujours un membre actif avec un utilisateur lié.
            // Mais pour la robustesse, on le gère.
            console.error(`[TimeOffRequestService] Actor membership ID ${actorMembership.id} has no associated userId. Cannot fetch requesting user for notification.`);
        } else {
            const requestingUser = await this.userModel.findByPk(actorMembership.userId);
            if (!requestingUser) {
                // Log l'erreur mais ne bloque pas la création de la demande si l'utilisateur n'est pas trouvé (peut-être un problème de données orphelines)
                console.error(`[TimeOffRequestService] Requesting user with ID ${actorMembership.userId} not found for notification.`);
            }

            const establishment = await this.establishmentModel.findByPk(actorMembership.establishmentId);
            if (!establishment) {
                console.error(`[TimeOffRequestService] Establishment with ID ${actorMembership.establishmentId} not found for notification.`);
            }

            if (requestingUser && establishment) {
                const establishmentAdmins = await this.membershipModel.findAll({
                    where: {
                        establishmentId: actorMembership.establishmentId,
                        role: MembershipRole.ADMIN,
                        status: MemberStatus.ACTIVE,
                        userId: { [Op.not]: null } // S'assurer que l'admin a un user lié
                    },
                    include: [{ model: this.userModel, as: 'user', attributes: ['email', 'username'], required: true }]
                });

                for (const admin of establishmentAdmins) {
                    if (admin.user?.email) {
                        try {
                            await this.notificationService.sendTimeOffRequestSubmittedNotification(
                                admin.user.email,
                                requestingUser.get({ plain: true }), // Passer UserAttributes
                                newTimeOffRequest.get({ plain: true }),
                                establishment.get({ plain: true }) // Passer EstablishmentAttributes
                            );
                        } catch (error) {
                            console.error(`Failed to send time off request submission notification to admin ${admin.user.email}:`, error);
                        }
                    }
                }
            }
        }
        // MODIFIED SECTION END

        return newTimeOffRequest.get({ plain: true });
    }

    /**
     * Retrieves a specific time off request by its ID.
     * Access is already verified by middleware.
     */
    async getTimeOffRequestById(
        requestId: number,
    ): Promise<TimeOffRequestAttributes> {
        const timeOffRequest = await this.timeOffRequestModel.findByPk(requestId, {
            include: [
                { model: db.Membership, as: 'requestingMember', include: [{model: db.User, as: 'user', attributes: ['id','username', 'profile_picture']}]},
                { model: db.Membership, as: 'processingAdmin', include: [{model: db.User, as: 'user', attributes: ['id','username', 'profile_picture']}]},
                { model: db.Membership, as: 'cancellingActor', include: [{model: db.User, as: 'user', attributes: ['id','username', 'profile_picture']}]}
            ]
        });
        if (!timeOffRequest) {
            throw new TimeOffRequestNotFoundError();
        }
        return timeOffRequest.get({ plain: true });
    }

    /**
     * Lists time off requests for a specific member within an establishment.
     * Access for actorMembership (either self or admin of establishment) is verified by middleware.
     */
    async listTimeOffRequestsForMember(
        establishmentId: number,
        targetMembershipId: number,
        queryDto: ListTimeOffRequestsQueryDto,
    ): Promise<PaginationDto<TimeOffRequestAttributes>> {
        const { page = 1, limit = 10, status, sortBy = 'createdAt', sortOrder = 'desc' } = queryDto;
        const offset = (page - 1) * limit;

        const whereConditions: WhereOptions<TimeOffRequestAttributes> = {
            establishmentId: establishmentId,
            membershipId: targetMembershipId,
        };

        if (status) {
            whereConditions.status = status;
        }

        const dbResult = await this.timeOffRequestModel.findAndCountAll({
            where: whereConditions,
            include: [
                { model: db.Membership, as: 'requestingMember', attributes: ['id'], include: [{model: db.User, as: 'user', attributes: ['id','username', 'profile_picture']}]},
                { model: db.Membership, as: 'processingAdmin', attributes: ['id'], include: [{model: db.User, as: 'user', attributes: ['id','username', 'profile_picture']}]},
            ],
            limit,
            offset,
            order: [[sortBy, sortOrder.toUpperCase() as 'ASC' | 'DESC']],
        });

        const totalItems = Array.isArray(dbResult.count) ? (dbResult.count[0]?.count ?? 0) : dbResult.count;
        return createPaginationResult<TimeOffRequestAttributes>(
            dbResult.rows.map(r => r.get({ plain: true })),
            { totalItems: totalItems, currentPage: page, itemsPerPage: limit }
        );
    }

    /**
     * Lists all time off requests for a specific establishment, with pagination and filtering.
     * Only for admins. Access is verified by middleware.
     */
    async listTimeOffRequestsForEstablishment(
        establishmentId: number,
        queryDto: ListAllTimeOffRequestsForEstablishmentQueryDto
    ): Promise<PaginationDto<TimeOffRequestAttributes>> {
        const {
            page = 1,
            limit = 10,
            status,
            type,
            membershipId: filterMembershipId,
            dateRangeStart,
            dateRangeEnd,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = queryDto;

        const offset = (page - 1) * limit;

        if (dateRangeStart && dateRangeEnd && new Date(dateRangeEnd) < new Date(dateRangeStart)) {
            throw new AppError('InvalidInput', 400, 'Date range end cannot be before date range start.');
        }

        const whereConditions: WhereOptions<TimeOffRequestAttributes> = {
            establishmentId: establishmentId,
        };

        if (status) { whereConditions.status = status; }
        if (type) { whereConditions.type = type; }
        if (filterMembershipId) { whereConditions.membershipId = filterMembershipId; }

        if (dateRangeStart && dateRangeEnd) {
            whereConditions.startDate = { [Op.lte]: dateRangeEnd };
            whereConditions.endDate = { [Op.gte]: dateRangeStart };
        }

        const dbResult = await this.timeOffRequestModel.findAndCountAll({
            where: whereConditions,
            include: [
                {
                    model: db.Membership,
                    as: 'requestingMember',
                    attributes: ['id'],
                    include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'profile_picture'], required: false }]
                },
                {
                    model: db.Membership,
                    as: 'processingAdmin',
                    required: false,
                    attributes: ['id'],
                    include: [{ model: db.User, as: 'user', attributes: ['id', 'username'], required: false }]
                },
                {
                    model: db.Membership,
                    as: 'cancellingActor',
                    required: false,
                    attributes: ['id'],
                    include: [{ model: db.User, as: 'user', attributes: ['id', 'username'], required: false }]
                }
            ],
            limit,
            offset,
            order: [[sortBy, sortOrder.toUpperCase() as 'ASC' | 'DESC']]
        });

        // Pour dbResult.count, si c'est un array (group by), il faut sommer. Sinon, c'est un nombre.
        // Ici, pas de group by explicite dans la requête principale, donc count devrait être un nombre.
        const totalItems = Array.isArray(dbResult.count)
            ? dbResult.count.reduce((sum, item: any) => sum + (item.count || 0), 0)
            : dbResult.count;


        return createPaginationResult<TimeOffRequestAttributes>(
            dbResult.rows.map(r => r.get({ plain: true })),
            { totalItems: totalItems, currentPage: page, itemsPerPage: limit }
        );
    }

    /**
     * Processes a time off request (approve or reject).
     * Only for admins. Access is verified by middleware.
     */
    async processTimeOffRequest(
        requestId: number,
        dto: ProcessTimeOffRequestDto,
        actorMembership: MembershipAttributes
    ): Promise<TimeOffRequestAttributes> {
        const timeOffRequestInstance = await this.timeOffRequestModel.findByPk(requestId);
        if (!timeOffRequestInstance) {
            throw new TimeOffRequestNotFoundError();
        }

        if (timeOffRequestInstance.status !== TimeOffRequestStatus.PENDING) {
            throw new TimeOffRequestInvalidActionError(`Cannot process a request that is not in PENDING status. Current status: ${timeOffRequestInstance.status}`);
        }
        if (timeOffRequestInstance.establishmentId !== actorMembership.establishmentId) {
            throw new AppError('Forbidden', 403, 'Admin does not belong to the establishment of this time off request.');
        }

        timeOffRequestInstance.status = dto.status;
        timeOffRequestInstance.adminNotes = dto.adminNotes || null;
        timeOffRequestInstance.processedByMembershipId = actorMembership.id;

        await timeOffRequestInstance.save();
        const updatedTimeOffRequest = timeOffRequestInstance.get({ plain: true });


        // MODIFIED SECTION START (Correction Erreur TS2345 pour requestingMembership.user)
        const requestingMembership = await this.membershipModel.findByPk(updatedTimeOffRequest.membershipId, {
            include: [
                { model: this.userModel, as: 'user', attributes: ['email', 'username'], required: false }, // required: false, car l'utilisateur pourrait avoir été supprimé
                { model: this.establishmentModel, as: 'establishment', attributes: ['name'], required: true }
            ]
        });

        if (!requestingMembership || !requestingMembership.establishment) {
            console.error(`[TimeOffRequestService] Requesting membership or its establishment not found for request ID ${updatedTimeOffRequest.id}. Cannot send processed notification.`);
        } else if (!requestingMembership.user || !requestingMembership.user.email) {
            console.warn(`[TimeOffRequestService] Requesting user or user email not found for membership ID ${requestingMembership.id} (request ID ${updatedTimeOffRequest.id}). Cannot send processed notification.`);
        } else {
            try {
                await this.notificationService.sendTimeOffRequestProcessedNotification(
                    requestingMembership.user.email,
                    requestingMembership.user.get({ plain: true }), // Passer UserAttributes
                    updatedTimeOffRequest,
                    requestingMembership.establishment.get({ plain: true }) // Passer EstablishmentAttributes
                );
            } catch (error) {
                console.error(`Failed to send time off request processed notification to member ${requestingMembership.user.email}:`, error);
            }
        }
        // MODIFIED SECTION END

        return updatedTimeOffRequest;
    }

    /**
     * Cancels a time off request.
     * Can be done by the requesting member if PENDING, or by an admin if PENDING or APPROVED.
     * Access is verified by middleware.
     */
    async cancelTimeOffRequest(
        requestId: number,
        dto: CancelTimeOffRequestDto,
        actorMembership: MembershipAttributes
    ): Promise<TimeOffRequestAttributes> {
        const timeOffRequestInstance = await this.timeOffRequestModel.findByPk(requestId);
        if (!timeOffRequestInstance) {
            throw new TimeOffRequestNotFoundError();
        }

        const isOwner = timeOffRequestInstance.membershipId === actorMembership.id;
        const isAdmin = actorMembership.role === MembershipRole.ADMIN && timeOffRequestInstance.establishmentId === actorMembership.establishmentId;

        let newStatus: TimeOffRequestStatus | null = null;

        if (isOwner && timeOffRequestInstance.status === TimeOffRequestStatus.PENDING) {
            newStatus = TimeOffRequestStatus.CANCELLED_BY_MEMBER;
        } else if (isAdmin && (timeOffRequestInstance.status === TimeOffRequestStatus.PENDING || timeOffRequestInstance.status === TimeOffRequestStatus.APPROVED)) {
            newStatus = TimeOffRequestStatus.CANCELLED_BY_ADMIN;
        } else {
            throw new TimeOffRequestInvalidActionError(`Request cannot be cancelled. Current status: ${timeOffRequestInstance.status}. Actor role: ${actorMembership.role}`);
        }

        timeOffRequestInstance.status = newStatus;
        timeOffRequestInstance.cancellationReason = dto.cancellationReason || null;
        timeOffRequestInstance.cancelledByMembershipId = actorMembership.id;

        await timeOffRequestInstance.save();
        const cancelledTimeOffRequest = timeOffRequestInstance.get({ plain: true });

        // MODIFIED SECTION START (Correction Erreur TS2345 pour requestingMembership.user et autres)
        const requestingMembership = await this.membershipModel.findByPk(cancelledTimeOffRequest.membershipId, {
            include: [{ model: this.userModel, as: 'user', attributes: ['email', 'username'], required: false }]
        });
        const establishment = await this.establishmentModel.findByPk(cancelledTimeOffRequest.establishmentId);

        if (!establishment) {
            console.error(`[TimeOffRequestService] Establishment ID ${cancelledTimeOffRequest.establishmentId} not found for cancellation notification (request ID ${cancelledTimeOffRequest.id}).`);
            return cancelledTimeOffRequest; // Retourner quand même la demande annulée
        }
        if (!requestingMembership || !requestingMembership.user || !requestingMembership.user.email) {
            console.warn(`[TimeOffRequestService] Requesting user/email not found for cancellation notification (request ID ${cancelledTimeOffRequest.id}).`);
            // On continue pour notifier l'admin si c'est le membre qui annule
        }

        const actorUser = actorMembership.userId ? await this.userModel.findByPk(actorMembership.userId) : null;
        if (!actorUser && (isOwner || isAdmin)){ // Si l'acteur doit être notifié ou notifier d'autres et qu'il n'a pas d'user
            console.warn(`[TimeOffRequestService] Actor user (ID: ${actorMembership.userId}) not found for cancellation notification logic.`);
        }


        if (isOwner && requestingMembership?.user && actorUser) { // Membre a annulé, notifier les admins
            const establishmentAdmins = await this.membershipModel.findAll({
                where: {
                    establishmentId: actorMembership.establishmentId, // L'établissement de l'acteur (qui est le membre)
                    role: MembershipRole.ADMIN,
                    status: MemberStatus.ACTIVE,
                    userId: { [Op.not]: null }
                },
                include: [{ model: this.userModel, as: 'user', attributes: ['email'], required: true }]
            });
            for (const admin of establishmentAdmins) {
                if (admin.user?.email) {
                    try {
                        await this.notificationService.sendTimeOffRequestCancelledByMemberNotification(
                            admin.user.email,
                            actorUser.get({ plain: true }), // UserAttributes de celui qui a annulé (le membre)
                            cancelledTimeOffRequest,
                            establishment.get({ plain: true })
                        );
                    } catch (error) {
                        console.error(`Failed to send time off request cancellation (by member) notification to admin ${admin.user.email}:`, error);
                    }
                }
            }
        } else if (isAdmin && requestingMembership?.user?.email && actorUser) { // Admin a annulé, notifier le membre
            try {
                await this.notificationService.sendTimeOffRequestCancelledByAdminNotification(
                    requestingMembership.user.email, // Email du membre dont la demande est annulée
                    requestingMembership.user.get({plain: true}), // UserAttributes du membre
                    cancelledTimeOffRequest,
                    establishment.get({ plain: true })
                );
            } catch (error) {
                console.error(`Failed to send time off request cancellation (by admin) notification to member ${requestingMembership.user.email}:`, error);
            }
        }
        // MODIFIED SECTION END

        return cancelledTimeOffRequest;
    }
}