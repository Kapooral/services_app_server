// tests/services/staff-availability.unit.test.ts

// --- Imports de Modules et de Dépendances ---
import { Op, Transaction, Model, Optional } from 'sequelize';
import { OverlapDetectionService, AvailabilityCandidate, ConflictCheckResult } from "../../src/services/overlap-detection.service"
import { StaffAvailabilityService } from '../../src/services/staff-availability.service';

// Importer les types des modèles réels pour le typage des mocks et des données
import StaffAvailabilityReal, { StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes, PotentialConflictDetailItem } from '../../src/models/StaffAvailability';
import MembershipReal, { MembershipAttributes, MembershipRole, MembershipStatus } from '../../src/models/Membership';
import EstablishmentReal, { EstablishmentAttributes } from '../../src/models/Establishment';
import User, { UserAttributes } from '../../src/models/User';

import {
    CreateStaffAvailabilityDto,
    UpdateStaffAvailabilityDto,
    ListStaffAvailabilitiesQueryDto as ZodListStaffAvailabilitiesQueryDto,
} from '../../src/dtos/staff-availability.validation';

// Erreurs personnalisées
import { AppError } from '../../src/errors/app.errors';
import { StaffAvailabilityNotFoundError, StaffAvailabilityCreationError, StaffAvailabilityUpdateError, StaffAvailabilityConflictError } from '../../src/errors/planning.errors';
import { MembershipNotFoundError } from '../../src/errors/membership.errors';

// Utilitaires
import moment from 'moment-timezone';
import { RRule } from 'rrule';

// --- Mocks de Jest pour les Modèles Sequelize et db ---

// Type pour un constructeur de modèle Sequelize mocké avec des méthodes statiques
type MockedModelCtor<TInstance extends Model, TAttributes, TCreationAttributes = any> =
    jest.Mocked<typeof Model> & { // Propriétés de base d'un mock Jest
    new(values?: TCreationAttributes, options?: any): TInstance; // Constructeur
    // Méthodes statiques mockées
    findByPk: jest.Mock<Promise<TInstance | null>, [pk?: any, options?: any]>;
    findOne: jest.Mock<Promise<TInstance | null>, [options?: any]>;
    findAll: jest.Mock<Promise<TInstance[]>, [options?: any]>;
    findAndCountAll: jest.Mock<Promise<{ rows: TInstance[]; count: any; }>, [options?: any]>;
    create: jest.Mock<Promise<TInstance>, [values?: TCreationAttributes, options?: any]>;
    update: jest.Mock<Promise<[number, TInstance[]]>, [values: Partial<TAttributes>, options: any]>;
    destroy: jest.Mock<Promise<number>, [options?: any]>;
};

// Mock du OverlapDetectionService
jest.mock('../../src/services/overlap-detection.service');

// Mock du module src/models
// Cette exécution est "hoistée" par Jest au sommet du fichier.
jest.mock('../../src/models', () => {
    const actualSequelize = jest.requireActual('sequelize');
    const originalModelsModule = jest.requireActual('../../src/models'); // Pour les Enums

    // Helper pour créer des mocks de modèles statiques
    const createMockModelStatic = <TInst extends Model, TAttr, TCreatAttr = any>(): MockedModelCtor<TInst, TAttr, TCreatAttr> => {
        const MockedModel = jest.fn() as unknown as MockedModelCtor<TInst, TAttr, TCreatAttr>;
        // Assignation des méthodes statiques mockées
        MockedModel.findByPk = jest.fn();
        MockedModel.findOne = jest.fn();
        MockedModel.findAll = jest.fn();
        MockedModel.findAndCountAll = jest.fn();
        MockedModel.create = jest.fn();
        MockedModel.update = jest.fn();
        MockedModel.destroy = jest.fn();
        // Simuler le prototype pour que les instances aient Model.prototype
        MockedModel.prototype = Object.create(Model.prototype);
        return MockedModel;
    };

    // Création des constructeurs de modèles mockés
    const MockStaffAvailability = createMockModelStatic<StaffAvailabilityReal, StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes>();
    const MockMembership = createMockModelStatic<MembershipReal, MembershipAttributes, Optional<MembershipAttributes, 'id'>>();
    const MockEstablishment = createMockModelStatic<EstablishmentReal, EstablishmentAttributes, Optional<EstablishmentAttributes, 'id'>>();
    const MockUser = createMockModelStatic<User, UserAttributes, Optional<UserAttributes, 'id'>>();

    // Retourner la structure mockée pour l'import de 'src/models'
    return {
        __esModule: true,
        default: { // `import db from '../models'` recevra ceci
            sequelize: {
                transaction: jest.fn().mockImplementation(async (arg1?: any) => {
                    const mockTransactionObject = {
                        commit: jest.fn().mockResolvedValue(undefined),
                        rollback: jest.fn().mockResolvedValue(undefined),
                        afterCommit: jest.fn().mockImplementation(callback => Promise.resolve().then(() => callback(mockTransactionObject))),
                    };
                    if (typeof arg1 === 'function') {
                        try {
                            const result = await arg1(mockTransactionObject);
                            await mockTransactionObject.commit();
                            return result;
                        } catch (error) {
                            await mockTransactionObject.rollback();
                            throw error;
                        }
                    }
                    return Promise.resolve(mockTransactionObject);
                }),
                Op: actualSequelize.Op,
            },
            // Assigner les constructeurs mockés
            StaffAvailability: MockStaffAvailability,
            Membership: MockMembership,
            Establishment: MockEstablishment,
            User: MockUser,
            MembershipRole: originalModelsModule.MembershipRole,
            MembershipStatus: originalModelsModule.MembershipStatus,
        },
        // Exporter aussi directement les constructeurs mockés et enums si besoin
        StaffAvailability: MockStaffAvailability,
        Membership: MockMembership,
        Establishment: MockEstablishment,
        User: MockUser,
        MembershipRole: originalModelsModule.MembershipRole,
        MembershipStatus: originalModelsModule.MembershipStatus,
    };
});

// --- APRÈS le jest.mock, importer db et les types ---
// `db` ici sera la version mockée définie ci-dessus.
import db from '../../src/models';

// Les variables pour les modèles mockés peuvent être déclarées ici pour un typage plus fort
// et pour référencer directement les mocks si on le souhaite, bien que `db.ModelName` soit suffisant.
// Par exemple :
// const StaffAvailabilityMock = db.StaffAvailability as MockedModelCtor<StaffAvailabilityReal, StaffAvailabilityAttributes, StaffAvailabilityCreationAttributes>;

// --- Constantes Globales de Test ---
const MOCK_ESTABLISHMENT_ID = 1;
const MOCK_OTHER_ESTABLISHMENT_ID = 2;
const MOCK_ADMIN_USER_ID = 1;
const MOCK_ADMIN_MEMBERSHIP_ID = 101;
const MOCK_STAFF_USER_ID_1 = 2;
const MOCK_TARGET_MEMBERSHIP_ID = 201;
const MOCK_DEFAULT_TIMEZONE = 'Europe/Paris';
const MOCK_STAFF_AVAILABILITY_ID_1 = 301;
const MOCK_STAFF_AVAILABILITY_ID_2 = 302;

// --- Instances de Données Mockées ---
const mockAdminMembershipAttributes: MembershipAttributes = { id: MOCK_ADMIN_MEMBERSHIP_ID, userId: MOCK_ADMIN_USER_ID, establishmentId: MOCK_ESTABLISHMENT_ID, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE, invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date('2023-01-01T00:00:00Z'), createdAt: new Date('2023-01-01T00:00:00Z'), updatedAt: new Date('2023-01-01T00:00:00Z')};
const mockTargetMembershipAttributes: MembershipAttributes = { id: MOCK_TARGET_MEMBERSHIP_ID, userId: MOCK_STAFF_USER_ID_1, establishmentId: MOCK_ESTABLISHMENT_ID, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date('2023-01-01T00:00:00Z'), createdAt: new Date('2023-01-01T00:00:00Z'), updatedAt: new Date('2023-01-01T00:00:00Z') };
const mockEstablishmentAttributes: EstablishmentAttributes = { id: MOCK_ESTABLISHMENT_ID, name: 'Test Establishment', timezone: MOCK_DEFAULT_TIMEZONE, address_line1: '123 Main St', city: 'Testville', postal_code: '12345', country_name: 'Testland', country_code: 'TS', siret: '12345678901234', siren: '123456789', owner_id: MOCK_ADMIN_USER_ID, is_validated: true, createdAt: new Date(), updatedAt: new Date() };

// --- Fonctions Helper de Test ---
const mockSequelizeModelInstance = <
    TAttr extends object,
    TCreationAttr extends object = Partial<TAttr>
    >(
    data: TAttr,
    modelMethods?: Partial<jest.Mocked<Model<TAttr, TCreationAttr>>>
): jest.Mocked<Model<TAttr, TCreationAttr> & TAttr> => {
    const instanceData = { ...data };
    type DefaultInstanceMethods = {
        get: jest.Mock<any, [keyOrOptions?: string | { plain?: boolean; }]>;
        set: jest.Mock<any, [keyOrObject: any, value?: any]>;
        save: jest.Mock<Promise<any>, []>;
        update: jest.Mock<Promise<any>, [values: Partial<TAttr>]>;
        destroy: jest.Mock<Promise<void>, []>;
        toJSON: jest.Mock<TAttr, []>;
    };
    const defaultMethods: DefaultInstanceMethods = {
        get: jest.fn((keyOrOptions?: string | { plain?: boolean; }) => {
            if (typeof keyOrOptions === 'string') {
                return (instanceData as any)[keyOrOptions];
            }
            if (keyOrOptions?.plain) {
                const plainObject: any = {};
                for (const key in instanceData) {
                    if (Object.prototype.hasOwnProperty.call(instanceData, key)) {
                        if (typeof (instanceData as any)[key] !== 'function' || !((instanceData as any)[key] as any)._isMockFunction) {
                            plainObject[key] = (instanceData as any)[key];
                        }
                    }
                }
                return plainObject;
            }
            return instance;
        }),
        set: jest.fn((keyOrObject: any, value?: any) => {
            const dataToUpdate = typeof keyOrObject === 'string' ? { [keyOrObject]: value } : keyOrObject;
            Object.assign(instanceData, dataToUpdate);
            Object.assign(instance, instanceData);
            return instance;
        }),
        save: jest.fn(async () => {
            Object.assign(instance, instanceData);
            return Promise.resolve(instance);
        }),
        update: jest.fn(async (values: Partial<TAttr>) => {
            (instance as any).set(values);
            return (instance as any).save();
        }),
        destroy: jest.fn(async () => Promise.resolve()),
        toJSON: jest.fn(() => ({ ...instanceData })),
    };
    const instance = {
        ...instanceData,
        ...(defaultMethods as any),
        ...(modelMethods as any),
    } as jest.Mocked<Model<TAttr, TCreationAttr> & TAttr>;
    return instance;
};

const baseCreateDto: CreateStaffAvailabilityDto = { rruleString: `DTSTART=20240701T090000;FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=5`, durationMinutes: 240, isWorking: true, effectiveStartDate: '2024-07-01', description: 'Standard working hours' };
const baseUpdateDto: UpdateStaffAvailabilityDto = { description: 'Updated standard working hours' };


