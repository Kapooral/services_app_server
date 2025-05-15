// tests/services/timeoff-request.unit.test.ts
import { Op } from 'sequelize';
import { TimeOffRequestService } from '../../src/services/timeoff-request.service';
import db from '../../src/models';
import TimeOffRequest, { TimeOffRequestAttributes, TimeOffRequestCreationAttributes, TimeOffRequestStatus, TimeOffRequestType } from '../../src/models/TimeOffRequest';
import Membership, { MembershipAttributes, MembershipRole, MembershipStatus as MemberStatus } from '../../src/models/Membership';
import User from '../../src/models/User';
import Establishment from '../../src/models/Establishment';
import { CreateTimeOffRequestDto, ListTimeOffRequestsQueryDto, ProcessTimeOffRequestDto, CancelTimeOffRequestDto } from '../../src/dtos/timeoff-request.validation';
import { PaginationDto, createPaginationResult } from '../../src/dtos/pagination.validation';
import { AppError } from '../../src/errors/app.errors';
import { TimeOffRequestNotFoundError, TimeOffRequestInvalidActionError } from '../../src/errors/availability.errors';
import { INotificationService } from '../../src/services/notification.service';

// Supposons une valeur par défaut pour TimeOffRequestType si les valeurs exactes ne sont pas connues
// Remplacez TimeOffRequestType.DEFAULT_LEAVE_TYPE par une valeur enum réelle si disponible
enum PlaceholderTimeOffRequestType {
    DEFAULT_LEAVE_TYPE = 'DEFAULT_LEAVE_TYPE',
    VACATION = 'VACATION',
    SICK_LEAVE = 'SICK_LEAVE',
    PERSONAL = 'PERSONAL',
}

interface UserAttributes {
    id: number;
    username: string;
    email: string;
    email_masked: string;
    email_code?: string;
    email_code_requested_at?: Date;
    is_email_active: boolean;
    phone?: string;
    phone_masked?: string;
    phone_code?: string;
    phone_code_requested_at?: Date;
    is_phone_active: boolean;
    password: string;
    is_active: boolean;
    is_recovering: boolean;
    profile_picture?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    is_two_factor_enabled: boolean;
    two_factor_method?: 'email' | 'sms' | 'totp' | null;
    two_factor_code_hash?: string | null;
    two_factor_code_expires_at?: Date | null;
    recovery_codes_hashes?: string[] | null;
    two_factor_secret?: string | null;
    password_reset_token?: string | null;
    password_reset_expires_at?: Date | null;
    email_activation_token?: string | null;
    email_activation_token_expires_at?: Date | null;
}

interface EstablishmentAttributes {
    id: number;
    name: string;
    description?: string | null;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    postal_code: string;
    region?: string | null;
    country_name: string;
    country_code: string;
    latitude?: number | null;
    longitude?: number | null;
    phone_number?: string | null;
    email?: string | null;
    profile_picture_url?: string | null;
    siret: string;
    siren: string;
    is_validated: boolean;
    owner_id: number;
    timezone: string;
    createdAt?: Date;
    updatedAt?: Date;
}

// Mock des dépendances
jest.mock('../../src/models', () => ({
    TimeOffRequest: {
        findByPk: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        findAndCountAll: jest.fn(),
    },
    Membership: {
        findByPk: jest.fn(),
        findAll: jest.fn(),
    },
    User: {
        findByPk: jest.fn(),
    },
    Establishment: {
        findByPk: jest.fn(),
    },
}));

// Fonction helper pour mocker une instance Sequelize
const mockSequelizeModelInstance = (data: any, methods?: Record<string, jest.Mock>) => {
    let currentData = { ...data }; // Store mutable state internally

    const instance: any = {
        ...currentData, // Spread initial data
        get: jest.fn(function(options?: { plain?: boolean }) {
            if (options?.plain) {
                const plainObject: any = {};
                for (const key in currentData) {
                    if (Object.prototype.hasOwnProperty.call(currentData, key)) {
                        plainObject[key] = (currentData as any)[key];
                    }
                }
                return plainObject;
            }
            Object.assign(this, currentData); // Sync instance with currentData
            return this;
        }),
        set: jest.fn(function(keyOrObject: any, value?: any) {
            const dataToUpdate = typeof keyOrObject === 'string' ? { [keyOrObject]: value } : keyOrObject;
            currentData = { ...currentData, ...dataToUpdate };
            Object.assign(this, currentData); // Sync instance properties
            return this;
        }),
        save: jest.fn(async function() {
            // When save is called, 'this' (the instance) should reflect any direct modifications
            // made by the service. We ensure currentData is the source of truth for 'get'
            // and that 'this' is also up-to-date if service modified 'this' directly.
            Object.assign(currentData, this); // Ensure currentData reflects any direct changes to 'this'
            Object.assign(this, currentData); // Ensure 'this' reflects currentData
            return Promise.resolve(this);
        }),
        toJSON: jest.fn(function() {
            const plainObject: any = {};
            for (const key in currentData) {
                if (Object.prototype.hasOwnProperty.call(currentData, key)) {
                    plainObject[key] = (currentData as any)[key];
                }
            }
            return plainObject;
        }),
        update: jest.fn(async function(values: any) {
            this.set(values);
            return this.save();
        }),
        destroy: jest.fn(async function() {
            return Promise.resolve();
        }),
    };

    if (methods) {
        for (const methodName in methods) {
            instance[methodName] = methods[methodName];
        }
    }
    return instance;
};

