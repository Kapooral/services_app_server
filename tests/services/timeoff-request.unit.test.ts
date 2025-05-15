// tests/services/timeoff-request.unit.test.ts
import { Op } from 'sequelize';
import { TimeOffRequestService } from '../../src/services/timeoff-request.service';
import db from '../../src/models';
import TimeOffRequest, { TimeOffRequestAttributes, TimeOffRequestCreationAttributes, TimeOffRequestStatus, TimeOffRequestType } from '../../src/models/TimeOffRequest';
import Membership, { MembershipAttributes, MembershipRole, MembershipStatus as MemberStatus } from '../../src/models/Membership';
import User from '../../src/models/User';
import Establishment from '../../src/models/Establishment';
import {
    CreateTimeOffRequestDto,
    ListTimeOffRequestsQueryDto,
    ProcessTimeOffRequestDto,
    CancelTimeOffRequestDto,
    ListAllTimeOffRequestsForEstablishmentQueryDto, // NOUVEAU DTO
    ListAllTimeOffRequestsForEstablishmentQueryDtoSchema // NOUVEAU DTO Schema (pour référence si besoin d'y accéder)
} from '../../src/dtos/timeoff-request.validation';
import { PaginationDto, createPaginationResult } from '../../src/dtos/pagination.validation';
import { AppError } from '../../src/errors/app.errors';
import { TimeOffRequestNotFoundError, TimeOffRequestInvalidActionError } from '../../src/errors/availability.errors';
import { INotificationService } from '../../src/services/notification.service';

// Valeurs Enum pour les tests
enum PlaceholderTimeOffRequestType {
    VACATION = 'VACATION',
    SICK_LEAVE = 'SICK_LEAVE',
    PERSONAL = 'PERSONAL',
    DEFAULT_LEAVE_TYPE = 'DEFAULT_LEAVE_TYPE' // Assurez-vous que cette valeur correspond à une valeur valide de votre enum TimeOffRequestType
}

// Interfaces simplifiées pour les mocks d'attributs
interface UserAttributesSimple {
    id: number;
    username: string;
    email: string;
    profile_picture?: string | null;
    // Ajouter d'autres champs si nécessaires pour les tests
}

interface EstablishmentAttributesSimple {
    id: number;
    name: string;
    // Ajouter d'autres champs si nécessaires pour les tests
}


// Mock des dépendances de Sequelize
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
    // Important: si db.sequelize.transaction est utilisé, il doit être mocké.
    // Pour l'instant, on suppose qu'il n'est pas utilisé directement dans le service.
}));

// Fonction helper pour mocker une instance Sequelize de manière plus robuste
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
                // Supprimer les méthodes du plain object
                if (methods) { Object.keys(methods).forEach(key => delete plainObject[key]); }
                delete plainObject.get; delete plainObject.save; delete plainObject.set;
                delete plainObject.update; delete plainObject.destroy; delete plainObject.toJSON;
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
            Object.assign(currentData, this);
            Object.assign(this, currentData);
            return Promise.resolve(this);
        }),
        toJSON: jest.fn(function() { // toJSON devrait retourner un objet plain, similaire à get({plain:true})
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
            if (Object.prototype.hasOwnProperty.call(methods, methodName)) {
                instance[methodName] = methods[methodName];
            }
        }
    }
    return instance;
};