describe('StaffAvailabilityService', () => {
    let staffAvailabilityService: StaffAvailabilityService;
    let mockOverlapDetectionService: jest.Mocked<OverlapDetectionService>;

    beforeEach(() => {
        // Réinitialisation des mocks des méthodes statiques des modèles Sequelize
        (db.StaffAvailability.findByPk as jest.Mock).mockClear();
        (db.StaffAvailability.findOne as jest.Mock).mockClear();
        (db.StaffAvailability.findAll as jest.Mock).mockClear();
        (db.StaffAvailability.findAndCountAll as jest.Mock).mockClear();
        (db.StaffAvailability.create as jest.Mock).mockClear();
        (db.StaffAvailability.update as jest.Mock).mockClear();
        (db.StaffAvailability.destroy as jest.Mock).mockClear();

        (db.Membership.findByPk as jest.Mock).mockClear();
        (db.Membership.findOne as jest.Mock).mockClear();

        (db.Establishment.findByPk as jest.Mock).mockClear();
        (db.Establishment.findOne as jest.Mock).mockClear();

        (db.User.findByPk as jest.Mock)?.mockClear();
        (db.User.findOne as jest.Mock)?.mockClear();

        // Réinitialiser le mock de la fonction de transaction de Sequelize
        const transactionMock = db.sequelize.transaction as jest.Mock;
        transactionMock.mockClear();
        transactionMock.mockImplementation(async (arg1?: any) => { // Ré-établir l'implémentation
            const mockTransactionObject = {
                commit: jest.fn().mockResolvedValue(undefined),
                rollback: jest.fn().mockResolvedValue(undefined),
                afterCommit: jest.fn().mockImplementation(callback => Promise.resolve().then(() => callback(mockTransactionObject))),
            };
            if (typeof arg1 === 'function') {
                try {
                    const result = await arg1(mockTransactionObject);
                    await mockTransactionObject.commit();
                    return result;
                } catch (error) {
                    await mockTransactionObject.rollback();
                    throw error;
                }
            }
            return Promise.resolve(mockTransactionObject);
        });

        // Ceci est une configuration PAR DÉFAUT. Les tests spécifiques peuvent la surcharger si besoin.
        const mockValidEstablishmentWithTimezone = mockSequelizeModelInstance<EstablishmentAttributes>({
            ...mockEstablishmentAttributes, // Utiliser les données globales définies dans le Bloc 1
            id: MOCK_ESTABLISHMENT_ID,       // S'assurer que c'est l'ID attendu
            timezone: MOCK_DEFAULT_TIMEZONE, // S'assurer que timezone est présente et valide
        });
        (db.Establishment.findByPk as jest.Mock).mockResolvedValue(mockValidEstablishmentWithTimezone);


        // Instanciation du mock de OverlapDetectionService
        // `OverlapDetectionService` est maintenant le constructeur mocké grâce à jest.mock()
        // Ses méthodes (comme checkForConflicts) seront automatiquement des jest.fn().
        mockOverlapDetectionService = new (OverlapDetectionService as jest.MockedClass<typeof OverlapDetectionService>)(
            db.StaffAvailability as any,
            db.TimeOffRequest as any, // Assurez-vous que TimeOffRequest est mocké dans jest.mock('../../src/models') si utilisé
            db.Establishment as any
        ) as jest.Mocked<OverlapDetectionService>;

        // Configuration par défaut pour checkForConflicts (pas de conflit)
        // Ceci est maintenant possible car checkForConflicts sur l'instance mockée est un jest.fn().
        (mockOverlapDetectionService.checkForConflicts as jest.Mock).mockResolvedValue({
            hasBlockingConflict: false,
            blockingConflictError: undefined,
            potentialConflictDetails: null,
        });

        // Instancier le service à tester avec ses dépendances (y compris le service mocké)
        staffAvailabilityService = new StaffAvailabilityService(
            mockOverlapDetectionService, // Injection du service mocké
            db.StaffAvailability as any,
            db.Membership as any,
            db.Establishment as any
        );
    });

    // --- Tests pour createStaffAvailability ---
    describe('createStaffAvailability', () => {
        let mockCreateDto: CreateStaffAvailabilityDto;
        let mockActorAdminMembership: MembershipAttributes;
        let mockTargetMembershipInstance: jest.Mocked<MembershipReal & MembershipAttributes>; // Préciser le type
        let mockCreatedStaffAvailabilityInstance: jest.Mocked<StaffAvailabilityReal & StaffAvailabilityAttributes>; // Préciser le type
        const mockConflictCheck = (
            hasBlocking: boolean,
            blockingError?: StaffAvailabilityConflictError,
            potentialDetails?: PotentialConflictDetailItem[] | null // Doit être un tableau
        ) => {
            (mockOverlapDetectionService.checkForConflicts as jest.Mock).mockResolvedValue({
                hasBlockingConflict: hasBlocking,
                blockingConflictError: blockingError,
                potentialConflictDetails: potentialDetails,
            });
        };


        beforeEach(() => {
            mockActorAdminMembership = { ...mockAdminMembershipAttributes };
            // Simuler une instance de Membership retournée par findOne
            mockTargetMembershipInstance = mockSequelizeModelInstance<MembershipAttributes>(
                { ...mockTargetMembershipAttributes }
            ) as jest.Mocked<MembershipReal & MembershipAttributes>; // Cast pour correspondre aux attentes

            mockCreateDto = { // Utiliser une copie pour chaque test pour éviter les mutations
                rruleString: 'FREQ=DAILY;DTSTART=20240701T090000;COUNT=1',
                durationMinutes: 120,
                isWorking: true,
                effectiveStartDate: '2024-07-01',
                description: 'Default Test Availability', // Inclure la description par défaut
                effectiveEndDate: '2024-07-01',     // Inclure effectiveEndDate par défaut
            };

            const createdData: StaffAvailabilityAttributes = {
                id: MOCK_STAFF_AVAILABILITY_ID_1,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                rruleString: mockCreateDto.rruleString,
                durationMinutes: mockCreateDto.durationMinutes,
                isWorking: mockCreateDto.isWorking,
                effectiveStartDate: mockCreateDto.effectiveStartDate,
                effectiveEndDate: mockCreateDto.effectiveEndDate ?? null,
                description: mockCreateDto.description ?? null,
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: mockActorAdminMembership.id,
                computed_min_start_utc: new Date('2024-07-01T09:00:00Z'),
                computed_max_end_utc: mockCreateDto.effectiveEndDate
                    ? new Date(moment.tz(mockCreateDto.effectiveEndDate, 'YYYY-MM-DD', MOCK_DEFAULT_TIMEZONE).endOf('day').utc().format())
                    : null,
                potential_conflict_details: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockCreatedStaffAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(
                createdData
            ) as jest.Mocked<StaffAvailabilityReal & StaffAvailabilityAttributes>;

            (db.Membership.findOne as jest.Mock).mockResolvedValue(mockTargetMembershipInstance);
            (db.StaffAvailability.create as jest.Mock).mockResolvedValue(mockCreatedStaffAvailabilityInstance);
            (db.StaffAvailability.findAll as jest.Mock).mockResolvedValue([]);
            mockConflictCheck(false, undefined, null);
        });

        // --- Functional / "Happy Path" ---
        it('Func - Création Réussie Standard: dto avec tous les champs obligatoires et optionnels valides', async () => {
            const specificDto: CreateStaffAvailabilityDto = {
                ...mockCreateDto,
                description: 'Detailed description',
                effectiveEndDate: '2024-07-01',
            };
            const expectedDataForCreateCall: StaffAvailabilityCreationAttributes = {
                rruleString: specificDto.rruleString,
                durationMinutes: specificDto.durationMinutes,
                isWorking: specificDto.isWorking,
                effectiveStartDate: specificDto.effectiveStartDate,
                effectiveEndDate: specificDto.effectiveEndDate,
                description: specificDto.description,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                createdByMembershipId: mockActorAdminMembership.id,
                appliedShiftTemplateRuleId: null,
                potential_conflict_details: null,
                computed_min_start_utc: expect.any(Date),
                computed_max_end_utc: expect.anything(),
            };
            const createdInstanceDataForResult: StaffAvailabilityAttributes = {
                id: MOCK_STAFF_AVAILABILITY_ID_1,
                rruleString: specificDto.rruleString,
                durationMinutes: specificDto.durationMinutes,
                isWorking: specificDto.isWorking,
                effectiveStartDate: specificDto.effectiveStartDate,
                effectiveEndDate: specificDto.effectiveEndDate ?? null,
                description: specificDto.description ?? null,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                createdByMembershipId: mockActorAdminMembership.id,
                appliedShiftTemplateRuleId: null,
                potential_conflict_details: null,
                computed_min_start_utc: new Date(specificDto.effectiveStartDate + 'T09:00:00Z'),
                computed_max_end_utc: specificDto.effectiveEndDate ? new Date(specificDto.effectiveEndDate + 'T23:59:59Z') : null,
                createdAt: expect.any(Date) as Date,
                updatedAt: expect.any(Date) as Date,
            };

            (db.StaffAvailability.create as jest.Mock).mockResolvedValue(
                mockSequelizeModelInstance<StaffAvailabilityAttributes>(createdInstanceDataForResult)
            );
            mockConflictCheck(false, undefined, null); // Assurer pas de conflit

            const result = await staffAvailabilityService.createStaffAvailability(
                specificDto,
                mockActorAdminMembership,
                MOCK_TARGET_MEMBERSHIP_ID
            );

            expect(db.StaffAvailability.create).toHaveBeenCalledWith(expectedDataForCreateCall);
            expect(result).toEqual(createdInstanceDataForResult);
        });

        it('Func - Création sans description et effectiveEndDate', async () => {
            const dtoWithoutOptionals: CreateStaffAvailabilityDto = {
                rruleString: 'FREQ=DAILY;DTSTART=20240801T100000;COUNT=1',
                durationMinutes: 60,
                isWorking: true,
                effectiveStartDate: '2024-08-01',
                // description et effectiveEndDate sont omis
            };
            const expectedCreatePayload = {
                rruleString: dtoWithoutOptionals.rruleString,
                durationMinutes: dtoWithoutOptionals.durationMinutes,
                isWorking: dtoWithoutOptionals.isWorking,
                effectiveStartDate: dtoWithoutOptionals.effectiveStartDate,
                effectiveEndDate: null, // Le service met null si undefined
                description: null,      // Le service met null si undefined
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                createdByMembershipId: mockActorAdminMembership.id,
                appliedShiftTemplateRuleId: null,
                potential_conflict_details: null,
                computed_min_start_utc: expect.any(Date),
                computed_max_end_utc: expect.anything(), // Peut être Date ou null
            };
            // L'instance retournée doit avoir les valeurs calculées
            const createdInstanceData: StaffAvailabilityAttributes = {
                id: MOCK_STAFF_AVAILABILITY_ID_2,
                rruleString: dtoWithoutOptionals.rruleString,
                durationMinutes: dtoWithoutOptionals.durationMinutes,
                isWorking: dtoWithoutOptionals.isWorking,
                effectiveStartDate: dtoWithoutOptionals.effectiveStartDate,
                effectiveEndDate: null,
                description: null,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                createdByMembershipId: mockActorAdminMembership.id,
                appliedShiftTemplateRuleId: null,
                potential_conflict_details: null,
                computed_min_start_utc: moment.tz('2024-08-01T10:00:00', 'YYYY-MM-DDTHH:mm:ss', MOCK_DEFAULT_TIMEZONE).utc().toDate(),
                computed_max_end_utc: moment.tz('2024-08-01T10:00:00', 'YYYY-MM-DDTHH:mm:ss', MOCK_DEFAULT_TIMEZONE).add(60, 'minutes').utc().toDate(),
                createdAt: expect.any(Date) as Date,
                updatedAt: expect.any(Date) as Date,
            };
            (db.StaffAvailability.create as jest.Mock).mockResolvedValue(
                mockSequelizeModelInstance<StaffAvailabilityAttributes>(createdInstanceData)
            );
            mockConflictCheck(false, undefined, null);

            const result = await staffAvailabilityService.createStaffAvailability(
                dtoWithoutOptionals,
                mockActorAdminMembership,
                MOCK_TARGET_MEMBERSHIP_ID
            );

            expect(db.StaffAvailability.create).toHaveBeenCalledWith(expectedCreatePayload);
            expect(result.description).toBeNull();
            expect(result.effectiveEndDate).toBeNull();
            expect(result.potential_conflict_details).toBeNull();
            expect(result.computed_min_start_utc).toEqual(createdInstanceData.computed_min_start_utc);
            expect(result.computed_max_end_utc).toEqual(createdInstanceData.computed_max_end_utc);
        });

        it('Func - Création avec isWorking = false', async () => {
            const dtoIsWorkingFalse: CreateStaffAvailabilityDto = { ...mockCreateDto, isWorking: false };
            (db.StaffAvailability.create as jest.Mock).mockImplementationOnce(async (data) => {
                return mockSequelizeModelInstance<StaffAvailabilityAttributes>({id:125, ...data, createdAt:new Date(), updatedAt:new Date()});
            });


            await staffAvailabilityService.createStaffAvailability(
                dtoIsWorkingFalse,
                mockActorAdminMembership,
                MOCK_TARGET_MEMBERSHIP_ID
            );

            expect(db.StaffAvailability.create).toHaveBeenCalledWith(
                expect.objectContaining({ isWorking: false, appliedShiftTemplateRuleId: null })
            );
        });

        it('Func - Création avec effectiveEndDate identique à effectiveStartDate', async () => {
            const dtoSameDates: CreateStaffAvailabilityDto = {
                ...mockCreateDto,
                effectiveStartDate: '2024-09-01',
                effectiveEndDate: '2024-09-01',
            };
            // Le mock de create par défaut devrait fonctionner
            await expect(staffAvailabilityService.createStaffAvailability(
                dtoSameDates, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID
            )).resolves.toBeDefined();
        });

        it('Func - rruleString complexe mais valide (ex: avec UNTIL)', async () => {
            const dtoComplexRRule: CreateStaffAvailabilityDto = {
                ...mockCreateDto,
                rruleString: `DTSTART=20241001T090000;FREQ=WEEKLY;BYDAY=MO,TU;UNTIL=20241015T235959Z`,
            };
            await expect(staffAvailabilityService.createStaffAvailability(
                dtoComplexRRule, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID
            )).resolves.toBeDefined();
        });

        // --- Edge Cases ---
        it('Edge - rruleString pour un événement unique (COUNT=1)', async () => {
            // Le mockCreateDto par défaut est déjà un COUNT=1
            await expect(staffAvailabilityService.createStaffAvailability(
                mockCreateDto, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID
            )).resolves.toBeDefined();
        });

        it('Edge - durationMinutes à la valeur 1', async () => {
            const dtoMinDuration: CreateStaffAvailabilityDto = { ...mockCreateDto, durationMinutes: 1 };
            await expect(staffAvailabilityService.createStaffAvailability(
                dtoMinDuration, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID
            )).resolves.toBeDefined();
        });

        it('Edge - description à la longueur maximale (255 chars)', async () => {
            const dtoMaxDesc: CreateStaffAvailabilityDto = { ...mockCreateDto, description: 'a'.repeat(255) };
            await expect(staffAvailabilityService.createStaffAvailability(
                dtoMaxDesc, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID
            )).resolves.toBeDefined();
        });

        // [CHEV] Tests de Conflit - S'attendent à une erreur si la logique de chevauchement est implémentée
        // Pour l'instant, on suppose que la logique de détection de chevauchement est absente
        // ou on la simule en faisant échouer le test si une erreur de conflit N'EST PAS levée.
        // Pour rendre cela testable, il faudrait que le service fasse un appel (ex: findAll) pour les règles existantes.
        const setupConflictingRuleTest = (existingRulePartialAttrs: Partial<StaffAvailabilityAttributes>) => {
            const fullExistingRuleData: StaffAvailabilityAttributes = {
                id: MOCK_STAFF_AVAILABILITY_ID_2,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                rruleString: 'DTSTART=20240701T100000;FREQ=DAILY;COUNT=1',
                durationMinutes: 60,
                isWorking: true,
                effectiveStartDate: '2024-07-01',
                effectiveEndDate: '2024-07-01',
                description: 'Existing rule for conflict test',
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                computed_min_start_utc: new Date('2024-07-01T10:00:00Z'),
                computed_max_end_utc: new Date('2024-07-01T11:00:00Z'),
                potential_conflict_details: null,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
                ...existingRulePartialAttrs,
            };
            (db.StaffAvailability.findAll as jest.Mock).mockResolvedValue([
                mockSequelizeModelInstance<StaffAvailabilityAttributes>(fullExistingRuleData)
            ]);
        };

        // [CHEV] Tests de chevauchement pour Edge Cases (s'attendent à réussir car pas de conflit)
        it('[CHEV] Edge - Création se terminant EXACTEMENT quand une autre commence (Pas de Chevauchement)', async () => {
            mockConflictCheck(false, undefined, null); // Simuler aucun conflit
            const newRuleDto: CreateStaffAvailabilityDto = {
                rruleString: `DTSTART=20240701T090000;FREQ=DAILY;COUNT=1`, durationMinutes: 60,
                effectiveStartDate: '2024-07-01', effectiveEndDate: '2024-07-01', isWorking: true,
                description: 'Ends just before other'
            };

            const createdData: StaffAvailabilityAttributes = {
                id: 1234, // Un ID de test unique
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                rruleString: newRuleDto.rruleString,
                durationMinutes: newRuleDto.durationMinutes,
                isWorking: newRuleDto.isWorking,
                effectiveStartDate: newRuleDto.effectiveStartDate,
                effectiveEndDate: newRuleDto.effectiveEndDate ?? null,
                description: newRuleDto.description ?? null,
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: mockActorAdminMembership.id,
                potential_conflict_details: null,
                computed_min_start_utc: moment.tz(newRuleDto.effectiveStartDate + 'T09:00:00', 'YYYY-MM-DDTHH:mm:ss', MOCK_DEFAULT_TIMEZONE).utc().toDate(), // Exemple basé sur rruleString
                computed_max_end_utc: moment.tz(newRuleDto.effectiveStartDate + 'T09:00:00', 'YYYY-MM-DDTHH:mm:ss', MOCK_DEFAULT_TIMEZONE).add(newRuleDto.durationMinutes, 'minutes').utc().toDate(), // Exemple
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            (db.StaffAvailability.create as jest.Mock).mockResolvedValue(mockSequelizeModelInstance<StaffAvailabilityAttributes>(createdData));

            const result = await staffAvailabilityService.createStaffAvailability(newRuleDto, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID);

            expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalled();
            expect(db.StaffAvailability.create).toHaveBeenCalled();
            expect(result).toEqual(expect.objectContaining({
                potential_conflict_details: null,
                computed_min_start_utc: createdData.computed_min_start_utc,
                computed_max_end_utc: createdData.computed_max_end_utc,
            }));
        });

        it('[CHEV] Edge - Création commençant EXACTEMENT quand une autre se termine (Pas de Chevauchement)', async () => {
            mockConflictCheck(false, undefined, null); // Simuler aucun conflit
            const newRuleDto: CreateStaffAvailabilityDto = {
                rruleString: `DTSTART=20240701T100000;FREQ=DAILY;COUNT=1`, durationMinutes: 60,
                effectiveStartDate: '2024-07-01', effectiveEndDate: '2024-07-01', isWorking: true,
                description: 'Starts just after other'
            };

            const createdData: StaffAvailabilityAttributes = {
                id: 1235, // Un ID de test unique
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                rruleString: newRuleDto.rruleString,
                durationMinutes: newRuleDto.durationMinutes,
                isWorking: newRuleDto.isWorking,
                effectiveStartDate: newRuleDto.effectiveStartDate,
                effectiveEndDate: newRuleDto.effectiveEndDate ?? null,
                description: newRuleDto.description ?? null,
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: mockActorAdminMembership.id,
                potential_conflict_details: null,
                computed_min_start_utc: moment.tz(newRuleDto.effectiveStartDate + 'T10:00:00', 'YYYY-MM-DDTHH:mm:ss', MOCK_DEFAULT_TIMEZONE).utc().toDate(), // Exemple basé sur rruleString
                computed_max_end_utc: moment.tz(newRuleDto.effectiveStartDate + 'T10:00:00', 'YYYY-MM-DDTHH:mm:ss', MOCK_DEFAULT_TIMEZONE).add(newRuleDto.durationMinutes, 'minutes').utc().toDate(), // Exemple
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            (db.StaffAvailability.create as jest.Mock).mockResolvedValue(mockSequelizeModelInstance<StaffAvailabilityAttributes>(createdData));

            const result = await staffAvailabilityService.createStaffAvailability(newRuleDto, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID);

            expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalled();
            expect(db.StaffAvailability.create).toHaveBeenCalled();
            expect(result).toEqual(expect.objectContaining({
                potential_conflict_details: null,
                computed_min_start_utc: createdData.computed_min_start_utc,
                computed_max_end_utc: createdData.computed_max_end_utc,
            }));
        });


        // --- Adversarial / Error Handling / "Sad Path" ---
        const testBlockingConflictScenario = async (scenarioName: string, conflictingDto: CreateStaffAvailabilityDto) => {
            it(`[CHEV] Adv - Conflit Bloquant: ${scenarioName}`, async () => {
                const conflictError = new StaffAvailabilityConflictError("Simulated blocking conflict.");
                mockConflictCheck(true, conflictError, null);

                await expect(staffAvailabilityService.createStaffAvailability(conflictingDto, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID))
                    .rejects.toThrow(StaffAvailabilityConflictError);
                expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalledWith(
                    expect.objectContaining({ // Vérifier les détails du candidat passé
                        rruleString: conflictingDto.rruleString,
                        durationMinutes: conflictingDto.durationMinutes,
                        // idToExclude ne sera pas là pour la création
                    }),
                    MOCK_TARGET_MEMBERSHIP_ID,
                    mockActorAdminMembership.establishmentId
                );
                expect(db.StaffAvailability.create).not.toHaveBeenCalled();
            });
        };

        testBlockingConflictScenario(
            'Nouvelle règle commence pendant existante',
            { // DTO complet
                rruleString: 'DTSTART=20240701T100000;FREQ=DAILY;COUNT=1',
                durationMinutes: 120,
                isWorking: true,
                effectiveStartDate: '2024-07-01',
                description: 'Conflict: Starts during existing',
                effectiveEndDate: '2024-07-01',
            }
        );
        testBlockingConflictScenario(
            'Nouvelle règle se termine pendant existante',
            { // Fournir un DTO complet ici
                rruleString: 'DTSTART=20240701T080000;FREQ=DAILY;COUNT=1',
                durationMinutes: 120, // 8h-10h, si existant est 9h-11h
                isWorking: true,
                effectiveStartDate: '2024-07-01',
                description: 'Conflict: Ends during existing',
                effectiveEndDate: '2024-07-01',
            }
        );
        testBlockingConflictScenario(
            'Nouvelle règle englobe existante',
            { // Fournir un DTO complet ici
                rruleString: 'DTSTART=20240701T090000;FREQ=DAILY;COUNT=1',
                durationMinutes: 180, // 9h-12h, si existant est 10h-11h
                isWorking: true,
                effectiveStartDate: '2024-07-01',
                description: 'Conflict: Engulfs existing',
                effectiveEndDate: '2024-07-01',
            }
        );
        testBlockingConflictScenario(
            'Nouvelle règle est englobée par existante',
            { // Fournir un DTO complet ici
                rruleString: 'DTSTART=20240701T100000;FREQ=DAILY;COUNT=1',
                durationMinutes: 30, // 10h-10h30, si existant est 9h-12h
                isWorking: true,
                effectiveStartDate: '2024-07-01',
                description: 'Conflict: Engulfed by existing',
                effectiveEndDate: '2024-07-01',
            }
        );

        it('Adv - rruleString syntaxiquement incorrecte', async () => {
            const dtoInvalidRRule: CreateStaffAvailabilityDto = { ...mockCreateDto, rruleString: 'INVALID_RRULE' };
            await expect(staffAvailabilityService.createStaffAvailability(dtoInvalidRRule, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID))
                .rejects.toThrow(StaffAvailabilityCreationError);
            expect(db.StaffAvailability.create).not.toHaveBeenCalled();
        });

        it('Adv - durationMinutes = 0', async () => {
            const dtoZeroDuration: CreateStaffAvailabilityDto = { ...mockCreateDto, durationMinutes: 0 };
            await expect(staffAvailabilityService.createStaffAvailability(dtoZeroDuration, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID))
                .rejects.toThrow(StaffAvailabilityCreationError);
        });

        it('Adv - durationMinutes négative', async () => {
            const dtoNegativeDuration: CreateStaffAvailabilityDto = { ...mockCreateDto, durationMinutes: -10 };
            await expect(staffAvailabilityService.createStaffAvailability(dtoNegativeDuration, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID))
                .rejects.toThrow(StaffAvailabilityCreationError);
        });

        it('Adv - effectiveEndDate antérieure à effectiveStartDate', async () => {
            const dtoInvalidDates: CreateStaffAvailabilityDto = {
                ...mockCreateDto,
                effectiveStartDate: '2024-07-02',
                effectiveEndDate: '2024-07-01',
            };
            await expect(staffAvailabilityService.createStaffAvailability(dtoInvalidDates, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID))
                .rejects.toThrow(StaffAvailabilityCreationError);
        });

        it('Adv - targetMembershipId Inexistant', async () => {
            (db.Membership.findOne as jest.Mock).mockResolvedValue(null);
            await expect(staffAvailabilityService.createStaffAvailability(mockCreateDto, mockActorAdminMembership, 999))
                .rejects.toThrow(MembershipNotFoundError);
        });

        it('Adv - targetMembershipId n appartient pas à actorAdminMembership.establishmentId', async () => {
            (db.Membership.findOne as jest.Mock).mockResolvedValue(null); // findOne with where clause returns null
            const otherEstablishmentAdmin: MembershipAttributes = { ...mockActorAdminMembership, establishmentId: MOCK_OTHER_ESTABLISHMENT_ID };
            await expect(staffAvailabilityService.createStaffAvailability(mockCreateDto, otherEstablishmentAdmin, MOCK_TARGET_MEMBERSHIP_ID))
                .rejects.toThrow(MembershipNotFoundError);
        });

        it('Adv - Échec de staffAvailabilityModel.create (erreur DB)', async () => {
            (db.StaffAvailability.create as jest.Mock).mockRejectedValue(new Error('Database error'));
            await expect(staffAvailabilityService.createStaffAvailability(mockCreateDto, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID))
                .rejects.toThrow(StaffAvailabilityCreationError);
        });

        it('[CHEV] Adv - Conflit Non Bloquant (TimeOffRequest PENDING)', async () => {
            const potentialConflict: PotentialConflictDetailItem[] = [{
                type: "PENDING_TIMEOFF_REQUEST_OVERLAP",
                timeOffRequestId: 777,
                message: "Conflicts with pending time off."
            }];
            mockConflictCheck(false, undefined, potentialConflict); // Configurer checkForConflicts pour retourner ceci
            const dtoForNonBlocking: CreateStaffAvailabilityDto = { ...mockCreateDto }; // Utiliser un DTO de base

            // L'instance que le mock de create doit retourner, incluant les détails du conflit
            const createdInstanceWithConflictDetails: StaffAvailabilityAttributes = {
                id: MOCK_STAFF_AVAILABILITY_ID_1,
                rruleString: dtoForNonBlocking.rruleString,
                durationMinutes: dtoForNonBlocking.durationMinutes,
                isWorking: dtoForNonBlocking.isWorking,
                effectiveStartDate: dtoForNonBlocking.effectiveStartDate,
                effectiveEndDate: dtoForNonBlocking.effectiveEndDate ?? null,
                description: dtoForNonBlocking.description ?? null,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                createdByMembershipId: mockActorAdminMembership.id,
                appliedShiftTemplateRuleId: null,
                potential_conflict_details: potentialConflict,
                computed_min_start_utc: new Date(dtoForNonBlocking.effectiveStartDate + 'T09:00:00Z'), // Exemple
                computed_max_end_utc: dtoForNonBlocking.effectiveEndDate ? new Date(dtoForNonBlocking.effectiveEndDate + 'T23:59:59Z') : null, // Exemple
                createdAt: expect.any(Date) as Date,
                updatedAt: expect.any(Date) as Date,
            };
            (db.StaffAvailability.create as jest.Mock)
                .mockResolvedValue(mockSequelizeModelInstance<StaffAvailabilityAttributes>(createdInstanceWithConflictDetails));

            const result = await staffAvailabilityService.createStaffAvailability(dtoForNonBlocking, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID);

            expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalled();
            expect(db.StaffAvailability.create).toHaveBeenCalledWith(
                expect.objectContaining({ // Le service passe bien les détails du conflit à create
                    potential_conflict_details: potentialConflict
                })
            );
            expect(result.potential_conflict_details).toEqual(potentialConflict); // Vérifier le retour
        });

        it('[CHEV] Adv - Échec récupération disponibilités existantes (dans OverlapDetectionService)', async () => {
            // Simuler que OverlapDetectionService.checkForConflicts lève une erreur (ex: DB error interne)
            const internalError = new AppError('InternalServiceError', 500, 'Failed to fetch data for overlap check.');
            (mockOverlapDetectionService.checkForConflicts as jest.Mock).mockRejectedValue(internalError);

            await expect(staffAvailabilityService.createStaffAvailability(mockCreateDto, mockActorAdminMembership, MOCK_TARGET_MEMBERSHIP_ID))
                .rejects.toThrow(internalError);
            expect(db.StaffAvailability.create).not.toHaveBeenCalled();
        });

    });

    // --- Tests pour getStaffAvailabilityById ---
    describe('getStaffAvailabilityById', () => {
        let mockExistingAvailabilityData: StaffAvailabilityAttributes;
        let mockAvailabilityInstance: ReturnType<typeof mockSequelizeModelInstance<StaffAvailabilityAttributes>>;
        const MOCK_AVAILABILITY_ID_FOR_GET = 789;

        beforeEach(() => {
            mockExistingAvailabilityData = {
                id: MOCK_AVAILABILITY_ID_FOR_GET,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                rruleString: 'FREQ=DAILY;DTSTART=20240801T100000;COUNT=1',
                durationMinutes: 180,
                isWorking: true,
                effectiveStartDate: '2024-08-01',
                effectiveEndDate: null,
                description: 'Existing rule for get test',
                appliedShiftTemplateRuleId: 42,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                computed_min_start_utc: new Date('2024-08-01T10:00:00Z'), // Exemple
                computed_max_end_utc: new Date('2024-08-01T13:00:00Z'),   // Exemple
                potential_conflict_details: null,
                createdAt: new Date('2024-08-01T00:00:00Z'),
                updatedAt: new Date('2024-08-01T00:00:00Z'),
            };

            // Simuler une instance Sequelize avec la relation 'membership' pré-chargée
            // que findByPk avec include retournerait
            mockAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(
                mockExistingAvailabilityData,
                {
                    // La méthode 'get' est déjà mockée par mockSequelizeModelInstance pour retourner les propriétés
                    // ou l'instance elle-même.
                    // Si on a besoin de simuler des associations chargées, on les ajoute comme propriétés.
                }
            );
            // Attacher le membership mocké à l'instance
            (mockAvailabilityInstance as any).membership = mockSequelizeModelInstance<MembershipAttributes>({
                ...mockTargetMembershipAttributes, // Assure que MOCK_TARGET_MEMBERSHIP_ID a le bon establishmentId
                establishmentId: MOCK_ESTABLISHMENT_ID, // Explicitement pour le test
            });


            (db.StaffAvailability.findByPk as jest.Mock).mockResolvedValue(mockAvailabilityInstance);
        });

        // --- Functional / "Happy Path" ---
        it('Func - Récupération Réussie d\'une Règle Appartenant à l\'Établissement', async () => {
            const result = await staffAvailabilityService.getStaffAvailabilityById(
                MOCK_AVAILABILITY_ID_FOR_GET,
                MOCK_ESTABLISHMENT_ID
            );

            expect(db.StaffAvailability.findByPk).toHaveBeenCalledWith(
                MOCK_AVAILABILITY_ID_FOR_GET,
                {
                    include: [{
                        model: db.Membership, // Utiliser le mock de Membership
                        as: 'membership',
                        attributes: ['id', 'establishmentId'],
                        required: true,
                    }]
                }
            );
            expect(result).toEqual(mockAvailabilityInstance.get({ plain: true }));
            expect(result?.id).toBe(MOCK_AVAILABILITY_ID_FOR_GET);
        });

        it('Func - Règle récupérée a appliedShiftTemplateRuleId non null', async () => {
            // La configuration par défaut du beforeEach a déjà appliedShiftTemplateRuleId: 42
            const result = await staffAvailabilityService.getStaffAvailabilityById(
                MOCK_AVAILABILITY_ID_FOR_GET,
                MOCK_ESTABLISHMENT_ID
            );
            expect(result?.appliedShiftTemplateRuleId).toBe(42);
        });

        it('Func - Règle récupérée a createdByMembershipId non null', async () => {
            // La configuration par défaut du beforeEach a déjà createdByMembershipId
            const result = await staffAvailabilityService.getStaffAvailabilityById(
                MOCK_AVAILABILITY_ID_FOR_GET,
                MOCK_ESTABLISHMENT_ID
            );
            expect(result?.createdByMembershipId).toBe(MOCK_ADMIN_MEMBERSHIP_ID);
        });

        // --- Edge Cases ---
        it('Edge - staffAvailabilityId correspond à une règle avec description = null et effectiveEndDate = null', async () => {
            const specificData: StaffAvailabilityAttributes = {
                ...mockExistingAvailabilityData,
                description: null,
                effectiveEndDate: null,
                computed_max_end_utc: null
            };
            const specificInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(specificData);
            (specificInstance as any).membership = (mockAvailabilityInstance as any).membership; // Garder le même membership
            (db.StaffAvailability.findByPk as jest.Mock).mockResolvedValue(specificInstance);

            const result = await staffAvailabilityService.getStaffAvailabilityById(
                MOCK_AVAILABILITY_ID_FOR_GET,
                MOCK_ESTABLISHMENT_ID
            );

            expect(result?.description).toBeNull();
            expect(result?.effectiveEndDate).toBeNull();
        });

        // --- Adversarial / Error Handling / "Sad Path" ---
        it('Adv - staffAvailabilityId Inexistant', async () => {
            (db.StaffAvailability.findByPk as jest.Mock).mockResolvedValue(null);

            const result = await staffAvailabilityService.getStaffAvailabilityById(
                9999, // ID inexistant
                MOCK_ESTABLISHMENT_ID
            );

            expect(db.StaffAvailability.findByPk).toHaveBeenCalledWith(9999, expect.anything());
            expect(result).toBeNull();
        });

        it('Adv - staffAvailabilityId Existe mais n appartient pas à l établissement (via membership.establishmentId)', async () => {
            // Modifier le membership associé à l'instance retournée pour qu'il appartienne à un autre établissement
            (mockAvailabilityInstance as any).membership = mockSequelizeModelInstance<MembershipAttributes>({
                ...mockTargetMembershipAttributes,
                establishmentId: MOCK_OTHER_ESTABLISHMENT_ID, // Autre établissement
            });
            (db.StaffAvailability.findByPk as jest.Mock).mockResolvedValue(mockAvailabilityInstance);

            const result = await staffAvailabilityService.getStaffAvailabilityById(
                MOCK_AVAILABILITY_ID_FOR_GET,
                MOCK_ESTABLISHMENT_ID // On demande pour MOCK_ESTABLISHMENT_ID
            );

            // findByPk est appelé, mais la condition `staffAvailability.membership?.establishmentId !== establishmentId` sera vraie
            expect(result).toBeNull();
        });

        it('Adv - staffAvailabilityId Existe mais `membership` associé est manquant (ou `required: true` fait retourner null)', async () => {
            // Si l'include avec `required: true` ne trouve pas de membership, findByPk retourne null.
            (db.StaffAvailability.findByPk as jest.Mock).mockResolvedValue(null);

            const result = await staffAvailabilityService.getStaffAvailabilityById(
                MOCK_AVAILABILITY_ID_FOR_GET,
                MOCK_ESTABLISHMENT_ID
            );

            expect(result).toBeNull();
        });

    })

    // --- Tests pour listStaffAvailabilitiesForMember ---
    describe('listStaffAvailabilitiesForMember', () => {
        // Utiliser Partial ici pour permettre des assignations incomplètes dans les tests spécifiques
        // Le service appliquera ses propres valeurs par défaut.
        let queryDtoForTest: Partial<ZodListStaffAvailabilitiesQueryDto>;
        let mockTargetMemberInstance: jest.Mocked<MembershipReal & MembershipAttributes & { establishment: jest.Mocked<EstablishmentReal & EstablishmentAttributes> }>;
        let mockAvailabilitiesData: StaffAvailabilityAttributes[];
        let mockAvailabilityInstances: Array<ReturnType<typeof mockSequelizeModelInstance<StaffAvailabilityAttributes>>>;

        const MOCK_TARGET_ID_FOR_LIST = MOCK_TARGET_MEMBERSHIP_ID;

        beforeEach(() => {
            queryDtoForTest = {}; // Initialisation par défaut

            const mockEstablishmentDataForList = mockSequelizeModelInstance<EstablishmentAttributes>({
                id: MOCK_ESTABLISHMENT_ID,
                name: 'Test Establishment for List',
                timezone: MOCK_DEFAULT_TIMEZONE,
                address_line1: '123 Test St', city: 'TestCity', postal_code: '12345', country_name: 'Testland', country_code: 'TS',
                siret: '11122233300001', siren: '111222333', owner_id: MOCK_ADMIN_USER_ID, is_validated: true,
                createdAt: new Date(), updatedAt: new Date(),
            }) as jest.Mocked<EstablishmentReal & EstablishmentAttributes>; // Cast pour inclure les méthodes mockées

            // Étape 1: Créer l'instance de base avec les MembershipAttributes
            const baseMockTargetMember = mockSequelizeModelInstance<MembershipAttributes>({
                ...mockTargetMembershipAttributes,
                id: MOCK_TARGET_ID_FOR_LIST,
                establishmentId: mockEstablishmentDataForList.id,
            }) as jest.Mocked<MembershipReal & MembershipAttributes>; // Cast initial

            // Étape 2: Attacher l'association mockée 'establishment'
            // TypeScript a besoin d'un cast pour ajouter une propriété non définie dans MembershipAttributes directement.
            (baseMockTargetMember as any).establishment = mockEstablishmentDataForList;

            // Étape 3: Assigner à mockTargetMemberInstance avec le type final
            mockTargetMemberInstance = baseMockTargetMember as jest.Mocked<MembershipReal & MembershipAttributes & { establishment: jest.Mocked<EstablishmentReal & EstablishmentAttributes> }>;

            (db.Membership.findOne as jest.Mock).mockResolvedValue(mockTargetMemberInstance);

            // S'assurer que mockAvailabilitiesData inclut les champs computed_*
            mockAvailabilitiesData = [
                {
                    id: MOCK_STAFF_AVAILABILITY_ID_1, membershipId: MOCK_TARGET_ID_FOR_LIST,
                    rruleString: 'FREQ=DAILY;DTSTART=20240901T090000;COUNT=1', durationMinutes: 120, isWorking: true,
                    effectiveStartDate: '2024-09-01', effectiveEndDate: null, description: 'Avail 1 (Sept)',
                    appliedShiftTemplateRuleId: null, createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                    computed_min_start_utc: moment.tz('2024-09-01T09:00:00', MOCK_DEFAULT_TIMEZONE).utc().toDate(),
                    computed_max_end_utc: moment.tz('2024-09-01T09:00:00', MOCK_DEFAULT_TIMEZONE).add(120, 'minutes').utc().toDate(),
                    potential_conflict_details: null,
                    createdAt: new Date('2024-08-15T00:00:00Z'), updatedAt: new Date('2024-08-15T00:00:00Z'),
                },
                {
                    id: MOCK_STAFF_AVAILABILITY_ID_2, membershipId: MOCK_TARGET_ID_FOR_LIST,
                    rruleString: 'FREQ=WEEKLY;BYDAY=SA,SU;DTSTART=20240907T100000;UNTIL=20240908T235959Z',
                    durationMinutes: 480, isWorking: false,
                    effectiveStartDate: '2024-09-07', effectiveEndDate: '2024-09-08', description: 'Avail 2 Weekend (Sept)',
                    appliedShiftTemplateRuleId: null, createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                    computed_min_start_utc: moment.tz('2024-09-07T10:00:00', MOCK_DEFAULT_TIMEZONE).utc().toDate(),
                    // Calcul précis de la fin pour UNTIL=20240908T235959Z, dernière occurrence le 08/09 à 10h + 8h = 18h
                    computed_max_end_utc: moment.tz('2024-09-08T10:00:00', MOCK_DEFAULT_TIMEZONE).add(480, 'minutes').utc().toDate(),
                    potential_conflict_details: null,
                    createdAt: new Date('2024-08-10T00:00:00Z'), updatedAt: new Date('2024-08-10T00:00:00Z'),
                },
            ];
            mockAvailabilityInstances = mockAvailabilitiesData.map(data =>
                mockSequelizeModelInstance<StaffAvailabilityAttributes>(data)
            );

            (db.StaffAvailability.findAndCountAll as jest.Mock).mockResolvedValue({
                rows: mockAvailabilityInstances,
                count: mockAvailabilityInstances.length,
            });
        });

        it('Func - Liste Réussie pour un Membre Ayant Plusieurs Disponibilités (défauts du service)', async () => {
            // Act: Passer un DTO vide pour tester les valeurs par défaut du service
            const result = await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST,
                MOCK_ESTABLISHMENT_ID,
                {} // Passer un DTO vide explicitement
            );

            // Assert
            expect(db.StaffAvailability.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { membershipId: MOCK_TARGET_ID_FOR_LIST },
                limit: 10, // Valeur par défaut DANS LE SERVICE
                offset: 0,
                order: [['effectiveStartDate', 'ASC']], // Valeur par défaut DANS LE SERVICE
            }));
            expect(result.data).toHaveLength(2);
            expect(result.meta.totalItems).toBe(2);
            expect(result.meta.currentPage).toBe(1); // Attendu car le service utilise 1 par défaut
        });

        it('Func - Liste avec Filtre isWorking = true', async () => {
            queryDtoForTest = { isWorking: true };
            const filteredInstances = mockAvailabilityInstances.filter(inst => inst.get('isWorking') === true);
            (db.StaffAvailability.findAndCountAll as jest.Mock).mockResolvedValue({
                rows: filteredInstances, count: filteredInstances.length,
            });

            const result = await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, queryDtoForTest
            );

            expect(db.StaffAvailability.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    // CORRECTION: La clause where est construite avec Op.and si plusieurs conditions
                    where: {
                        [Op.and]: [
                            { membershipId: MOCK_TARGET_ID_FOR_LIST },
                            { isWorking: true }
                        ]
                    },
                    limit: 10, // Valeur par défaut du service
                    offset: 0,
                    order: [['effectiveStartDate', 'ASC']], // Valeur par défaut du service
                })
            );
            expect(result.data).toHaveLength(1); // Basé sur mockAvailabilityInstances et isWorking: true
            if (result.data.length > 0) { // Pour éviter l'erreur si le filtre ne retourne rien
                expect(result.data[0].isWorking).toBe(true);
            }
        });

        it('Func - Liste avec Filtre isWorking = false', async () => {
            queryDtoForTest = { isWorking: false };
            const filteredInstances = mockAvailabilityInstances.filter(inst => inst.get('isWorking') === false);
            (db.StaffAvailability.findAndCountAll as jest.Mock).mockResolvedValue({
                rows: filteredInstances, count: filteredInstances.length,
            });

            const result = await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, queryDtoForTest
            );
            expect(db.StaffAvailability.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    // CORRECTION: La clause where est construite avec Op.and
                    where: {
                        [Op.and]: [
                            { membershipId: MOCK_TARGET_ID_FOR_LIST },
                            { isWorking: false }
                        ]
                    },
                    limit: 10,
                    offset: 0,
                    order: [['effectiveStartDate', 'ASC']],
                })
            );
            expect(result.data).toHaveLength(1); // Basé sur mockAvailabilityInstances et isWorking: false
            if (result.data.length > 0) {
                expect(result.data[0].isWorking).toBe(false);
            }
        });

        it('Func - Liste avec Pagination spécifique (page 2, limit 1)', async () => {
            queryDtoForTest = { page: 2, limit: 1 }; // sortBy et sortOrder prendront les défauts du service
            (db.StaffAvailability.findAndCountAll as jest.Mock).mockResolvedValue({
                rows: [mockAvailabilityInstances[1]],
                count: mockAvailabilityInstances.length,
            });

            const result = await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, queryDtoForTest
            );
            expect(db.StaffAvailability.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    limit: 1,
                    offset: 1,
                    order: [['effectiveStartDate', 'ASC']], // Défaut du service
                })
            );
            expect(result.meta.currentPage).toBe(2);
            expect(result.meta.itemsPerPage).toBe(1);
        });

        it('Func - Liste avec Tri par createdAt en ordre DESC', async () => {
            queryDtoForTest = { sortBy: 'createdAt', sortOrder: 'desc' }; // page et limit prendront les défauts du service
            await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, queryDtoForTest
            );
            expect(db.StaffAvailability.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    order: [['createdAt', 'DESC']],
                    limit: 10, // Défaut du service
                    offset: 0,   // Défaut du service
                })
            );
        });

        it('Func - queryDto contient filterRangeStart et filterRangeEnd valides', async () => {
            // Arrange
            const filterStartDate = '2024-09-01';
            const filterEndDate = '2024-09-01';
            queryDtoForTest = {
                filterRangeStart: filterStartDate,
                filterRangeEnd: filterEndDate,
                page: 1, limit: 10, // Inclure les défauts pour la complétude du type attendu par le service
                sortBy: 'effectiveStartDate', sortOrder: 'asc'
            };

            // Convertir les dates de filtre en UTC pour la comparaison avec ce que le service va utiliser
            const filterRangeStartUTC = moment.tz(filterStartDate, 'YYYY-MM-DD', MOCK_DEFAULT_TIMEZONE).startOf('day').utc().toDate();
            const filterRangeEndUTC = moment.tz(filterEndDate, 'YYYY-MM-DD', MOCK_DEFAULT_TIMEZONE).endOf('day').utc().toDate();

            // Simuler que le pré-filtre SQL retourne la première règle (mockAvailabilitiesData[0])
            // car sa computed_min_start_utc et computed_max_end_utc chevauchent le 2024-09-01
            // mockAvailabilitiesData[0] : computed_min_start_utc: 2024-09-01T07:00:00Z, computed_max_end_utc: 2024-09-01T09:00:00Z (avec timezone Europe/Paris)
            // mockAvailabilitiesData[1] : commence le 2024-09-07, donc ne devrait pas être retourné par le pré-filtre
            const preFilteredCandidates = [mockAvailabilityInstances[0]]; // Contient l'instance pour ID 301
            (db.StaffAvailability.findAndCountAll as jest.Mock).mockResolvedValue({
                rows: preFilteredCandidates, // Seulement la première règle passe le pré-filtre
                count: 1, // Compte après pré-filtre SQL
            });

            // Act
            const result = await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST,
                MOCK_ESTABLISHMENT_ID,
                queryDtoForTest
            );

            // Assert
            expect(db.Membership.findOne).toHaveBeenCalled();
            expect(db.StaffAvailability.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    [Op.and]: [ // Le service construit ainsi
                        { membershipId: MOCK_TARGET_ID_FOR_LIST },
                        {
                            computed_min_start_utc: { [Op.lt]: filterRangeEndUTC },
                            [Op.or]: [
                                { computed_max_end_utc: { [Op.gt]: filterRangeStartUTC } },
                                { computed_max_end_utc: null }
                            ]
                        }
                        // Si queryDtoForTest contenait isWorking, il serait aussi dans le Op.and
                    ]
                },
                limit: 10,
                offset: 0,
                order: [['effectiveStartDate', 'ASC']]
            }));

            // La logique de filtrage fin en mémoire du service va maintenant s'exécuter sur preFilteredCandidates[0]
            // generateOccurrences pour cette règle le 2024-09-01 devrait retourner une occurrence.
            expect(result.data).toHaveLength(1);
            expect(result.data[0].id).toBe(MOCK_STAFF_AVAILABILITY_ID_1);
            expect(result.meta.totalItems).toBe(1); // Basé sur le count du pré-filtre SQL après filtrage fin
                                                    // Dans notre cas, comme on a simulé le retour de findAndCountAll
                                                    // pour qu'il ne retourne que des candidats pertinents, et que
                                                    // le filtrage fin les garde tous, le count correspond.
        });

        // --- Edge Cases ---
        it('Edge - Liste pour un Membre sans Aucune Disponibilité', async () => {
            (db.StaffAvailability.findAndCountAll as jest.Mock).mockResolvedValue({ rows: [], count: 0 });
            const result = await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, {} // DTO vide
            );
            expect(result.data).toHaveLength(0);
            expect(result.meta.totalItems).toBe(0);
        });

        it('Edge - Liste avec limit = 1 et plusieurs disponibilités existantes', async () => {
            queryDtoForTest = { limit: 1 }; // page, sortBy, sortOrder prendront les défauts du service
            (db.StaffAvailability.findAndCountAll as jest.Mock).mockResolvedValue({
                rows: [mockAvailabilityInstances[0]],
                count: mockAvailabilityInstances.length,
            });
            const result = await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, queryDtoForTest
            );
            expect(result.data).toHaveLength(1);
            expect(result.meta.itemsPerPage).toBe(1);
        });

        it('Edge - queryDto avec tous les champs optionnels absents (valeurs par défaut du service utilisées)', async () => {
            await staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, {} // Passer un DTO vide
            );
            expect(db.StaffAvailability.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    limit: 10, // Vérifier le défaut du service
                    offset: 0,  // Vérifier le défaut du service
                    order: [['effectiveStartDate', 'ASC']], // Vérifier le défaut du service
                    where: expect.objectContaining({ membershipId: MOCK_TARGET_ID_FOR_LIST })
                })
            );
        });

        // --- Adversarial / Error Handling / "Sad Path" ---
        it('Adv - targetMembershipId Inexistant', async () => {
            (db.Membership.findOne as jest.Mock).mockResolvedValue(null);
            await expect(staffAvailabilityService.listStaffAvailabilitiesForMember(
                999, MOCK_ESTABLISHMENT_ID, {}
            )).rejects.toThrow(MembershipNotFoundError);
        });

        it('Adv - targetMembershipId n appartient pas à establishmentId', async () => {
            (db.Membership.findOne as jest.Mock).mockResolvedValue(null);
            await expect(staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_OTHER_ESTABLISHMENT_ID, {}
            )).rejects.toThrow(MembershipNotFoundError);
        });

        it('Adv - Échec de db.StaffAvailability.findAndCountAll (simulé)', async () => {
            (db.StaffAvailability.findAndCountAll as jest.Mock).mockRejectedValue(new Error('DB connection error'));
            await expect(staffAvailabilityService.listStaffAvailabilitiesForMember(
                MOCK_TARGET_ID_FOR_LIST, MOCK_ESTABLISHMENT_ID, {}
            )).rejects.toThrow('DB connection error');
        });

    });

    // --- Tests pour updateStaffAvailability ---
    describe('updateStaffAvailability', () => {
        let mockUpdateDto: UpdateStaffAvailabilityDto;
        let mockExistingAvailabilityData: StaffAvailabilityAttributes;
        // Instance mockée retournée par le premier findByPk, sur laquelle .update() sera appelée
        let mockAvailabilityInstanceToUpdate: ReturnType<typeof mockSequelizeModelInstance<StaffAvailabilityAttributes>>;
        // Instance mockée retournée par le second findByPk (re-fetch après update)
        let mockRefetchedAvailabilityInstance: ReturnType<typeof mockSequelizeModelInstance<StaffAvailabilityAttributes>>;

        const MOCK_AVAIL_ID_TO_UPDATE = MOCK_STAFF_AVAILABILITY_ID_1; // Réutiliser une constante

        const mockConflictCheckForUpdate = (
            hasBlocking: boolean,
            blockingError?: StaffAvailabilityConflictError,
            potentialDetails?: PotentialConflictDetailItem[] | null
        ) => {
            (mockOverlapDetectionService.checkForConflicts as jest.Mock).mockResolvedValue({
                hasBlockingConflict: hasBlocking,
                blockingConflictError: blockingError,
                potentialConflictDetails: potentialDetails,
            });
        };

        beforeEach(() => {
            mockUpdateDto = {}; // Sera surchargé dans chaque test

            mockExistingAvailabilityData = {
                id: MOCK_AVAIL_ID_TO_UPDATE,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                rruleString: 'FREQ=DAILY;DTSTART=20241001T090000;COUNT=5',
                durationMinutes: 240,
                isWorking: true,
                effectiveStartDate: '2024-10-01',
                effectiveEndDate: '2024-10-05',
                description: 'Original Description',
                appliedShiftTemplateRuleId: 111,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID -1,
                computed_min_start_utc: new Date('2024-10-01T09:00:00Z'),
                computed_max_end_utc: new Date('2024-10-05T13:00:00Z'), // 09:00 + 240 min * 5 jours, fin le 5ème jour à 13:00
                potential_conflict_details: null,
                createdAt: new Date('2024-09-01T00:00:00Z'),
                updatedAt: new Date('2024-09-01T00:00:00Z'),
            };

            mockAvailabilityInstanceToUpdate = mockSequelizeModelInstance<StaffAvailabilityAttributes>(
                { ...mockExistingAvailabilityData },
            );
            (mockAvailabilityInstanceToUpdate as any).membership = mockSequelizeModelInstance<MembershipAttributes>({
                ...mockTargetMembershipAttributes,
                establishmentId: MOCK_ESTABLISHMENT_ID,
            });


            // Le service fait findByPk, PUIS model.update, PUIS findByPk (re-fetch)
            // Premier findByPk (pour récupérer l'entité à mettre à jour)
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockResolvedValue(mockAvailabilityInstanceToUpdate);

            (db.StaffAvailability.update as jest.Mock).mockResolvedValue([1, []]);

            // Second findByPk (pour le re-fetch après l'update)
            // Cette instance contiendra les données mises à jour.
            // Elle sera configurée dans chaque test au besoin.
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>({
                ...mockExistingAvailabilityData,
                computed_min_start_utc: mockExistingAvailabilityData.computed_min_start_utc,
                computed_max_end_utc: mockExistingAvailabilityData.computed_max_end_utc,
            });
            (db.StaffAvailability.findAll as jest.Mock).mockResolvedValue([]);
            mockConflictCheckForUpdate(false, undefined, null);
        });

        // --- Functional / "Happy Path" ---
        it('Func - Mise à Jour Réussie de description Seule', async () => {
            mockUpdateDto = { description: 'Updated Description Only' };
            mockConflictCheckForUpdate(false, undefined, null);

            // Le service, si dto.description est fourni et que la règle vient d'un template,
            // met à jour la description avec la nouvelle valeur (pas de préfixe) et détache.
            // Les champs computed_* ne sont pas recalculés car les champs temporels ne sont pas dans le DTO.
            const expectedPayloadForDbUpdate = {
                description: 'Updated Description Only', // CORRIGÉ: C'est la nouvelle description
                appliedShiftTemplateRuleId: null,        // Détaché car DTO non vide et règle de template
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                potential_conflict_details: null,
                // computed_* ne sont pas dans le payload de l'update car non modifiés
            };

            const dataForRefetch: StaffAvailabilityAttributes = {
                ...mockExistingAvailabilityData, // Base
                description: 'Updated Description Only',
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                potential_conflict_details: null,
                // computed_* restent ceux de mockExistingAvailabilityData
                computed_min_start_utc: mockExistingAvailabilityData.computed_min_start_utc,
                computed_max_end_utc: mockExistingAvailabilityData.computed_max_end_utc,
                updatedAt: expect.any(Date) as Date,
            };

            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockSequelizeModelInstance<StaffAvailabilityAttributes>(dataForRefetch));

            const result = await staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            expect(db.StaffAvailability.update).toHaveBeenCalledWith(
                expect.objectContaining(expectedPayloadForDbUpdate),
                expect.objectContaining({ where: { id: MOCK_AVAIL_ID_TO_UPDATE } })
            );
            expect(result.description).toBe('Updated Description Only');
            expect(result.appliedShiftTemplateRuleId).toBeNull();
            expect(result.createdByMembershipId).toBe(MOCK_ADMIN_MEMBERSHIP_ID);
            expect(result.potential_conflict_details).toBeNull();
            expect(result.computed_min_start_utc).toEqual(mockExistingAvailabilityData.computed_min_start_utc);
            expect(result.computed_max_end_utc).toEqual(mockExistingAvailabilityData.computed_max_end_utc);
        });

        it('Func - Mise à Jour de rruleString, durationMinutes, isWorking, effectiveStartDate, effectiveEndDate', async () => {
            mockUpdateDto = {
                rruleString: 'FREQ=MONTHLY;DTSTART=20241101T100000',
                durationMinutes: 180,
                isWorking: false,
                effectiveStartDate: '2024-11-01',
                effectiveEndDate: '2025-03-31',
            };
            const expectedUpdatedData = {
                ...mockExistingAvailabilityData,
                ...mockUpdateDto,
                appliedShiftTemplateRuleId: null,
                computed_min_start_utc: mockExistingAvailabilityData.computed_min_start_utc,
                computed_max_end_utc: mockExistingAvailabilityData.computed_max_end_utc,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                updatedAt: expect.any(Date)
            };
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(expectedUpdatedData);
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockRefetchedAvailabilityInstance);

            const result = await staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            expect(db.StaffAvailability.update).toHaveBeenCalledWith(
                expect.objectContaining(mockUpdateDto), // Vérifie que tous les champs du DTO sont dans l'update
                expect.anything()
            );
            expect(result).toEqual(expect.objectContaining(expectedUpdatedData));
        });

        it('Func - Mise à Jour d\'une règle initialement générée par un template (appliedShiftTemplateRuleId devient null)', async () => {
            // mockExistingAvailabilityData.appliedShiftTemplateRuleId est déjà 111
            mockUpdateDto = { description: 'Manual override of template rule' };
            const expectedUpdatedData = {
                ...mockExistingAvailabilityData,
                description: 'Manual override of template rule',
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                computed_min_start_utc: mockExistingAvailabilityData.computed_min_start_utc,
                computed_max_end_utc: mockExistingAvailabilityData.computed_max_end_utc,
                updatedAt: expect.any(Date)
            };
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(expectedUpdatedData);
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockRefetchedAvailabilityInstance);


            const result = await staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            expect(db.StaffAvailability.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: 'Manual override of template rule', // Le service ajuste la description
                    appliedShiftTemplateRuleId: null
                }),
                expect.anything()
            );
            expect(result.appliedShiftTemplateRuleId).toBeNull();
            expect(result.description).toBe('Manual override of template rule');
        });

        it('Func - Mise à Jour pour enlever effectiveEndDate (passant null)', async () => {
            mockUpdateDto = { effectiveEndDate: undefined };
            const expectedUpdatedData = {
                ...mockExistingAvailabilityData,
                effectiveEndDate: null,
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                computed_min_start_utc: mockExistingAvailabilityData.computed_min_start_utc,
                computed_max_end_utc: mockExistingAvailabilityData.computed_max_end_utc,
                updatedAt: expect.any(Date) };
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(expectedUpdatedData);
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockRefetchedAvailabilityInstance);

            const result = await staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );
            expect(result.effectiveEndDate).toBeNull();
        });

        // --- Edge Cases ---
        it('Edge - DTO de mise à jour vide ({})', async () => {
            // Arrange
            mockUpdateDto = {};
            const dataForRefetchAfterUpdate: StaffAvailabilityAttributes = {
                ...mockExistingAvailabilityData,
                potential_conflict_details: null,
                updatedAt: expect.any(Date) as Date,
                computed_min_start_utc: mockExistingAvailabilityData.computed_min_start_utc,
                computed_max_end_utc: mockExistingAvailabilityData.computed_max_end_utc,
            };

            // Configurer le re-fetch pour retourner cela :
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset() // Important pour les tests avec plusieurs appels à findByPk
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate) // Premier appel pour récupérer l'entité
                .mockResolvedValueOnce(mockSequelizeModelInstance<StaffAvailabilityAttributes>(dataForRefetchAfterUpdate));  // Deuxième appel (re-fetch)

            // Act
            const result = await staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE,
                mockUpdateDto,
                MOCK_ESTABLISHMENT_ID, // Passé au service
                MOCK_ADMIN_MEMBERSHIP_ID // actorAdminMembershipId
            );

            // Assert
            // S'attendre à ce que update SOIT appelé, avec potential_conflict_details: null
            // car même si le DTO est vide, le service assigne toujours updateData.potential_conflict_details.
            expect(db.StaffAvailability.update).toHaveBeenCalledWith(
                { // L'objet `updateData` construit par le service
                    potential_conflict_details: null,
                },
                expect.objectContaining({ where: { id: MOCK_AVAIL_ID_TO_UPDATE } })
            );

            // Vérifier le résultat retourné par le service (après re-fetch)
            expect(result.description).toBe(mockExistingAvailabilityData.description);
            expect(result.appliedShiftTemplateRuleId).toBe(mockExistingAvailabilityData.appliedShiftTemplateRuleId);
            expect(result.createdByMembershipId).toBe(mockExistingAvailabilityData.createdByMembershipId); // Inchangé
            expect(result.potential_conflict_details).toBeNull();
            expect(result.updatedAt).toEqual(expect.any(Date)); // Vérifier que updatedAt est une date
        });

        it('Edge - DTO contient des champs avec undefined (ex: description: undefined, mais durationMinutes est fourni)', async () => {
            // Arrange
            mockUpdateDto = { description: undefined, durationMinutes: 300 };
            // mockExistingAvailabilityInstance a appliedShiftTemplateRuleId = 111 et description = 'Original Description'

            const expectedDescriptionAfterUpdate = `(Manually override) ${mockExistingAvailabilityData.description || ''}`.trim();
            const expectedDataAfterUpdate = {
                ...mockExistingAvailabilityData,
                durationMinutes: 300,
                description: expectedDescriptionAfterUpdate,
                appliedShiftTemplateRuleId: null, // Détaché
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                updatedAt: expect.any(Date)
            };
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(expectedDataAfterUpdate);
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockRefetchedAvailabilityInstance);

            // Act
            const result = await staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE,
                mockUpdateDto,
                MOCK_ESTABLISHMENT_ID,
                MOCK_ADMIN_MEMBERSHIP_ID
            );

            // Assert
            // Le payload pour `update` contiendra durationMinutes, la description préfixée, appliedShiftTemplateRuleId: null, et createdByMembershipId.
            // Les champs du DTO qui sont `undefined` (comme `description: undefined` ici) ne sont pas inclus par le spread `{...dto}` dans `updateData`.
            const updatePayload = (db.StaffAvailability.update as jest.Mock).mock.calls[0][0];

            expect(updatePayload.durationMinutes).toBe(300);
            expect(updatePayload.description).toBe(expectedDescriptionAfterUpdate); // Vérifier la description préfixée
            expect(updatePayload.appliedShiftTemplateRuleId).toBeNull();
            expect(updatePayload.createdByMembershipId).toBe(MOCK_ADMIN_MEMBERSHIP_ID);
            expect(updatePayload.rruleString).toBeUndefined(); // Car non dans dto
            // ... autres champs du DTO qui étaient undefined ne doivent pas être dans updatePayload

            // Vérifier le résultat retourné par le service (après re-fetch)
            expect(result.durationMinutes).toBe(300);
            expect(result.description).toBe(expectedDescriptionAfterUpdate);
            expect(result.appliedShiftTemplateRuleId).toBeNull();
        });


        // [CHEV] Tests Edge pour chevauchement (marqués xit)
        it('[CHEV] Edge - MàJ se terminant EXACTEMENT quand une autre commence (Pas de Chevauchement)', async () => {
            mockConflictCheckForUpdate(false, undefined, null);
            mockUpdateDto = { effectiveEndDate: '2024-10-01', durationMinutes: 60, description: 'Ends just before' };
            const updatedData = { ...mockExistingAvailabilityData, ...mockUpdateDto, appliedShiftTemplateRuleId: null, createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID, potential_conflict_details: null, updatedAt: expect.any(Date) as Date };
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(updatedData);
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockRefetchedAvailabilityInstance);

            const result = await staffAvailabilityService.updateStaffAvailability(MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID);
            expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalled();
            expect(db.StaffAvailability.update).toHaveBeenCalled();
            expect(result.potential_conflict_details).toBeNull();
        });

        it('[CHEV] Edge - MàJ commençant EXACTEMENT quand une autre se termine (Pas de Chevauchement)', async () => {
            mockConflictCheckForUpdate(false, undefined, null);
            mockUpdateDto = { effectiveStartDate: '2024-10-02', rruleString: 'DTSTART=20241002T100000;FREQ=DAILY;COUNT=1', description: 'Starts just after' };
            const updatedData = { ...mockExistingAvailabilityData, ...mockUpdateDto, appliedShiftTemplateRuleId: null, createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID, potential_conflict_details: null, updatedAt: expect.any(Date) as Date };
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(updatedData);
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockRefetchedAvailabilityInstance);

            const result = await staffAvailabilityService.updateStaffAvailability(MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID);
            expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalled();
            expect(result.potential_conflict_details).toBeNull();
        });

        it('[CHEV] Edge - Réduction de période éliminant un chevauchement qui aurait existé (Pas de nouveau conflit)', async () => {
            mockConflictCheckForUpdate(false, undefined, null); // Pas de nouveau conflit après réduction
            mockUpdateDto = { durationMinutes: 30 }; // Réduire la durée
            const updatedData = { ...mockExistingAvailabilityData, ...mockUpdateDto, appliedShiftTemplateRuleId: null, createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID, potential_conflict_details: null, updatedAt: expect.any(Date) as Date };
            mockRefetchedAvailabilityInstance = mockSequelizeModelInstance<StaffAvailabilityAttributes>(updatedData);
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockRefetchedAvailabilityInstance);

            const result = await staffAvailabilityService.updateStaffAvailability(MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID);
            expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalled();
            expect(result.potential_conflict_details).toBeNull();
            expect(db.StaffAvailability.update).toHaveBeenCalled();
        });

        // --- Adversarial / Error Handling / "Sad Path" ---
        const testUpdateBlockingConflictScenario = async (scenarioName: string, updateDtoForConflict: UpdateStaffAvailabilityDto) => {
            it(`[CHEV] Adv - Conflit Bloquant MàJ: ${scenarioName}`, async () => {
                const conflictError = new StaffAvailabilityConflictError("Simulated blocking conflict during update.");
                mockConflictCheckForUpdate(true, conflictError, null);

                await expect(staffAvailabilityService.updateStaffAvailability(MOCK_AVAIL_ID_TO_UPDATE, updateDtoForConflict, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID))
                    .rejects.toThrow(StaffAvailabilityConflictError); // Ou .toBe(conflictError)
                expect(mockOverlapDetectionService.checkForConflicts).toHaveBeenCalled();
                expect(db.StaffAvailability.update).not.toHaveBeenCalled();
            });
        };

        testUpdateBlockingConflictScenario(
            'Étend période et chevauche',
            { durationMinutes: 10 * 60, description: "Extending period to cause conflict" } // Ajouter les champs obligatoires si UpdateStaffAvailabilityDto les attend
        );
        testUpdateBlockingConflictScenario(
            'Déplace période et chevauche',
            { effectiveStartDate: '2024-09-30', rruleString: 'DTSTART=20240930T080000;FREQ=DAILY;COUNT=1', description: "Moving period to cause conflict" }
        );

        it('Adv - staffAvailabilityId Inexistant', async () => {
            (db.StaffAvailability.findByPk as jest.Mock).mockReset().mockResolvedValue(null); // Seul le premier findByPk sera appelé
            await expect(staffAvailabilityService.updateStaffAvailability(
                999, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(StaffAvailabilityNotFoundError);
        });

        it('Adv - staffAvailabilityId n appartient pas à establishmentId', async () => {
            // Le findByPk avec include+where ne retournera rien
            (db.StaffAvailability.findByPk as jest.Mock).mockReset().mockResolvedValue(null);
            await expect(staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_OTHER_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(StaffAvailabilityNotFoundError);
        });

        it('Adv - DTO avec rruleString syntaxiquement incorrecte', async () => {
            mockUpdateDto = { rruleString: 'INVALID_RRULE' };
            await expect(staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(StaffAvailabilityCreationError); // Car validateRRuleString lève cette erreur
        });

        it('Adv - DTO avec durationMinutes = 0', async () => {
            mockUpdateDto = { durationMinutes: 0 };
            await expect(staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(StaffAvailabilityCreationError);
        });

        it('Adv - DTO avec effectiveEndDate antérieure à effectiveStartDate', async () => {
            mockUpdateDto = { effectiveStartDate: '2024-10-05', effectiveEndDate: '2024-10-01' };
            await expect(staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(StaffAvailabilityCreationError);
        });

        it('Adv - Échec de staffAvailabilityModel.update (simulé)', async () => {
            (db.StaffAvailability.update as jest.Mock).mockRejectedValue(new Error('DB update failed'));
            mockUpdateDto = { description: 'Trying to update' };
            await expect(staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(StaffAvailabilityUpdateError);
        });

        it('Adv - staffAvailabilityModel.update retourne updateCount = 0 (entité disparue)', async () => {
            (db.StaffAvailability.update as jest.Mock).mockResolvedValue([0, []]); // 0 ligne mise à jour
            // Le re-fetch par findByPk va alors retourner null
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate) // Premier appel OK
                .mockResolvedValueOnce(null); // Re-fetch après update échoue (ne trouve plus l'ID)

            mockUpdateDto = { description: 'Trying to update' };
            await expect(staffAvailabilityService.updateStaffAvailability(
                MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(StaffAvailabilityNotFoundError);
        });


        it('[CHEV] Adv - Conflit Non Bloquant MàJ (TimeOffRequest PENDING)', async () => {
            const potentialConflict: PotentialConflictDetailItem[] = [{
                type: "PENDING_TIMEOFF_REQUEST_OVERLAP", timeOffRequestId: 888, message: "Update conflicts with pending time off."
            }];
            mockConflictCheckForUpdate(false, undefined, potentialConflict);
            mockUpdateDto = { description: "Update with non-blocking conflict" };

            const expectedDataInUpdateCall = {
                description: "Update with non-blocking conflict",
                appliedShiftTemplateRuleId: null, // Détaché
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                potential_conflict_details: potentialConflict, // AJOUTÉ
            };
            const dataForRefetch: StaffAvailabilityAttributes = {
                ...mockExistingAvailabilityData,
                description: "Update with non-blocking conflict",
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                potential_conflict_details: potentialConflict,
                computed_min_start_utc: mockExistingAvailabilityData.computed_min_start_utc,
                computed_max_end_utc: mockExistingAvailabilityData.computed_max_end_utc,
                updatedAt: expect.any(Date) as Date,
            };
            (db.StaffAvailability.findByPk as jest.Mock)
                .mockReset()
                .mockResolvedValueOnce(mockAvailabilityInstanceToUpdate)
                .mockResolvedValueOnce(mockSequelizeModelInstance<StaffAvailabilityAttributes>(dataForRefetch));


            const result = await staffAvailabilityService.updateStaffAvailability(MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID);

            expect(db.StaffAvailability.update).toHaveBeenCalledWith(
                expect.objectContaining(expectedDataInUpdateCall),
                expect.anything()
            );
            expect(result.potential_conflict_details).toEqual(potentialConflict);
        });

        it('[CHEV] Adv - Échec récupération disponibilités existantes (dans OverlapDetectionService pour update)', async () => {
            const internalError = new AppError('InternalServiceError', 500, 'Failed to fetch data for overlap check during update.');
            (mockOverlapDetectionService.checkForConflicts as jest.Mock).mockRejectedValue(internalError);
            mockUpdateDto = { description: "Attempting update" };

            await expect(staffAvailabilityService.updateStaffAvailability(MOCK_AVAIL_ID_TO_UPDATE, mockUpdateDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID))
                .rejects.toThrow(internalError);
            expect(db.StaffAvailability.update).not.toHaveBeenCalled();
        });

    });

    // --- Tests pour deleteStaffAvailability ---
    describe('deleteStaffAvailability', () => {
        // Instance mockée retournée par findOne, sur laquelle .destroy() sera appelée
        let mockAvailabilityInstanceToDelete: ReturnType<typeof mockSequelizeModelInstance<StaffAvailabilityAttributes>>;
        const MOCK_AVAIL_ID_TO_DELETE = MOCK_STAFF_AVAILABILITY_ID_1; // Réutiliser

        beforeEach(() => {
            const existingData: StaffAvailabilityAttributes = {
                id: MOCK_AVAIL_ID_TO_DELETE,
                membershipId: MOCK_TARGET_MEMBERSHIP_ID,
                rruleString: 'FREQ=DAILY;COUNT=1',
                durationMinutes: 60,
                isWorking: true,
                effectiveStartDate: '2024-11-01',
                effectiveEndDate: '2024-11-01',
                description: 'To be deleted',
                appliedShiftTemplateRuleId: null,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                computed_min_start_utc: new Date('2024-11-01T00:00:00Z'), // Ajuster selon rruleString
                computed_max_end_utc: new Date('2024-11-01T01:00:00Z'),   // Ajuster
                potential_conflict_details: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAvailabilityInstanceToDelete = mockSequelizeModelInstance<StaffAvailabilityAttributes>(
                existingData,
                {
                    destroy: jest.fn().mockResolvedValue(undefined) // Par défaut, la suppression réussit
                }
            );
            // Attacher un mock de membership pour la vérification d'establishmentId
            (mockAvailabilityInstanceToDelete as any).membership = mockSequelizeModelInstance<MembershipAttributes>({
                ...mockTargetMembershipAttributes, // Assure que MOCK_TARGET_MEMBERSHIP_ID a le bon establishmentId
                establishmentId: MOCK_ESTABLISHMENT_ID, // Explicitement pour le test
            });


            (db.StaffAvailability.findOne as jest.Mock).mockResolvedValue(mockAvailabilityInstanceToDelete);
        });

        // --- Functional / "Happy Path" ---
        it('Func - Suppression Réussie d\'une Règle Existante et Appartenant à l\'Établissement', async () => {
            // Act
            // Le service deleteStaffAvailability ne retourne rien (void)
            await staffAvailabilityService.deleteStaffAvailability(
                MOCK_AVAIL_ID_TO_DELETE,
                MOCK_ESTABLISHMENT_ID
            );

            // Assert
            expect(db.StaffAvailability.findOne).toHaveBeenCalledWith({
                where: { id: MOCK_AVAIL_ID_TO_DELETE }, // Le service fait findOne
                include: [{ // avec cet include pour vérifier l'establishmentId
                    model: db.Membership,
                    as: 'membership',
                    where: { establishmentId: MOCK_ESTABLISHMENT_ID },
                    required: true
                }]
            });
            expect(mockAvailabilityInstanceToDelete.destroy).toHaveBeenCalledTimes(1);
        });

        // --- Adversarial / Error Handling / "Sad Path" ---
        it('Adv - staffAvailabilityId Inexistant', async () => {
            (db.StaffAvailability.findOne as jest.Mock).mockResolvedValue(null);

            await expect(staffAvailabilityService.deleteStaffAvailability(
                9999, // ID inexistant
                MOCK_ESTABLISHMENT_ID
            )).rejects.toThrow(StaffAvailabilityNotFoundError);
            // S'assurer que destroy n'est pas appelé si l'instance n'est pas trouvée
            expect(mockAvailabilityInstanceToDelete.destroy).not.toHaveBeenCalled();
        });

        it('Adv - staffAvailabilityId Existe mais n appartient pas à establishmentId', async () => {
            // Le findOne avec la clause `where` sur `membership.establishmentId` retournera null
            (db.StaffAvailability.findOne as jest.Mock).mockResolvedValue(null);

            await expect(staffAvailabilityService.deleteStaffAvailability(
                MOCK_AVAIL_ID_TO_DELETE,
                MOCK_OTHER_ESTABLISHMENT_ID // ID d'établissement différent
            )).rejects.toThrow(StaffAvailabilityNotFoundError);
            expect(mockAvailabilityInstanceToDelete.destroy).not.toHaveBeenCalled();
        });

        it('Adv - Échec de instance.destroy() (simulé)', async () => {
            const dbError = new Error('Database deletion failed');
            // Configurer le mock de la méthode destroy sur l'instance spécifique
            (mockAvailabilityInstanceToDelete.destroy as jest.Mock).mockRejectedValue(dbError);
            // S'assurer que findOne retourne bien cette instance pour que .destroy() soit appelé dessus
            (db.StaffAvailability.findOne as jest.Mock).mockResolvedValue(mockAvailabilityInstanceToDelete);

            await expect(staffAvailabilityService.deleteStaffAvailability(
                MOCK_AVAIL_ID_TO_DELETE,
                MOCK_ESTABLISHMENT_ID
            )).rejects.toThrow(dbError); // Le service propage l'erreur originale de destroy
            expect(mockAvailabilityInstanceToDelete.destroy).toHaveBeenCalledTimes(1);
        });

    });

})