// Utiliser mockSequelizeModelInstance pour createTimeOffRequestMockInstance pour la cohérence
const createTimeOffRequestMockInstance = (initialAttrs: Partial<TimeOffRequestAttributes>) => {
    return mockSequelizeModelInstance(initialAttrs);
};


const mockNotificationService: jest.Mocked<INotificationService> = {
    sendTimeOffRequestSubmittedNotification: jest.fn(),
    sendTimeOffRequestProcessedNotification: jest.fn(),
    sendTimeOffRequestCancelledByMemberNotification: jest.fn(),
    sendTimeOffRequestCancelledByAdminNotification: jest.fn(),
    sendEmailVerificationCode: jest.fn(),
    sendPhoneVerificationCode: jest.fn(),
    sendPasswordRecoveryToken: jest.fn(),
    sendWelcomeEmail: jest.fn(),
    sendActivationEmail: jest.fn(),
    sendAccountDeletionConfirmation: jest.fn(),
    sendInvitationEmail: jest.fn(),
    sendMemberJoinedNotification: jest.fn(),
    sendBookingConfirmationClient: jest.fn(),
    sendBookingNotificationAdmin: jest.fn(),
    sendBookingCancellationAdmin: jest.fn(),
    sendBookingStatusUpdateClient: jest.fn(),
};

const MOCK_ACTOR_MEMBERSHIP_STAFF: MembershipAttributes = {
    id: 1, userId: 100, establishmentId: 10, role: MembershipRole.STAFF, status: MemberStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};
const MOCK_ACTOR_MEMBERSHIP_ADMIN: MembershipAttributes = {
    id: 2, userId: 101, establishmentId: 10, role: MembershipRole.ADMIN, status: MemberStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};
const MOCK_OTHER_ADMIN_USER: UserAttributes = {
    id: 102, email: 'admin2@example.com', username: 'admin_two', email_masked: 'ad***@example.com', is_email_active: true, password: 'hashedpassword',
    is_active: true, is_recovering: false, is_phone_active: false, is_two_factor_enabled: false, createdAt: new Date(), updatedAt: new Date(),
};
const MOCK_OTHER_ADMIN_MEMBERSHIP_BASE: MembershipAttributes = {
    id: 3, userId: 102, establishmentId: 10, role: MembershipRole.ADMIN, status: MemberStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};
const MOCK_REQUESTING_USER: UserAttributes = {
    id: 100, username: 'staff_member', email: 'staff@example.com', email_masked: 'st***@example.com', is_email_active: true, is_phone_active: false,
    password: 'hashedpassword', is_active: true, is_recovering: false, profile_picture: null, createdAt: new Date(), updatedAt: new Date(), is_two_factor_enabled: false,
};
const MOCK_ESTABLISHMENT: EstablishmentAttributes = {
    id: 10, name: 'Test Establishment', owner_id: 101, address_line1: '123 Main St', city: 'Testville', postal_code: '12345', country_name: 'France',
    country_code: 'FR', siret: '12345678901234', siren: '123456789', is_validated: true, timezone: 'Europe/Paris', createdAt: new Date(), updatedAt: new Date(),
};