// Mock du service de notification
const mockNotificationService: jest.Mocked<INotificationService> = {
    sendTimeOffRequestSubmittedNotification: jest.fn(),
    sendTimeOffRequestProcessedNotification: jest.fn(),
    sendTimeOffRequestCancelledByMemberNotification: jest.fn(),
    sendTimeOffRequestCancelledByAdminNotification: jest.fn(),
    // Mocker les autres méthodes si nécessaire pour éviter les erreurs "not a function"
    // Pour l'instant, nous nous concentrons sur celles utilisées par TimeOffRequestService
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

// Données de test communes
const MOCK_ESTABLISHMENT_ID = 10;
const MOCK_ACTOR_STAFF_MEMBERSHIP_ID = 1;
const MOCK_ACTOR_ADMIN_MEMBERSHIP_ID = 2;
const MOCK_REQUESTING_USER_ID = 100;
const MOCK_PROCESSING_ADMIN_USER_ID = 101;
const MOCK_OTHER_ADMIN_USER_ID = 102;

const MOCK_REQUESTING_USER_DATA: UserAttributesSimple = {
    id: MOCK_REQUESTING_USER_ID,
    username: 'staff_member',
    email: 'staff@example.com',
    profile_picture: 'http://example.com/profile.jpg',
};

const MOCK_PROCESSING_ADMIN_USER_DATA: UserAttributesSimple = {
    id: MOCK_PROCESSING_ADMIN_USER_ID,
    username: 'admin_processor',
    email: 'processor@example.com',
};

const MOCK_OTHER_ADMIN_USER_DATA: UserAttributesSimple = {
    id: MOCK_OTHER_ADMIN_USER_ID,
    username: 'other_admin',
    email: 'other_admin@example.com',
};


const MOCK_ACTOR_STAFF_MEMBERSHIP: MembershipAttributes = {
    id: MOCK_ACTOR_STAFF_MEMBERSHIP_ID, userId: MOCK_REQUESTING_USER_ID, establishmentId: MOCK_ESTABLISHMENT_ID,
    role: MembershipRole.STAFF, status: MemberStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_ACTOR_ADMIN_MEMBERSHIP: MembershipAttributes = {
    id: MOCK_ACTOR_ADMIN_MEMBERSHIP_ID, userId: MOCK_PROCESSING_ADMIN_USER_ID, establishmentId: MOCK_ESTABLISHMENT_ID,
    role: MembershipRole.ADMIN, status: MemberStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_OTHER_ADMIN_MEMBERSHIP_WITH_USER: MembershipAttributes & { user: UserAttributesSimple } = {
    id: 3, userId: MOCK_OTHER_ADMIN_USER_ID, establishmentId: MOCK_ESTABLISHMENT_ID,
    role: MembershipRole.ADMIN, status: MemberStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    user: MOCK_OTHER_ADMIN_USER_DATA,
};

const MOCK_REQUESTING_MEMBERSHIP_WITH_USER: MembershipAttributes & { user: UserAttributesSimple } = {
    id: MOCK_ACTOR_STAFF_MEMBERSHIP_ID, userId: MOCK_REQUESTING_USER_ID, establishmentId: MOCK_ESTABLISHMENT_ID,
    role: MembershipRole.STAFF, status: MemberStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    user: MOCK_REQUESTING_USER_DATA,
};

const MOCK_ESTABLISHMENT_DATA: EstablishmentAttributesSimple = {
    id: MOCK_ESTABLISHMENT_ID,
    name: 'Test Establishment Inc.',
};

const defaultTimeOffRequestAttrs: Omit<TimeOffRequestAttributes, 'id' | 'createdAt' | 'updatedAt'> = {
    membershipId: MOCK_ACTOR_STAFF_MEMBERSHIP_ID,
    establishmentId: MOCK_ESTABLISHMENT_ID,
    type: PlaceholderTimeOffRequestType.VACATION as unknown as TimeOffRequestType,
    startDate: '2024-12-01',
    endDate: '2024-12-05',
    reason: 'Annual leave',
    status: TimeOffRequestStatus.PENDING,
    adminNotes: null,
    processedByMembershipId: null,
    cancellationReason: null,
    cancelledByMembershipId: null,
};

const mockTimeOffRequestModel = db.TimeOffRequest as jest.Mocked<typeof db.TimeOffRequest>;
const mockMembershipModel = db.Membership as jest.Mocked<typeof db.Membership>;
const mockUserModel = db.User as jest.Mocked<typeof db.User>;
const mockEstablishmentModel = db.Establishment as jest.Mocked<typeof db.Establishment>;


describe('TimeoffRequestService', () => {
    let timeoffRequestService: TimeOffRequestService;

    beforeEach(() => {
        jest.clearAllMocks();
        timeoffRequestService = new TimeOffRequestService(mockNotificationService);

        // Configuration des mocks de base pour User et Establishment si souvent nécessaire
        mockUserModel.findByPk.mockImplementation(id => {
            if (id === MOCK_REQUESTING_USER_ID) return Promise.resolve(mockSequelizeModelInstance(MOCK_REQUESTING_USER_DATA) as any);
            if (id === MOCK_PROCESSING_ADMIN_USER_ID) return Promise.resolve(mockSequelizeModelInstance(MOCK_PROCESSING_ADMIN_USER_DATA) as any);
            if (id === MOCK_OTHER_ADMIN_USER_ID) return Promise.resolve(mockSequelizeModelInstance(MOCK_OTHER_ADMIN_USER_DATA) as any);
            return Promise.resolve(null);
        });
        mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT_DATA) as any);
    });

    describe('createTimeOffRequest', () => {
        const createDto: CreateTimeOffRequestDto = {
            type: PlaceholderTimeOffRequestType.VACATION as unknown as TimeOffRequestType,
            startDate: '2024-12-01',
            endDate: '2024-12-05',
            reason: 'Annual vacation',
        };

        it('should create a time off request successfully and notify admins', async () => {
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findOne.mockResolvedValue(null); // No overlapping
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);

            const adminToNotify = mockSequelizeModelInstance({ ...MOCK_OTHER_ADMIN_MEMBERSHIP_WITH_USER });
            mockMembershipModel.findAll.mockResolvedValue([adminToNotify] as any[]);

            const result = await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP);

            expect(mockTimeOffRequestModel.create).toHaveBeenCalledWith(expect.objectContaining({
                membershipId: MOCK_ACTOR_STAFF_MEMBERSHIP.id,
                establishmentId: MOCK_ACTOR_STAFF_MEMBERSHIP.establishmentId,
                type: createDto.type,
                startDate: createDto.startDate,
                endDate: createDto.endDate,
                reason: createDto.reason,
                status: TimeOffRequestStatus.PENDING,
            }));
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).toHaveBeenCalledTimes(1);
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).toHaveBeenCalledWith(
                MOCK_OTHER_ADMIN_USER_DATA.email,
                expect.objectContaining({ id: MOCK_REQUESTING_USER_ID }),
                expect.objectContaining({ id: 1 }), // id du mockCreatedRequest
                expect.objectContaining({ id: MOCK_ESTABLISHMENT_ID })
            );
            expect(result).toEqual(mockCreatedRequest.get({ plain: true }));
        });

        // ... (tests existants pour createTimeOffRequest qui passent) ...
        // Test #30 (Edge Case - Notification - User not found)
        it('should log error and not send notification if actorMembership.userId exists but user is not found', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);
            mockUserModel.findByPk.mockResolvedValue(null); // User not found
            // Establishment found
            mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT_DATA) as any);
            const adminToNotify = mockSequelizeModelInstance({ ...MOCK_OTHER_ADMIN_MEMBERSHIP_WITH_USER });
            mockMembershipModel.findAll.mockResolvedValue([adminToNotify] as any[]);


            await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Requesting user with ID ${MOCK_ACTOR_STAFF_MEMBERSHIP.userId} not found for notification.`));
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        // Test #31 (Edge Case - Notification - Establishment not found)
        it('should log error and not send notification if establishment is not found', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);
            // User found
            mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_REQUESTING_USER_DATA) as any);
            mockEstablishmentModel.findByPk.mockResolvedValue(null); // Establishment not found
            const adminToNotify = mockSequelizeModelInstance({ ...MOCK_OTHER_ADMIN_MEMBERSHIP_WITH_USER });
            mockMembershipModel.findAll.mockResolvedValue([adminToNotify] as any[]);


            await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Establishment with ID ${MOCK_ACTOR_STAFF_MEMBERSHIP.establishmentId} not found for notification.`));
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        // Test #32 (Edge Case - Notification - No active admins)
        it('should create request and not attempt notification if no active admins are found', async () => {
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);
            mockMembershipModel.findAll.mockResolvedValue([]); // No admins

            await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP);
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).not.toHaveBeenCalled();
        });

        // Test #33 (Edge Case - Notification - Admin with no email)
        it('should skip notification for admin with no email and notify others', async () => {
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);

            const adminWithNoEmailUser = mockSequelizeModelInstance({...MOCK_OTHER_ADMIN_USER_DATA, id: 103, email: null as any });
            const adminWithNoEmail = mockSequelizeModelInstance({ ...MOCK_OTHER_ADMIN_MEMBERSHIP_WITH_USER, userId: 103, user: adminWithNoEmailUser });
            const adminWithEmail = mockSequelizeModelInstance({ ...MOCK_OTHER_ADMIN_MEMBERSHIP_WITH_USER, id: 4, userId: 104, user: mockSequelizeModelInstance({...MOCK_OTHER_ADMIN_USER_DATA, id:104, email: 'valid@example.com'}) });
            mockMembershipModel.findAll.mockResolvedValue([adminWithNoEmail, adminWithEmail] as any[]);

            await timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP);
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).toHaveBeenCalledTimes(1);
            expect(mockNotificationService.sendTimeOffRequestSubmittedNotification).toHaveBeenCalledWith(
                'valid@example.com', // Only the admin with email
                expect.anything(), expect.anything(), expect.anything()
            );
        });

        // Test #34 (Adversarial - Start date in past - DTO validation)
        // This is typically tested at DTO/controller level. Here, we assume valid DTO if service is called.
        // If the DTO schema is also validated inside the service, this test becomes relevant for the service.
        // For now, let's assume the service trusts the DTO passed. If startDate refine logic exists in service:
        // it('should throw AppError if startDate is in the past (service level)', async () => { ... });

        // Test #35 (Adversarial - Overlap with REJECTED request)
        it('should create request if overlapping with a REJECTED request', async () => {
            const overlappingRejected = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 2, status: TimeOffRequestStatus.REJECTED });
            // findOne first call for PENDING/APPROVED, second for REJECTED
            mockTimeOffRequestModel.findOne.mockResolvedValueOnce(null) // No PENDING/APPROVED overlap
                .mockResolvedValueOnce(overlappingRejected as any); // Simulate some other check if it exists, or ensure it's not called for this scenario.
            // Correct logic: findOne for PENDING/APPROVED should be the only one.
            mockTimeOffRequestModel.findOne.mockReset().mockResolvedValue(null); // Simpler: No PENDING/APPROVED overlap

            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);
            mockMembershipModel.findAll.mockResolvedValue([]);

            await expect(timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP)).resolves.toBeDefined();
            expect(mockTimeOffRequestModel.create).toHaveBeenCalled();
        });

        // Test #36 (Adversarial - Overlap with CANCELLED request)
        it('should create request if overlapping with a CANCELLED_BY_MEMBER request', async () => {
            // Similar to REJECTED, findOne for PENDING/APPROVED should return null.
            mockTimeOffRequestModel.findOne.mockReset().mockResolvedValue(null);
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);
            mockMembershipModel.findAll.mockResolvedValue([]);

            await expect(timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP)).resolves.toBeDefined();
            expect(mockTimeOffRequestModel.create).toHaveBeenCalled();
        });
        it('should create request if overlapping with a CANCELLED_BY_ADMIN request', async () => {
            mockTimeOffRequestModel.findOne.mockReset().mockResolvedValue(null);
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, ...createDto, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);
            mockMembershipModel.findAll.mockResolvedValue([]);

            await expect(timeoffRequestService.createTimeOffRequest(createDto, MOCK_ACTOR_STAFF_MEMBERSHIP)).resolves.toBeDefined();
            expect(mockTimeOffRequestModel.create).toHaveBeenCalled();
        });
        it('should create a time off request without reason if not provided', async () => {
            const dtoWithoutReason: CreateTimeOffRequestDto = { ...createDto, reason: undefined };
            const mockCreatedRequest = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id:1, reason: null, ...dtoWithoutReason, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockTimeOffRequestModel.create.mockResolvedValue(mockCreatedRequest as any);
            mockMembershipModel.findAll.mockResolvedValue([]);

            await timeoffRequestService.createTimeOffRequest(dtoWithoutReason, MOCK_ACTOR_STAFF_MEMBERSHIP);
            expect(mockTimeOffRequestModel.create).toHaveBeenCalledWith(expect.objectContaining({
                reason: null,
            }));
        });
    });

    describe('getTimeOffRequestById', () => {
        // ... (tests existants pour getTimeOffRequestById qui passent) ...
        const requestId = 1;
        const mockTimeOffRequestAttrs: TimeOffRequestAttributes = {
            id: requestId, membershipId: MOCK_ACTOR_STAFF_MEMBERSHIP_ID, establishmentId: MOCK_ESTABLISHMENT_ID,
            type: PlaceholderTimeOffRequestType.SICK_LEAVE as unknown as TimeOffRequestType, startDate: '2024-11-01', endDate: '2024-11-02',
            status: TimeOffRequestStatus.APPROVED, processedByMembershipId: MOCK_ACTOR_ADMIN_MEMBERSHIP_ID, reason: null, adminNotes: null,
            cancellationReason: null, cancelledByMembershipId: null, createdAt: new Date(), updatedAt: new Date(),
        };

        it('should return the time off request with all associations if found', async () => {
            const mockTimeOffRequestInstance = mockSequelizeModelInstance(mockTimeOffRequestAttrs);
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
        // ... (tests existants pour listTimeOffRequestsForMember qui passent) ...
        const establishmentId = MOCK_ESTABLISHMENT_ID;
        const targetMembershipId = MOCK_ACTOR_STAFF_MEMBERSHIP_ID;
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

        it('should filter by status if provided', async () => {
            const queryWithStatus: ListTimeOffRequestsQueryDto = { ...defaultQueryDto, status: TimeOffRequestStatus.APPROVED };
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({
                count: [{ count: 1 }],
                rows: [mockSequelizeModelInstance(mockRequest2Attrs)] as any[] // Assurez-vous que les rows sont bien des instances mockées
            });
            await timeoffRequestService.listTimeOffRequestsForMember(establishmentId, targetMembershipId, queryWithStatus);
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { establishmentId, membershipId: targetMembershipId, status: TimeOffRequestStatus.APPROVED },
            }));
        });
    });

    // NOUVEAU BLOC DE TESTS
    describe('listTimeOffRequestsForEstablishment', () => {
        const establishmentId = MOCK_ESTABLISHMENT_ID;
        const defaultQuery: ListAllTimeOffRequestsForEstablishmentQueryDto = { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' };

        // Test #1 (Happy Path - Basic retrieval)
        it('should return paginated list of requests for an establishment without filters', async () => {
            const request1 = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1, membershipId: 1 });
            const request2 = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 2, membershipId: 2, startDate: '2024-12-10', endDate: '2024-12-12' });
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 2 }], rows: [request2, request1] as any[] }); // desc createdAt

            const result = await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, defaultQuery);

            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { establishmentId: establishmentId },
                limit: 10, offset: 0, order: [['createdAt', 'DESC']],
                include: expect.any(Array)
            }));
            expect(result.data.length).toBe(2);
            expect(result.meta.totalItems).toBe(2);
            expect(result.data[0].id).toBe(2); // Assuming request2 is newer
        });

        // Test #2 (Happy Path - Pagination - Page 2)
        it('should handle pagination correctly when page 2 is requested', async () => {
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 15 }], rows: [] as any[] }); // Simulate 15 items total
            await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, page: 2, limit: 5 });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                limit: 5, offset: 5, // (2-1)*5
            }));
        });

        // Test #3 (Happy Path - Pagination - Page beyond total)
        it('should return empty data when page is beyond total pages', async () => {
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 3 }], rows: [] as any[] });
            const result = await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, page: 99 });
            expect(result.data.length).toBe(0);
            expect(result.meta.totalItems).toBe(3);
            expect(result.meta.totalPages).toBe(1); // 3 items / 10 per page = 1 page
            expect(result.meta.currentPage).toBe(99);
        });

        // Test #5 (Happy Path - Sort by startDate asc)
        it('should sort by startDate in ascending order', async () => {
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] as any[] });
            await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, sortBy: 'startDate', sortOrder: 'asc' });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                order: [['startDate', 'ASC']],
            }));
        });

        // Test #7 (Happy Path - Filter by status)
        it('should filter by status PENDING', async () => {
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] as any[] });
            await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, status: TimeOffRequestStatus.PENDING });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { establishmentId: establishmentId, status: TimeOffRequestStatus.PENDING },
            }));
        });

        // Test #9 (Happy Path - Filter by membershipId)
        it('should filter by a specific membershipId', async () => {
            const filterMembershipId = 123;
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] as any[] });
            await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, membershipId: filterMembershipId });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { establishmentId: establishmentId, membershipId: filterMembershipId },
            }));
        });

        // Test #10 (Happy Path - Filter by dateRange)
        it('should filter by dateRangeStart and dateRangeEnd', async () => {
            const dateRangeStart = '2024-01-01';
            const dateRangeEnd = '2024-01-31';
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] as any[] });
            await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, dateRangeStart, dateRangeEnd });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    establishmentId: establishmentId,
                    startDate: { [Op.lte]: dateRangeEnd },
                    endDate: { [Op.gte]: dateRangeStart },
                },
            }));
        });

        // Test #15 (Happy Path - Combination of filters, sort, pagination)
        it('should combine status filter, membershipId filter, sorting by endDate asc, and pagination', async () => {
            const filterMembershipId = 123;
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] as any[] });
            await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, {
                page: 2,
                limit: 5,
                status: TimeOffRequestStatus.APPROVED,
                membershipId: filterMembershipId,
                sortBy: 'endDate',
                sortOrder: 'asc'
            });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    establishmentId: establishmentId,
                    status: TimeOffRequestStatus.APPROVED,
                    membershipId: filterMembershipId
                },
                limit: 5,
                offset: 5,
                order: [['endDate', 'ASC']],
            }));
        });

        // Test #17 (Happy Path - Filters applied, no results)
        it('should return empty list if filters result in no matches', async () => {
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] as any[] });
            const result = await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, status: TimeOffRequestStatus.REJECTED });
            expect(result.data.length).toBe(0);
            expect(result.meta.totalItems).toBe(0);
        });

        // Test #18 (Edge Case - limit=1)
        it('should handle pagination with limit=1', async () => {
            const request1 = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: 1 });
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 5 }], rows: [request1] as any[] });
            const result = await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, limit: 1 });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
            expect(result.data.length).toBe(1);
            expect(result.meta.itemsPerPage).toBe(1);
            expect(result.meta.totalItems).toBe(5);
        });

        // Test #20 (Edge Case - dateRangeStart === dateRangeEnd)
        it('should filter correctly when dateRangeStart equals dateRangeEnd', async () => {
            const singleDate = '2024-03-15';
            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] as any[] });
            await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, { ...defaultQuery, dateRangeStart: singleDate, dateRangeEnd: singleDate });
            expect(mockTimeOffRequestModel.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    establishmentId: establishmentId,
                    startDate: { [Op.lte]: singleDate },
                    endDate: { [Op.gte]: singleDate },
                },
            }));
        });

        // Test #23 (Edge Case - Requesting member's user is null)
        it('should include request even if requestingMember.user is null', async () => {
            const memberWithoutUser = mockSequelizeModelInstance({ id: 1, user: null }); // Simulate user deleted
            const requestWithNullUser = mockSequelizeModelInstance({
                ...defaultTimeOffRequestAttrs,
                id: 1,
                requestingMember: memberWithoutUser // This needs to be part of the include structure
            });
            // The findAndCountAll mock needs to return rows where requestingMember.user can be null.
            // The include in the service is { model: db.User, as: 'user', required: false }
            // So, the mock for dbResult.rows should reflect this.
            const rowWithNullUser = mockSequelizeModelInstance({
                ...defaultTimeOffRequestAttrs,
                id: 1,
                // Simulate the structure Sequelize would return with the include
                requestingMember: mockSequelizeModelInstance({ id: MOCK_ACTOR_STAFF_MEMBERSHIP_ID, user: null })
            });

            mockTimeOffRequestModel.findAndCountAll.mockResolvedValue({ count: [{ count: 1 }], rows: [rowWithNullUser] as any[] });
            const result = await timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, defaultQuery);
            expect(result.data.length).toBe(1);
            expect(result.data[0].id).toBe(1);
            // Ensure requestingMember is included and its user is null
            const plainData = result.data[0] as any; // Cast for easier access in test
            expect(plainData.requestingMember).toBeDefined();
            expect(plainData.requestingMember.id).toBe(MOCK_ACTOR_STAFF_MEMBERSHIP_ID);
            expect(plainData.requestingMember.user).toBeNull();
        });

        // Test #26 (Adversarial - DTO - dateRangeEnd < dateRangeStart)
        // This is primarily a Zod validation test, which occurs in the controller.
        // If service validates DTO again, this test is for the service.
        // The plan's DTO has a refine for this.
        it('should throw AppError if dateRangeEnd is before dateRangeStart (service level check if not caught by DTO)', async () => {
            // This assumes the DTO passed to the service might bypass controller Zod validation in some hypothetical scenario
            // OR that the service re-validates or has its own check.
            // The current DTO refine in the plan should make this scenario lead to a Zod error *before* service call.
            // However, the service code itself also has a check.
            await expect(timeoffRequestService.listTimeOffRequestsForEstablishment(establishmentId, {
                ...defaultQuery,
                dateRangeStart: '2024-01-10',
                dateRangeEnd: '2024-01-01'
            })).rejects.toThrow(new AppError('InvalidInput', 400, 'Date range end cannot be before date range start.'));
        });
    });

    describe('processTimeOffRequest', () => {
        const requestId = 1;
        const processDtoApprove: ProcessTimeOffRequestDto = { status: TimeOffRequestStatus.APPROVED, adminNotes: 'Approved' };

        // Test #37 (Edge Case - Notification - Requesting member's user not found or no email)
        it('should process request but log warning if requesting member user/email is not found for notification', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);

            const memberWithoutUser = mockSequelizeModelInstance({
                ...MOCK_REQUESTING_MEMBERSHIP_WITH_USER,
                user: null, // User is null
                establishment: mockSequelizeModelInstance(MOCK_ESTABLISHMENT_DATA)
            });
            mockMembershipModel.findByPk.mockResolvedValue(memberWithoutUser as any);

            await timeoffRequestService.processTimeOffRequest(requestId, processDtoApprove, MOCK_ACTOR_ADMIN_MEMBERSHIP);

            expect(requestInstance.status).toBe(TimeOffRequestStatus.APPROVED);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Requesting user or user email not found for membership ID ${MOCK_ACTOR_STAFF_MEMBERSHIP_ID}`));
            expect(mockNotificationService.sendTimeOffRequestProcessedNotification).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });

        // Test #38 (Edge Case - Notification - Establishment not found for notification)
        it('should process request but log error if establishment not found for notification', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);

            const memberWithUser = mockSequelizeModelInstance({
                ...MOCK_REQUESTING_MEMBERSHIP_WITH_USER,
                establishment: null // Establishment is null
            });
            mockMembershipModel.findByPk.mockResolvedValue(memberWithUser as any);

            await timeoffRequestService.processTimeOffRequest(requestId, processDtoApprove, MOCK_ACTOR_ADMIN_MEMBERSHIP);

            expect(requestInstance.status).toBe(TimeOffRequestStatus.APPROVED);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Requesting membership or its establishment not found for request ID ${requestId}. Cannot send processed notification.`));
            expect(mockNotificationService.sendTimeOffRequestProcessedNotification).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        // Test #39 (Adversarial - Invalid status in DTO)
        // This is a DTO validation scenario, normally caught by controller.
        // Assuming ProcessTimeOffRequestDtoSchema strictly enforces APPROVED/REJECTED.
    });

    describe('cancelTimeOffRequest', () => {
        const requestId = 1;
        const cancelDto: CancelTimeOffRequestDto = { cancellationReason: 'Changed mind' };

        // Test #41 (Edge Case - Notification - Cancelling member's actorUser not found)
        it('should cancel request but log warning if actorUser not found for member cancellation notification', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);
            mockUserModel.findByPk.mockResolvedValue(null); // Actor user not found

            const requestingMembership = mockSequelizeModelInstance({ ...MOCK_REQUESTING_MEMBERSHIP_WITH_USER });
            mockMembershipModel.findByPk.mockResolvedValue(requestingMembership as any);
            mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT_DATA) as any);
            mockMembershipModel.findAll.mockResolvedValue([]); // No admins to notify, or doesn't reach that point

            await timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_STAFF_MEMBERSHIP);

            expect(requestInstance.status).toBe(TimeOffRequestStatus.CANCELLED_BY_MEMBER);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Actor user (ID: ${MOCK_ACTOR_STAFF_MEMBERSHIP.userId}) not found for cancellation notification logic.`));
            expect(mockNotificationService.sendTimeOffRequestCancelledByMemberNotification).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });

        // Test #42 (Edge Case - Notification - Requesting member's user/email not found for admin cancellation)
        it('should cancel request but log warning if requesting member user/email not found for admin cancellation notification', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.APPROVED });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);

            const memberWithoutUser = mockSequelizeModelInstance({ ...MOCK_REQUESTING_MEMBERSHIP_WITH_USER, user: null });
            mockMembershipModel.findByPk.mockResolvedValue(memberWithoutUser as any); // Requesting member's user is null
            mockEstablishmentModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_ESTABLISHMENT_DATA) as any);
            mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_PROCESSING_ADMIN_USER_DATA) as any); // Actor admin user found


            await timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_ADMIN_MEMBERSHIP);

            expect(requestInstance.status).toBe(TimeOffRequestStatus.CANCELLED_BY_ADMIN);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Requesting user/email not found for cancellation notification (request ID ${requestId}).`));
            expect(mockNotificationService.sendTimeOffRequestCancelledByAdminNotification).not.toHaveBeenCalled();
            consoleWarnSpy.mockRestore();
        });

        // Test #43 (Edge Case - Notification - Establishment not found for member cancellation)
        it('should cancel request and log error if establishment not found for member cancellation notification', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.PENDING });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);
            mockEstablishmentModel.findByPk.mockResolvedValue(null); // Establishment not found

            const requestingMembership = mockSequelizeModelInstance({ ...MOCK_REQUESTING_MEMBERSHIP_WITH_USER });
            mockMembershipModel.findByPk.mockResolvedValue(requestingMembership as any);
            mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance(MOCK_REQUESTING_USER_DATA) as any); // Actor user (member)


            await timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_STAFF_MEMBERSHIP);

            expect(requestInstance.status).toBe(TimeOffRequestStatus.CANCELLED_BY_MEMBER);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Establishment ID ${requestInstance.establishmentId} not found for cancellation notification`));
            expect(mockNotificationService.sendTimeOffRequestCancelledByMemberNotification).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        // Test #46 (Adversarial - Member cancels already CANCELLED_BY_MEMBER request)
        it('should throw error if member tries to cancel their own already CANCELLED_BY_MEMBER request', async () => {
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.CANCELLED_BY_MEMBER });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_STAFF_MEMBERSHIP))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });

        // Test #47 (Adversarial - Member cancels already CANCELLED_BY_ADMIN request)
        it('should throw error if member tries to cancel a request already CANCELLED_BY_ADMIN', async () => {
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.CANCELLED_BY_ADMIN });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_STAFF_MEMBERSHIP))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });

        // Test #48 (Adversarial - Member cancels REJECTED request)
        it('should throw error if member tries to cancel a REJECTED request', async () => {
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.REJECTED });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_STAFF_MEMBERSHIP))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });

        // Test #49 (Adversarial - Admin cancels already CANCELLED_BY_MEMBER request)
        it('should throw error if admin tries to cancel a request already CANCELLED_BY_MEMBER', async () => {
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.CANCELLED_BY_MEMBER });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_ADMIN_MEMBERSHIP))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });

        // Test #50 (Adversarial - Admin cancels already CANCELLED_BY_ADMIN request)
        it('should throw error if admin tries to cancel their own already CANCELLED_BY_ADMIN request', async () => {
            const requestInstance = mockSequelizeModelInstance({ ...defaultTimeOffRequestAttrs, id: requestId, status: TimeOffRequestStatus.CANCELLED_BY_ADMIN });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);
            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, MOCK_ACTOR_ADMIN_MEMBERSHIP))
                .rejects.toThrow(TimeOffRequestInvalidActionError);
        });
        // Test #51 (Adversarial - Admin from another establishment tries to cancel)
        it('should throw error if admin from another establishment tries to cancel a request', async () => {
            const requestInstance = mockSequelizeModelInstance({
                ...defaultTimeOffRequestAttrs,
                id: requestId,
                status: TimeOffRequestStatus.PENDING,
                establishmentId: MOCK_ESTABLISHMENT_ID // Request belongs to MOCK_ESTABLISHMENT_ID
            });
            mockTimeOffRequestModel.findByPk.mockResolvedValue(requestInstance as any);

            const adminFromAnotherEstablishment: MembershipAttributes = {
                ...MOCK_ACTOR_ADMIN_MEMBERSHIP,
                establishmentId: MOCK_ESTABLISHMENT_ID + 1 // Different establishment
            };

            await expect(timeoffRequestService.cancelTimeOffRequest(requestId, cancelDto, adminFromAnotherEstablishment))
                .rejects.toThrow(TimeOffRequestInvalidActionError); // Or AppError('Forbidden') depending on exact logic path
        });
    });
});