describe('TimeoffRequestService', () => {
    let timeoffRequestService: TimeOffRequestService;

    const mockTimeOffRequestModel = db.TimeOffRequest as jest.Mocked<typeof db.TimeOffRequest>;
    const mockMembershipModel = db.Membership as jest.Mocked<typeof db.Membership>;
    const mockUserModel = db.User as jest.Mocked<typeof db.User>;
    const mockEstablishmentModel = db.Establishment as jest.Mocked<typeof db.Establishment>;

    beforeEach(() => {
        jest.clearAllMocks();
        timeoffRequestService = new TimeOffRequestService(mockNotificationService);
    });

    describe('createTimeOffRequest', () => {
        const createDto: CreateTimeOffRequestDto = {
            type: PlaceholderTimeOffRequestType.VACATION as unknown as TimeOffRequestType,
            startDate: '2024-12-01',
            endDate: '2024-12-05',
            reason: 'Annual vacation',
        };
        const mockTimeOffRequestAttributes: TimeOffRequestAttributes = {
            id: 1, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id, establishmentId: MOCK_ACTOR_MEMBERSHIP_STAFF.establishmentId!,
            type: PlaceholderTimeOffRequestType.VACATION as unknown as TimeOffRequestType, startDate: '2024-12-01', endDate: '2024-12-05',
            reason: createDto.reason || null, status: TimeOffRequestStatus.PENDING, adminNotes: null, processedByMembershipId: null,
            cancellationReason: null, cancelledByMembershipId: null, createdAt: new Date(), updatedAt: new Date(),
        };

        it('should create a time off request successfully and notify admins', async () => {
            const mockCreatedTimeOffRequestInstance = createTimeOffRequestMockInstance(mockTimeOffRequestAttributes);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedTimeOffRequestInstance as any);
            mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_REQUESTING_USER) as any);
            mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT) as any);

            const adminToNotifyInstance = mockSequelizeModelInstance({
                ...MOCK_OTHER_ADMIN_MEMBERSHIP_BASE,
                user: mockSequelizeModelInstance(MOCK_OTHER_ADMIN_USER)
            });
            mockMembershipModel.findAll.mockResolvedValue([adminToNotifyInstance] as any[]);

            const result = await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_MEMBERSHIP_STAFF);

            expect(mockTimeOffRequestModel.create).toHaveBeenCalledWith(expect.objectContaining({
                membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id, establishmentId: MOCK_ACTOR_MEMBERSHIP_STAFF.establishmentId,
                type: createDto.type, startDate: createDto.startDate, endDate: createDto.endDate, reason: createDto.reason, status: TimeOffRequestStatus.PENDING,
            }));
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).toHaveBeenCalledTimes(1);
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).toHaveBeenCalledWith(
                MOCK_OTHER_ADMIN_USER.email, // MODIFIÉ : Utilisation de MOCK_OTHER_ADMIN_USER.email
                expect.objectContaining({ id: MOCK_REQUESTING_USER.id }),
                expect.objectContaining({ id: mockTimeOffRequestAttributes.id }),
                expect.objectContaining({ id: MOCK_ESTABLISHMENT.id })
            );
            expect(result).toEqual(mockCreatedTimeOffRequestInstance.get({ plain: true }));
        });

        // ... (les tests createTimeOffRequest qui passent restent inchangés) ...
        it('should create a time off request without reason if not provided', async () => {
            const dtoWithoutReason: CreateTimeOffRequestDto = { ...createDto, reason: undefined };
            const mockRequestAttrsWithoutReason: TimeOffRequestAttributes = { ...mockTimeOffRequestAttributes, reason: null };
            const mockRequestWithoutReasonInstance = createTimeOffRequestMockInstance(mockRequestAttrsWithoutReason);

            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockRequestWithoutReasonInstance as any);
            mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_REQUESTING_USER) as any);
            mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT) as any);
            mockMembershipModel.findAll.mockResolvedValue([]);

            await timeoffRequestService.createTimeOffRequest(dtoWithoutReason, MOCK_ACTOR_MEMBERSHIP_STAFF);
            expect(mockTimeOffRequestModel.create).toHaveBeenCalledWith(expect.objectContaining({
                reason: null,
            }));
        });

        it('should log an error and not send notification if requesting user is not found for notification', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const mockCreatedInstance = createTimeOffRequestMockInstance(mockTimeOffRequestAttributes);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedInstance as any);
            mockUserModel.findByPk.mockResolvedValue(null);
            mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT) as any);
            const adminToNotifyInstance = mockSequelizeModelInstance({
                ...MOCK_OTHER_ADMIN_MEMBERSHIP_BASE, user: mockSequelizeModelInstance(MOCK_OTHER_ADMIN_USER)
            });
            mockMembershipModel.findAll.mockResolvedValue([adminToNotifyInstance] as any[]);

            await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_MEMBERSHIP_STAFF);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[TimeOffRequestService] Requesting user with ID ${MOCK_ACTOR_MEMBERSHIP_STAFF.userId} not found for notification.`));
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        it('should log an error and not send notification if establishment is not found for notification', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const mockCreatedInstance = createTimeOffRequestMockInstance(mockTimeOffRequestAttributes);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedInstance as any);
            mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_REQUESTING_USER) as any);
            mockEstablishmentModel.findByPk.mockResolvedValue(null);
            const adminToNotifyInstance = mockSequelizeModelInstance({
                ...MOCK_OTHER_ADMIN_MEMBERSHIP_BASE, user: mockSequelizeModelInstance(MOCK_OTHER_ADMIN_USER)
            });
            mockMembershipModel.findAll.mockResolvedValue([adminToNotifyInstance] as any[]);

            await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_MEMBERSHIP_STAFF);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[TimeOffRequestService] Establishment with ID ${MOCK_ACTOR_MEMBERSHIP_STAFF.establishmentId} not found for notification.`));
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        it('should throw AppError if actorMembership.establishmentId is missing', async () => {
            const incompleteActor = { ...MOCK_ACTOR_MEMBERSHIP_STAFF, establishmentId: undefined as any };
            await expect(timeoffRequestService.createTimeOffRequest(createDto, incompleteActor))
                .rejects.toThrow(new AppError('InvalidActorContext', 500, 'Actor membership context is incomplete (missing establishmentId or userId).'));
        });

        it('should throw AppError if actorMembership.userId is missing', async () => {
            const incompleteActor = { ...MOCK_ACTOR_MEMBERSHIP_STAFF, userId: undefined as any };
            await expect(timeoffRequestService.createTimeOffRequest(createDto, incompleteActor))
                .rejects.toThrow(new AppError('InvalidActorContext', 500, 'Actor membership context is incomplete (missing establishmentId or userId).'));
        });

        it('should throw AppError if endDate is before startDate', async () => {
            const invalidDateDto: CreateTimeOffRequestDto = { ...createDto, startDate: '2024-12-05', endDate: '2024-12-01' };
            await expect(timeoffRequestService.createTimeOffRequest(invalidDateDto, MOCK_ACTOR_MEMBERSHIP_STAFF))
                .rejects.toThrow(new AppError('InvalidInput', 400, 'End date cannot be before start date.'));
        });

        it('should throw TimeOffRequestInvalidActionError if an overlapping PENDING request exists', async () => {
            const overlappingReqAttrs: Partial<TimeOffRequestAttributes> = { id: 99, status: TimeOffRequestStatus.PENDING, type: PlaceholderTimeOffRequestType.DEFAULT_LEAVE_TYPE as any, startDate: '2024-01-01', endDate: '2024-01-01' };
            const overlappingReqInstance = createTimeOffRequestMockInstance(overlappingReqAttrs);
            mockTimeOffRequestModel.findOne.mockResolvedValue(overlappingReqInstance as any);
            await expect(timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_MEMBERSHIP_STAFF))
                .rejects.toThrow(new TimeOffRequestInvalidActionError(
                    `An overlapping time off request (ID: ${overlappingReqInstance.id}, Status: ${overlappingReqInstance.status}) already exists for these dates.`
                ));
        });

        it('should throw TimeOffRequestInvalidActionError if an overlapping APPROVED request exists', async () => {
            const overlappingReqAttrs: Partial<TimeOffRequestAttributes> = { id: 98, status: TimeOffRequestStatus.APPROVED, type: PlaceholderTimeOffRequestType.DEFAULT_LEAVE_TYPE as any, startDate: '2024-01-01', endDate: '2024-01-01' };
            const overlappingReqInstance = createTimeOffRequestMockInstance(overlappingReqAttrs);
            mockTimeOffRequestModel.findOne.mockResolvedValue(overlappingReqInstance as any);
            await expect(timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_MEMBERSHIP_STAFF))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });

        it('should create request if overlapping request is CANCELLED', async () => {
            const mockCreatedInstance = createTimeOffRequestMockInstance(mockTimeOffRequestAttributes);
            // MODIFIÉ : findOne doit retourner null pour ne pas trouver de requête qui se chevauche
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedInstance as any);
            mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_REQUESTING_USER) as any);
            mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT) as any);
            mockMembershipModel.findAll.mockResolvedValue([]);

            const result = await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_MEMBERSHIP_STAFF);
            expect(result).toBeDefined();
            expect(mockTimeOffRequestModel.create).toHaveBeenCalled();
        });
    });


    describe('getTimeOffRequestById', () => {
        const requestId = 1;
        const mockTimeOffRequestAttrs: TimeOffRequestAttributes = {
            id: requestId, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id, establishmentId: MOCK_ACTOR_MEMBERSHIP_STAFF.establishmentId!,
            type: PlaceholderTimeOffRequestType.SICK_LEAVE as unknown as TimeOffRequestType, startDate: '2024-11-01', endDate: '2024-11-02',
            status: TimeOffRequestStatus.APPROVED, processedByMembershipId: MOCK_ACTOR_MEMBERSHIP_ADMIN.id, reason: null, adminNotes: null,
            cancellationReason: null, cancelledByMembershipId: null, createdAt: new Date(), updatedAt: new Date(),
        };
        const mockTimeOffRequestInstance = createTimeOffRequestMockInstance(mockTimeOffRequestAttrs);

        it('should return the time off request with all associations if found', async () => {
            mockTimeOffRequestModel.findByPk.mockResolvedValue(mockTimeOffRequestInstance as any);
            const result = await timeoffRequestService.getTimeOffRequestById(requestId);
            expect(mockTimeOffRequestModel.findByPk).toHaveBeenCalledWith(requestId, expect.objectContaining({
                include: expect.arrayContaining([
                    expect.objectContaining({ model: db.Membership, as: 'requestingMember' }),
                    expect.objectContaining({ model: db.Membership, as: 'processingAdmin' }),
                    expect.objectContaining({ model: db.Membership, as: 'cancellingActor' }),
                ])
            }));
            expect(result).toEqual(mockTimeOffRequestInstance.get({ plain: true }));
        });
        it('should throw TimeOffRequestNotFoundError if request is not found', async () => {
            mockTimeOffRequestModel.findByPk.mockResolvedValue(null);
            await expect(timeoffRequestService.getTimeOffRequestById(999))
                .rejects.toThrow(TimeOffRequestNotFoundError);
        });
    });

    describe('listTimeOffRequestsForMember', () => {
        // ... (les tests listTimeOffRequestsForMember qui passent restent inchangés) ...
        const establishmentId = 10;
        const targetMembershipId = MOCK_ACTOR_MEMBERSHIP_STAFF.id;
        const defaultQueryDto: ListTimeOffRequestsQueryDto = {
            page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc',
        };
        const mockRequest1Attrs: TimeOffRequestAttributes = {
            id: 1, createdAt: new Date('2024-01-01T10:00:00Z'), establishmentId, membershipId: targetMembershipId,
            type: PlaceholderTimeOffRequestType.DEFAULT_LEAVE_TYPE as any, startDate: '2024-01-01', endDate: '2024-01-01', status: TimeOffRequestStatus.PENDING,
            reason: null, adminNotes: null, processedByMembershipId: null, cancellationReason: null, cancelledByMembershipId: null, updatedAt: new Date()
        };
        const mockRequest2Attrs: TimeOffRequestAttributes = {
            id: 2, createdAt: new Date('2024-01-02T10:00:00Z'), establishmentId, membershipId: targetMembershipId,
            type: PlaceholderTimeOffRequestType.DEFAULT_LEAVE_TYPE as any, startDate: '2024-01-02', endDate: '2024-01-02', status: TimeOffRequestStatus.APPROVED,
            reason: null, adminNotes: null, processedByMembershipId: null, cancellationReason: null, cancelledByMembershipId: null, updatedAt: new Date()
        };
        const mockRequest1Instance = createTimeOffRequestMockInstance(mockRequest1Attrs);
        const mockRequest2Instance = createTimeOffRequestMockInstance(mockRequest2Attrs);

        it('should filter by status if provided', async () => {
            const queryWithStatus: ListTimeOffRequestsQueryDto = { ...defaultQueryDto, status: TimeOffRequestStatus.APPROVED };
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({
                count: [{ count: 1 }],
                rows: [mockRequest2Instance] as any
            });
            await timeoffRequestService.listTimeOffRequestsForMember(establishmentId, targetMembershipId, queryWithStatus);
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { establishmentId, membershipId: targetMembershipId, status: TimeOffRequestStatus.APPROVED },
            }));
        });
        it('should list time off requests for a member with default pagination and sorting', async () => {
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({
                count: [{ count: 2 }],
                rows: [mockRequest2Instance, mockRequest1Instance] as any,
            });
            const result = await timeoffRequestService.listTimeOffRequestsForMember(establishmentId, targetMembershipId, defaultQueryDto);
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { establishmentId, membershipId: targetMembershipId },
                limit: defaultQueryDto.limit, offset: 0, order: [[defaultQueryDto.sortBy, 'DESC']],
            }));
            expect(result.meta.totalItems).toBe(2); expect(result.meta.currentPage).toBe(1);
            expect(result.meta.itemsPerPage).toBe(defaultQueryDto.limit); expect(result.meta.totalPages).toBe(1);
            expect(result.meta.itemCount).toBe(2);
        });
        it('should use provided pagination and sorting parameters', async () => {
            const queryCustom: ListTimeOffRequestsQueryDto = { page: 2, limit: 5, sortBy: 'startDate', sortOrder: 'asc' };
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({
                count: [{ count: 10 }],
                rows: [] as any[]
            });
            await timeoffRequestService.listTimeOffRequestsForMember(establishmentId, targetMembershipId, queryCustom);
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                limit: 5, offset: 5, order: [['startDate', 'ASC']],
            }));
        });
        it('should return an empty list if no requests match', async () => {
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({
                count: [{ count: 0 }],
                rows: [] as any[]
            });
            const result = await timeoffRequestService.listTimeOffRequestsForMember(establishmentId, targetMembershipId, defaultQueryDto);
            expect(result.data.length).toBe(0); expect(result.meta.totalItems).toBe(0);
            expect(result.meta.currentPage).toBe(1); expect(result.meta.totalPages).toBe(0);
            expect(result.meta.itemCount).toBe(0);
        });
    });

    describe('processTimeOffRequest', () => {
        const requestId = 1;
        const processDtoApprove: ProcessTimeOffRequestDto = { status: TimeOffRequestStatus.APPROVED, adminNotes: 'Approved for urgent matter' };
        const processDtoReject: ProcessTimeOffRequestDto = { status: TimeOffRequestStatus.REJECTED, adminNotes: 'Operational needs' };

        // MODIFIÉ : Définir des instances mockées pour les objets imbriqués qui seront retournés
        const mockRequestingUserInstance = mockSequelizeModelInstance(MOCK_REQUESTING_USER);
        const mockEstablishmentInstance = mockSequelizeModelInstance(MOCK_ESTABLISHMENT);

        const mockRequestingMembershipForProcess = mockSequelizeModelInstance({
            id: MOCK_ACTOR_MEMBERSHIP_STAFF.id,
            userId: MOCK_ACTOR_MEMBERSHIP_STAFF.userId!,
            establishmentId: MOCK_ACTOR_MEMBERSHIP_STAFF.establishmentId!,
            role: MembershipRole.STAFF,
            status: MemberStatus.ACTIVE,
            // ... autres champs MembershipAttributes si nécessaire
            user: mockRequestingUserInstance,       // Instance mockée
            establishment: mockEstablishmentInstance // Instance mockée
        });

        it('should approve a PENDING request and notify member', async () => {
            const initialRequestData: TimeOffRequestAttributes = {
                id: requestId, status: TimeOffRequestStatus.PENDING, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id,
                establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId!, type: PlaceholderTimeOffRequestType.VACATION as any,
                startDate: '2024-01-01', endDate: '2024-01-02', reason: 'Needs approval', adminNotes: null,
                processedByMembershipId: null, cancellationReason: null, cancelledByMembershipId: null, createdAt: new Date(), updatedAt: new Date(),
            };
            // MODIFIÉ : Utiliser createTimeOffRequestMockInstance pour une meilleure gestion de l'état
            const timeOffRequestInstance = createTimeOffRequestMockInstance(initialRequestData);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(timeOffRequestInstance as any);

            // MODIFIÉ : Assurer que le mock de MembershipModel.findByPk retourne l'instance avec user et establishment mockés
            mockMembershipModel.findByPk.mockResolvedValue(mockRequestingMembershipForProcess as any);

            const result = await timeoffRequestService.processTimeOffRequest(requestId, processDtoApprove, MOCK_ACTOR_MEMBERSHIP_ADMIN);

            expect(mockTimeOffRequestModel.findByPk).toHaveBeenCalledWith(requestId);
            expect(timeOffRequestInstance.save).toHaveBeenCalled(); // Vérifier que save a été appelé sur l'instance mockée

            expect(result.status).toBe(TimeOffRequestStatus.APPROVED);
            expect(result.adminNotes).toBe(processDtoApprove.adminNotes);
            expect(result.processedByMembershipId).toBe(MOCK_ACTOR_MEMBERSHIP_ADMIN.id);

            expect(mockNotificationService.sendTimeOffRequestProcessedNotification).toHaveBeenCalledWith(
                MOCK_REQUESTING_USER.email,
                expect.objectContaining({id: MOCK_REQUESTING_USER.id}),
                expect.objectContaining({id: requestId, status: TimeOffRequestStatus.APPROVED}),
                expect.objectContaining({id: MOCK_ESTABLISHMENT.id})
            );
        });

        it('should reject a PENDING request and notify member', async () => {
            const initialRequestData: TimeOffRequestAttributes = {
                id: requestId, status: TimeOffRequestStatus.PENDING, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id,
                establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId!, type: PlaceholderTimeOffRequestType.VACATION as any,
                startDate: '2024-01-01', endDate: '2024-01-02', reason: 'Needs rejection', adminNotes: null,
                processedByMembershipId: null, cancellationReason: null, cancelledByMembershipId: null, createdAt: new Date(), updatedAt: new Date(),
            };
            // MODIFIÉ : Utiliser createTimeOffRequestMockInstance
            const timeOffRequestInstance = createTimeOffRequestMockInstance(initialRequestData);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(timeOffRequestInstance as any);

            // MODIFIÉ : Assurer que le mock de MembershipModel.findByPk retourne l'instance avec user et establishment mockés
            mockMembershipModel.findByPk.mockResolvedValue(mockRequestingMembershipForProcess as any);

            const result = await timeoffRequestService.processTimeOffRequest(requestId, processDtoReject, MOCK_ACTOR_MEMBERSHIP_ADMIN);

            expect(timeOffRequestInstance.save).toHaveBeenCalled();
            expect(result.status).toBe(TimeOffRequestStatus.REJECTED);
            expect(mockNotificationService.sendTimeOffRequestProcessedNotification).toHaveBeenCalledWith(
                MOCK_REQUESTING_USER.email,
                expect.objectContaining({ id: MOCK_REQUESTING_USER.id }),
                expect.objectContaining({ id: requestId, status: TimeOffRequestStatus.REJECTED }),
                expect.objectContaining({ id: MOCK_ESTABLISHMENT.id })
            );
        });

        // ... (les tests processTimeOffRequest qui passent restent inchangés) ...
        it('should log warning and not send notification if requesting member email is missing', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const initialAttrs: Partial<TimeOffRequestAttributes> = {
                id: requestId, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id, establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId!,
                status: TimeOffRequestStatus.PENDING, type: PlaceholderTimeOffRequestType.VACATION as any, startDate: '2024-01-01', endDate: '2024-01-02',
            };
            const timeOffRequestInstance = createTimeOffRequestMockInstance(initialAttrs);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(timeOffRequestInstance as any);

            const userWithoutEmail = mockSequelizeModelInstance({...MOCK_REQUESTING_USER, email: undefined as any});
            const establishmentForMembership = mockSequelizeModelInstance(MOCK_ESTABLISHMENT);
            const memberWithoutEmailInstance = mockSequelizeModelInstance({
                ...MOCK_ACTOR_MEMBERSHIP_STAFF, // Assurez-vous que c'est bien le membership du demandeur
                user: userWithoutEmail,
                establishment: establishmentForMembership
            });
            mockMembershipModel.findByPk.mockResolvedValue(memberWithoutEmailInstance as any);

            await timeoffRequestService.processTimeOffRequest(requestId, processDtoApprove, MOCK_ACTOR_MEMBERSHIP_ADMIN);

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`[TimeOffRequestService] Requesting user or user email not found for membership ID ${MOCK_ACTOR_MEMBERSHIP_STAFF.id}`));
            expect(mockNotificationService.sendTimeOffRequestProcessedNotification).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });
        it('should throw TimeOffRequestNotFoundError if request is not found', async () => {
            mockTimeOffRequestModel.findByPk.mockResolvedValue(null);
            await expect(timeoffRequestService.processTimeOffRequest(999, processDtoApprove, MOCK_ACTOR_MEMBERSHIP_ADMIN))
                .rejects.toThrow(TimeOffRequestNotFoundError);
        });
        it('should throw TimeOffRequestInvalidActionError if request is not PENDING', async () => {
            const alreadyApprovedAttrs: Partial<TimeOffRequestAttributes> = {
                id: requestId, status: TimeOffRequestStatus.APPROVED, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id,
                establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId!, type: PlaceholderTimeOffRequestType.VACATION as any, startDate: '2024-01-01', endDate: '2024-01-02',
            };
            const alreadyApprovedInstance = createTimeOffRequestMockInstance(alreadyApprovedAttrs);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(alreadyApprovedInstance as any);
            await expect(timeoffRequestService.processTimeOffRequest(requestId, processDtoApprove, MOCK_ACTOR_MEMBERSHIP_ADMIN))
                .rejects.toThrow(new TimeOffRequestInvalidActionError(`Cannot process a request that is not in PENDING status. Current status: ${TimeOffRequestStatus.APPROVED}`));
        });
        it('should throw AppError (Forbidden) if admin does not belong to the request establishment', async () => {
            const initialAttrs: Partial<TimeOffRequestAttributes> = {
                id: requestId, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id, establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId!,
                status: TimeOffRequestStatus.PENDING, type: PlaceholderTimeOffRequestType.VACATION as any, startDate: '2024-01-01', endDate: '2024-01-02',
            };
            const testMockInstance = createTimeOffRequestMockInstance(initialAttrs);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(testMockInstance as any);
            const differentEstablishmentAdmin = { ...MOCK_ACTOR_MEMBERSHIP_ADMIN, establishmentId: 999 };
            await expect(timeoffRequestService.processTimeOffRequest(requestId, processDtoApprove, differentEstablishmentAdmin))
                .rejects.toThrow(new AppError('Forbidden', 403, 'Admin does not belong to the establishment of this time off request.'));
        });
    });

    describe('cancelTimeOffRequest', () => {
        const requestId = 1;
        const cancelDto: CancelTimeOffRequestDto = { cancellationReason: 'Change of plans' };

        // MODIFIÉ : Définir des instances mockées pour les objets imbriqués
        const mockRequestingUserForCancel = mockSequelizeModelInstance(MOCK_REQUESTING_USER);
        const mockActorStaffUserForCancel = mockSequelizeModelInstance({...MOCK_REQUESTING_USER, id: MOCK_ACTOR_MEMBERSHIP_STAFF.userId!});
        const mockActorAdminUserForCancel = mockSequelizeModelInstance({...MOCK_REQUESTING_USER, id: MOCK_ACTOR_MEMBERSHIP_ADMIN.userId!, username: 'admin_user_for_cancel'});
        const mockEstablishmentForCancel = mockSequelizeModelInstance(MOCK_ESTABLISHMENT);

        const mockRequestingMembershipForCancel = mockSequelizeModelInstance({
            id: MOCK_ACTOR_MEMBERSHIP_STAFF.id, userId: MOCK_ACTOR_MEMBERSHIP_STAFF.userId!,
            establishmentId: MOCK_ACTOR_MEMBERSHIP_STAFF.establishmentId!, role: MembershipRole.STAFF, status: MemberStatus.ACTIVE,
            // ... autres champs MembershipAttributes
            user: mockRequestingUserForCancel // Instance User mockée
        });

        // Helper pour configurer les mocks communs à plusieurs tests de cancelTimeOffRequest
        const setupCancelMocks = (timeOffRequestInstanceToReturn: any) => {
            mockTimeOffRequestModel.findByPk.mockResolvedValue(timeOffRequestInstanceToReturn);
            mockMembershipModel.findByPk.mockResolvedValue(mockRequestingMembershipForCancel as any); // Pour le requestingMember
            mockEstablishmentModel.findByPk.mockResolvedValue(mockEstablishmentForCancel as any);
            mockUserModel.findByPk.mockImplementation(id => { // Pour l'actorUser
                if (id === MOCK_ACTOR_MEMBERSHIP_STAFF.userId) return Promise.resolve(mockActorStaffUserForCancel as any);
                if (id === MOCK_ACTOR_MEMBERSHIP_ADMIN.userId) return Promise.resolve(mockActorAdminUserForCancel as any);
                return Promise.resolve(null);
            });
        };


        it('should allow member to cancel their own PENDING request and notify admins', async () => {
            const initialPendingAttrs: TimeOffRequestAttributes = {
                id: requestId, status: TimeOffRequestStatus.PENDING, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id,
                establishmentId: MOCK_ACTOR_MEMBERSHIP_STAFF.establishmentId!, type: PlaceholderTimeOffRequestType.PERSONAL as any,
                startDate:'2024-01-01', endDate:'2024-01-01', reason:null, adminNotes:null,
                processedByMembershipId:null, cancellationReason:null, cancelledByMembershipId:null, createdAt:new Date(), updatedAt:new Date()
            };
            // MODIFIÉ : Utiliser createTimeOffRequestMockInstance
            const timeOffRequestInstance = createTimeOffRequestMockInstance(initialPendingAttrs);
            setupCancelMocks(timeOffRequestInstance); // Configure les mocks communs

            const adminToNotifyInstance = mockSequelizeModelInstance({
                ...MOCK_OTHER_ADMIN_MEMBERSHIP_BASE, // Utiliser la base sans user/establishment car ils seront mockés par mockSequelizeModelInstance
                user: mockSequelizeModelInstance(MOCK_OTHER_ADMIN_USER) // S'assurer que 'user' est une instance mockée
            });
            mockMembershipModel.findAll.mockResolvedValue([adminToNotifyInstance] as any[]);

            const result = await timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_MEMBERSHIP_STAFF);

            expect(timeOffRequestInstance.save).toHaveBeenCalled();
            expect(result.status).toBe(TimeOffRequestStatus.CANCELLED_BY_MEMBER);
            expect(result.cancellationReason).toBe(cancelDto.cancellationReason);
            expect(result.cancelledByMembershipId).toBe(MOCK_ACTOR_MEMBERSHIP_STAFF.id);
            expect(mockNotificationService.sendTimeOffRequestCancelledByMemberNotification).toHaveBeenCalledTimes(1);
            expect(mockNotificationService.sendTimeOffRequestCancelledByMemberNotification).toHaveBeenCalledWith(
                MOCK_OTHER_ADMIN_USER.email,
                expect.objectContaining({ id: MOCK_ACTOR_MEMBERSHIP_STAFF.userId }),
                expect.objectContaining({ id: requestId, status: TimeOffRequestStatus.CANCELLED_BY_MEMBER }),
                expect.objectContaining({ id: MOCK_ESTABLISHMENT.id })
            );
        });

        it('should allow admin to cancel a PENDING request and notify member', async () => {
            const initialPendingAttrs: TimeOffRequestAttributes = {
                id: requestId, status: TimeOffRequestStatus.PENDING, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id, // Demande du staff
                establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId!, type: PlaceholderTimeOffRequestType.PERSONAL as any,
                startDate:'2024-01-01', endDate:'2024-01-01', reason:null, adminNotes:null,
                processedByMembershipId:null, cancellationReason:null, cancelledByMembershipId:null, createdAt:new Date(), updatedAt:new Date()
            };
            // MODIFIÉ : Utiliser createTimeOffRequestMockInstance
            const timeOffRequestInstance = createTimeOffRequestMockInstance(initialPendingAttrs);
            setupCancelMocks(timeOffRequestInstance); // Configure les mocks communs

            const result = await timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_MEMBERSHIP_ADMIN);

            expect(timeOffRequestInstance.save).toHaveBeenCalled();
            expect(result.status).toBe(TimeOffRequestStatus.CANCELLED_BY_ADMIN);
            expect(result.cancelledByMembershipId).toBe(MOCK_ACTOR_MEMBERSHIP_ADMIN.id);
            expect(mockNotificationService.sendTimeOffRequestCancelledByAdminNotification).toHaveBeenCalledWith(
                MOCK_REQUESTING_USER.email, // Email du membre (MOCK_ACTOR_MEMBERSHIP_STAFF)
                expect.objectContaining({ id: MOCK_ACTOR_MEMBERSHIP_STAFF.userId }),
                expect.objectContaining({ id: requestId, status: TimeOffRequestStatus.CANCELLED_BY_ADMIN }),
                expect.objectContaining({ id: MOCK_ESTABLISHMENT.id })
            );
        });

        it('should allow admin to cancel an APPROVED request and notify member', async () => {
            const initialApprovedAttrs: TimeOffRequestAttributes = {
                id: requestId, status: TimeOffRequestStatus.APPROVED, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id,
                establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId!, type: PlaceholderTimeOffRequestType.PERSONAL as any,
                startDate:'2024-01-01', endDate:'2024-01-01', reason:null, adminNotes:null,
                processedByMembershipId: MOCK_ACTOR_MEMBERSHIP_ADMIN.id,
                cancellationReason:null, cancelledByMembershipId:null, createdAt:new Date(), updatedAt:new Date()
            };
            // MODIFIÉ : Utiliser createTimeOffRequestMockInstance
            const timeOffRequestInstance = createTimeOffRequestMockInstance(initialApprovedAttrs);
            setupCancelMocks(timeOffRequestInstance); // Configure les mocks communs

            const result = await timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_MEMBERSHIP_ADMIN);

            expect(timeOffRequestInstance.save).toHaveBeenCalled();
            expect(result.status).toBe(TimeOffRequestStatus.CANCELLED_BY_ADMIN);
            expect(mockNotificationService.sendTimeOffRequestCancelledByAdminNotification).toHaveBeenCalledWith(
                MOCK_REQUESTING_USER.email,
                expect.objectContaining({ id: MOCK_ACTOR_MEMBERSHIP_STAFF.userId }),
                expect.objectContaining({ id: requestId, status: TimeOffRequestStatus.CANCELLED_BY_ADMIN }),
                expect.objectContaining({ id: MOCK_ESTABLISHMENT.id })
            );
        });
        // ... (les tests cancelTimeOffRequest qui passent restent inchangés) ...
        it('should throw TimeOffRequestNotFoundError if request is not found', async () => {
            mockTimeOffRequestModel.findByPk.mockResolvedValue(null);
            await expect(timeoffRequestService.cancelTimeOffRequest(999, cancelDto, MOCK_ACTOR_MEMBERSHIP_STAFF))
                .rejects.toThrow(TimeOffRequestNotFoundError);
        });
        it('should throw TimeOffRequestInvalidActionError if member tries to cancel an APPROVED request', async () => {
            const approvedInstance = createTimeOffRequestMockInstance({ status: TimeOffRequestStatus.APPROVED, membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id } as any);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(approvedInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_MEMBERSHIP_STAFF))
                .rejects.toThrow(new TimeOffRequestInvalidActionError(`Request cannot be cancelled. Current status: ${TimeOffRequestStatus.APPROVED}. Actor role: ${MembershipRole.STAFF}`));
        });
        it('should throw TimeOffRequestInvalidActionError if admin tries to cancel a REJECTED request', async () => {
            const rejectedInstance = createTimeOffRequestMockInstance({ status: TimeOffRequestStatus.REJECTED, establishmentId: MOCK_ACTOR_MEMBERSHIP_ADMIN.establishmentId } as any);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(rejectedInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_MEMBERSHIP_ADMIN))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });
        it('should throw TimeOffRequestInvalidActionError if actor is neither owner nor admin', async () => {
            const nonOwnerNonAdminActor: MembershipAttributes = { ...MOCK_ACTOR_MEMBERSHIP_STAFF, id: 999, userId: 9991, role: MembershipRole.STAFF };
            const requestFromOtherMemberInstance = createTimeOffRequestMockInstance({ membershipId: MOCK_ACTOR_MEMBERSHIP_STAFF.id + 10, status: TimeOffRequestStatus.PENDING } as any);
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestFromOtherMemberInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, nonOwnerNonAdminActor))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });
    });
})