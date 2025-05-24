// tests/services/shift-template.unit.test.ts
import { Op, Transaction, Model, Optional } from 'sequelize'; // Model est nécessaire pour typer les mocks
import { ShiftTemplateService } from '../../src/services/shift-template.service';
import { StaffAvailabilityService } from '../../src/services/staff-availability.service';

import { ShiftTemplateRuleOutputDto } from "../../src/dtos/shift-template.validation";
import { ShiftTemplateAttributes, ShiftTemplateRuleAttributes, ShiftTemplateRuleCreationAttributes, ShiftTemplate, ShiftTemplateRule } from '../../src/models/ShiftTemplate';
import StaffAvailability, { StaffAvailabilityCreationAttributes, StaffAvailabilityAttributes } from '../../src/models/StaffAvailability';
import Establishment, { EstablishmentAttributes } from '../../src/models/Establishment';
import Membership, { MembershipAttributes, MembershipRole, MembershipStatus } from '../../src/models/Membership';
import User, { UserAttributes } from '../../src/models/User'; // UserAttributes importé
import {
    CreateShiftTemplateDto,
    UpdateShiftTemplateDto,
    ApplyShiftTemplateDto,
    ShiftTemplateRuleInputDto,
    OverwriteMode,
    ApplyTemplateErrorDetail,
    ShiftTemplateOutputDtoSchema ,
    ListShiftTemplatesQueryDto,
    ShiftTemplateOutputDto
} from '../../src/dtos/shift-template.validation';

import { AppError } from '../../src/errors/app.errors';
import { EstablishmentNotFoundError } from '../../src/errors/establishment.errors';
import { MembershipNotFoundError } from '../../src/errors/membership.errors';
import { ShiftTemplateCreationError, ShiftTemplateNotFoundError, ApplyTemplateError } from '../../src/errors/planning.errors';
import moment from 'moment-timezone';
import db from '../../src/models';

// Typed Mocks pour les modèles Sequelize
// On les type une fois pour toutes
let mockShiftTemplateModel: jest.Mocked<typeof ShiftTemplate>;
let mockShiftTemplateRuleModel: jest.Mocked<typeof ShiftTemplateRule>;
let mockStaffAvailabilityModel: jest.Mocked<typeof StaffAvailability>;
let mockEstablishmentModel: jest.Mocked<typeof Establishment>;
let mockMembershipModel: jest.Mocked<typeof Membership>;
let mockUserModel: jest.Mocked<typeof User>;
let mockTransactionInstance: { commit: jest.Mock, rollback: jest.Mock };
let mockSequelizeTransactionFn: jest.Mock;

// Mock des modèles Sequelize et db.sequelize pour les transactions
jest.mock('../../src/models', () => {
    const originalModule = jest.requireActual('../../src/models'); // Pour garder d'autres exports

    // Créer les mocks des méthodes des modèles en tant que constantes LOCALES à la factory
    const localMockShiftTemplateModel = {
        findByPk: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        findAndCountAll: jest.fn(),
        // destroy est sur l'instance
    } as unknown as jest.Mocked<typeof ShiftTemplate>;

    const localMockShiftTemplateRuleModel = {
        create: jest.fn(),
        destroy: jest.fn(),
    } as unknown as jest.Mocked<typeof ShiftTemplateRule>;

    const localMockStaffAvailabilityModel = {
        destroy: jest.fn(),
        create: jest.fn(),
    } as unknown as jest.Mocked<typeof StaffAvailability>;

    const localMockEstablishmentModel = {
        findByPk: jest.fn(),
    } as unknown as jest.Mocked<typeof Establishment>;

    const localMockMembershipModel = {
        findByPk: jest.fn(),
        findOne: jest.fn(),
        findAll: jest.fn(),
    } as unknown as jest.Mocked<typeof Membership>;

    const localMockUserModel = {
        findByPk: jest.fn(),
    } as unknown as jest.Mocked<typeof User>;

    const localMockTransaction = {
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
    };

    (global as any)._testMockTransactionObject = localMockTransaction

    return {
        __esModule: true,
        default: {
            ShiftTemplate: localMockShiftTemplateModel,
            ShiftTemplateRule: localMockShiftTemplateRuleModel,
            StaffAvailability: localMockStaffAvailabilityModel,
            Establishment: localMockEstablishmentModel,
            Membership: localMockMembershipModel,
            User: localMockUserModel,
            sequelize: {
                transaction: jest.fn(() => Promise.resolve(localMockTransaction)),
            },
            // Exporter les enums si le service ou d'autres parties en ont besoin via db.MembershipRole par exemple
            MembershipRole: originalModule.MembershipRole,
            MembershipStatus: originalModule.MembershipStatus,
        },
    };
});

// Mock StaffAvailabilityService si ShiftTemplateService l'utilise
jest.mock('../../src/services/staff-availability.service');

const mockSequelizeModelInstance = <T extends object>(data: T, methods?: Record<string, jest.Mock>): jest.Mocked<T & Model<T>> => {
    let currentData = { ...data };
    const instance = {
        ...currentData,
        get: jest.fn(function(options?: { plain?: boolean }) {
            if (options?.plain) {
                const plainObject: any = {};
                for (const key in currentData) {
                    if (Object.prototype.hasOwnProperty.call(currentData, key) && typeof (currentData as any)[key] !== 'function') {
                        plainObject[key] = (currentData as any)[key];
                    }
                }
                return plainObject;
            }
            Object.assign(this as any, currentData);
            return this;
        }),
        set: jest.fn(function(keyOrObject: any, value?: any) {
            const dataToUpdate = typeof keyOrObject === 'string' ? { [keyOrObject]: value } : keyOrObject;
            currentData = { ...currentData, ...dataToUpdate };
            Object.assign(this as any, currentData);
            return this;
        }),
        save: jest.fn(async function() {
            Object.assign(currentData, this);
            return Promise.resolve(this);
        }),
        update: jest.fn(async function(values: any) {
            (this as any).set(values);
            return (this as any).save();
        }),
        destroy: jest.fn(async function() {
            return Promise.resolve();
        }),
        toJSON: jest.fn(() => ({ ...currentData })),
        ...methods, // Appliquer les mocks de méthodes spécifiques
    } as unknown as jest.Mocked<T & Model<T>>;

    // S'assurer que les méthodes Sequelize de base sont mockées même si non passées dans `methods`
    Object.keys(instance).forEach(key => {
        if (typeof (instance as any)[key] === 'function' && !(instance as any)[key].mock) {
            (instance as any)[key] = jest.fn((instance as any)[key]);
        }
    });
    return instance;
};

const MOCK_ESTABLISHMENT_ID = 1;
const MOCK_ADMIN_MEMBERSHIP_ID = 101;
const MOCK_ADMIN_USER_ID = 1;

const MOCK_STAFF_MEMBERSHIP_ID_1_CONST = 201;
const MOCK_STAFF_MEMBERSHIP_ID_2_CONST = 202;

const mockActorAdminMembership: MembershipAttributes = {
    id: MOCK_ADMIN_MEMBERSHIP_ID,
    userId: MOCK_ADMIN_USER_ID,
    establishmentId: MOCK_ESTABLISHMENT_ID,
    role: MembershipRole.ADMIN,
    status: MembershipStatus.ACTIVE,
    invitedEmail: null, invitationTokenHash: null, invitationTokenExpiresAt: null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date()
};
const mockAdminUser: UserAttributes = { // Données complètes pour UserAttributes
    id: MOCK_ADMIN_USER_ID,
    username: 'adminUser',
    email: 'admin@example.com',
    email_masked: 'ad***@example.com',
    is_email_active: true,
    is_phone_active: false,
    password: 'hashedpassword',
    is_active: true,
    is_recovering: false,
    is_two_factor_enabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
};
const mockEstablishment: EstablishmentAttributes = {
    id: MOCK_ESTABLISHMENT_ID,
    name: 'Test Establishment',
    timezone: 'Europe/Paris',
    address_line1: '123 Main St', city: 'Testville', postal_code: '12345', country_name: 'Testland', country_code: 'TS',
    siret: '12345678901234', siren: '123456789', owner_id: MOCK_ADMIN_USER_ID, is_validated: true,
    createdAt: new Date(), updatedAt: new Date()
};

const mockStaffMembership1Data: MembershipAttributes = { id: MOCK_STAFF_MEMBERSHIP_ID_1_CONST, establishmentId: MOCK_ESTABLISHMENT_ID, userId: 301, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, invitedEmail:null, invitationTokenHash:null, invitationTokenExpiresAt:null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }; // Ajout description: null si MembershipAttributes l'a
const mockStaffUser1Data: UserAttributes = { id: 301, username: 'staffUser1', email: 'staff1@example.com', /* ... autres champs UserAttributes ... */ email_masked: 'st***@example.com', is_email_active: true, is_phone_active: false, password:'p', is_active:true, is_recovering:false, is_two_factor_enabled:false };

const mockStaffMembership2Data: MembershipAttributes = { id: MOCK_STAFF_MEMBERSHIP_ID_2_CONST, establishmentId: MOCK_ESTABLISHMENT_ID, userId: 302, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, invitedEmail:null, invitationTokenHash:null, invitationTokenExpiresAt:null, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
const mockStaffUser2Data: UserAttributes = { id: 302, username: 'staffUser2', email: 'staff2@example.com', /* ... autres champs UserAttributes ... */ email_masked: 'st***@example.com', is_email_active: true, is_phone_active: false, password:'p', is_active:true, is_recovering:false, is_two_factor_enabled:false };

const mockApplyDtoBase: ApplyShiftTemplateDto = {
    targetMembershipIds: [MOCK_STAFF_MEMBERSHIP_ID_1_CONST],
    applicationStartDate: '2025-01-06',
    applicationEndDate: '2025-01-10',
    overwriteMode: OverwriteMode.REPLACE_ALL_IN_PERIOD,
};

// Déclaration du service qui sera testé
let shiftTemplateService: ShiftTemplateService;
let mockStaffAvailabilityServiceInstance: jest.Mocked<StaffAvailabilityService>;


// Englober tous les tests du service dans un describe principal
describe('ShiftTemplateService', () => {

    beforeEach(() => {
        mockShiftTemplateModel = db.ShiftTemplate as jest.Mocked<typeof ShiftTemplate>;
        mockShiftTemplateRuleModel = db.ShiftTemplateRule as jest.Mocked<typeof ShiftTemplateRule>;
        mockStaffAvailabilityModel = db.StaffAvailability as jest.Mocked<typeof StaffAvailability>;
        mockEstablishmentModel = db.Establishment as jest.Mocked<typeof Establishment>;
        mockMembershipModel = db.Membership as jest.Mocked<typeof Membership>;
        mockUserModel = db.User as jest.Mocked<typeof User>;

        // @ts-ignore Accès à une propriété mockée interne pour mockTransactionInstance
        mockTransactionInstance = (global as any)._testMockTransactionObject || {
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
        };
        // Fallback si la récupération du mock interne échoue

        // S'assurer que la fonction transaction elle-même est un mock jest pour vérifier les appels
        mockSequelizeTransactionFn = db.sequelize.transaction as jest.Mock;
        mockSequelizeTransactionFn.mockClear(); // Effacer les appels précédents
        mockTransactionInstance.commit.mockClear();
        mockTransactionInstance.rollback.mockClear();
        // Configurer pour retourner notre instance de transaction mockée
        mockSequelizeTransactionFn.mockImplementation(() => Promise.resolve(mockTransactionInstance));


        // Réinitialiser les compteurs d'appels et les implémentations pour chaque mock de modèle
        Object.values(mockShiftTemplateModel).forEach(mockFn => typeof mockFn === 'function' && mockFn.mockClear());
        Object.values(mockShiftTemplateRuleModel).forEach(mockFn => typeof mockFn === 'function' && mockFn.mockClear());
        Object.values(mockStaffAvailabilityModel).forEach(mockFn => typeof mockFn === 'function' && mockFn.mockClear());
        Object.values(mockEstablishmentModel).forEach(mockFn => typeof mockFn === 'function' && mockFn.mockClear());
        Object.values(mockMembershipModel).forEach(mockFn => typeof mockFn === 'function' && mockFn.mockClear());
        Object.values(mockUserModel).forEach(mockFn => typeof mockFn === 'function' && mockFn.mockClear());


        mockStaffAvailabilityServiceInstance = new (StaffAvailabilityService as jest.Mock<StaffAvailabilityService>)() as jest.Mocked<StaffAvailabilityService>;
        shiftTemplateService = new ShiftTemplateService(mockStaffAvailabilityServiceInstance);

        mockMembershipModel.findByPk.mockImplementation(async (id) => {
            if (id === mockActorAdminMembership.id) {
                const adminMembershipInstance = mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership);
                (adminMembershipInstance as any).user = mockSequelizeModelInstance<UserAttributes>(mockAdminUser);
                return adminMembershipInstance;
            }
            if (id === MOCK_STAFF_MEMBERSHIP_ID_1_CONST) {
                const staffMembershipInstance = mockSequelizeModelInstance<MembershipAttributes>(mockStaffMembership1Data);
                (staffMembershipInstance as any).user = mockSequelizeModelInstance<UserAttributes>(mockStaffUser1Data);
                return staffMembershipInstance;
            }
            if (id === MOCK_STAFF_MEMBERSHIP_ID_2_CONST) {
                const staffMembershipInstance = mockSequelizeModelInstance<MembershipAttributes>(mockStaffMembership2Data);
                (staffMembershipInstance as any).user = mockSequelizeModelInstance<UserAttributes>(mockStaffUser2Data);
                return staffMembershipInstance;
            }
            return null;
        });
        mockUserModel.findByPk.mockResolvedValue(mockSequelizeModelInstance<UserAttributes>(mockAdminUser)); // Pour le créateur
    });

    describe('createShiftTemplate', () => {
        const ruleDto1: ShiftTemplateRuleInputDto = {
            rruleString: 'FREQ=DAILY;DTSTART=T090000',
            durationMinutes: 60,
            isWorking: true,
            ruleDescription: 'Morning rule'
        };
        const ruleDto2: ShiftTemplateRuleInputDto = {
            rruleString: 'FREQ=WEEKLY;BYDAY=MO;DTSTART=T140000',
            durationMinutes: 120,
            isWorking: false,
            ruleDescription: 'Afternoon break'
        };
        const createDto: CreateShiftTemplateDto = {
            name: 'Test Template',
            description: 'A template for testing',
            rules: [ruleDto1, ruleDto2]
        };

        it('Func - Scénario 1: Création Réussie avec plusieurs règles', async () => {
            // Arrange
            mockShiftTemplateModel.findOne.mockResolvedValue(null); // Pas de template existant avec ce nom

            const mockCreatedTemplateInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>({
                id: 1,
                name: createDto.name,
                description: createDto.description ?? null,
                establishmentId: mockActorAdminMembership.establishmentId,
                createdByMembershipId: mockActorAdminMembership.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            mockShiftTemplateModel.create.mockResolvedValue(mockCreatedTemplateInstance);

            const mockCreatedRuleInstance1 = mockSequelizeModelInstance<ShiftTemplateRuleAttributes>({
                id: 10,
                shiftTemplateId: 1,
                rruleString: ruleDto1.rruleString,
                durationMinutes: ruleDto1.durationMinutes,
                isWorking: ruleDto1.isWorking,
                ruleDescription: ruleDto1.ruleDescription ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            const mockCreatedRuleInstance2 = mockSequelizeModelInstance<ShiftTemplateRuleAttributes>({
                id: 11,
                shiftTemplateId: 1,
                rruleString: ruleDto2.rruleString,
                durationMinutes: ruleDto2.durationMinutes,
                isWorking: ruleDto2.isWorking,
                ruleDescription: ruleDto2.ruleDescription ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            mockShiftTemplateRuleModel.create
                .mockResolvedValueOnce(mockCreatedRuleInstance1)
                .mockResolvedValueOnce(mockCreatedRuleInstance2);

            // *** CORRECTION DU MOCK POUR mockMembershipModel.findByPk ***
            const mockCreatorMembershipInstance = mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership);
            const mockCreatorUserInstance = mockSequelizeModelInstance<UserAttributes>(mockAdminUser);
            // Simuler l'association 'user' chargée par 'include'
            (mockCreatorMembershipInstance as any).user = mockCreatorUserInstance;

            mockMembershipModel.findByPk.mockImplementation(async (id, options) => {
                if (id === mockActorAdminMembership.id) { // ou newTemplate.createdByMembershipId qui est mockActorAdminMembership.id
                    // Vérifier si l'option include est présente et correcte (optionnel mais bon pour la robustesse du mock)
                    if (options && options.include && (options.include as any[]).some(inc => (inc as any).model === db.User && (inc as any).as === 'user')) {
                        return mockCreatorMembershipInstance;
                    }
                    // Retourner sans user si include n'est pas demandé (ne devrait pas arriver pour ce test)
                    return mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership);
                }
                return null;
            });
            // *** FIN DE LA CORRECTION DU MOCK ***

            // Act
            const result = await shiftTemplateService.createShiftTemplate(createDto, mockActorAdminMembership);

            // Assert
            expect(result).toBeDefined();
            expect(result.id).toBe(1);
            expect(result.name).toBe(createDto.name);
            expect(result.description).toBe(createDto.description);
            expect(result.establishmentId).toBe(mockActorAdminMembership.establishmentId);
            expect(result.createdByMembershipId).toBe(mockActorAdminMembership.id);

            expect(result.creator).toBeDefined(); // Vérifier que creator n'est pas undefined
            expect(result.creator?.username).toBe(mockAdminUser.username); // Assertion qui échouait

            expect(result.rules).toHaveLength(2);
            expect(result.rules[0]).toMatchObject({
                id: 10,
                shiftTemplateId: 1,
                rruleString: ruleDto1.rruleString,
                durationMinutes: ruleDto1.durationMinutes,
                isWorking: ruleDto1.isWorking,
                ruleDescription: ruleDto1.ruleDescription ?? null
                // createdAt et updatedAt ne sont pas dans ruleDto1, donc pas dans toMatchObject ici
            });
            expect(result.rules[1]).toMatchObject({
                id: 11,
                shiftTemplateId: 1,
                rruleString: ruleDto2.rruleString,
                durationMinutes: ruleDto2.durationMinutes,
                isWorking: ruleDto2.isWorking,
                ruleDescription: ruleDto2.ruleDescription ?? null
            });

            expect(mockSequelizeTransactionFn).toHaveBeenCalledTimes(1); // Vérifier que la fonction transaction a été appelée
            expect(mockShiftTemplateModel.create).toHaveBeenCalledWith(
                {
                    name: createDto.name,
                    description: createDto.description,
                    establishmentId: mockActorAdminMembership.establishmentId,
                    createdByMembershipId: mockActorAdminMembership.id,
                },
                { transaction: mockTransactionInstance } // Vérifier que l'instance de transaction est passée
            );
            expect(mockShiftTemplateRuleModel.create).toHaveBeenCalledTimes(2);
            expect(mockShiftTemplateRuleModel.create).toHaveBeenCalledWith(
                { shiftTemplateId: 1, ...ruleDto1 }, { transaction: mockTransactionInstance }
            );
            expect(mockShiftTemplateRuleModel.create).toHaveBeenCalledWith(
                { shiftTemplateId: 1, ...ruleDto2 }, { transaction: mockTransactionInstance }
            );
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
            expect(mockTransactionInstance.rollback).not.toHaveBeenCalled();
        });

        it('Func - Scénario 2: Création avec description nulle', async () => {
            const dtoWithoutDesc: CreateShiftTemplateDto = { ...createDto, description: null };
            mockShiftTemplateModel.findOne.mockResolvedValue(null);
            const mockCreatedInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>({
                id: 2,
                name: dtoWithoutDesc.name,
                description: dtoWithoutDesc.description ?? null,
                establishmentId: mockActorAdminMembership.establishmentId,
                createdByMembershipId: mockActorAdminMembership.id,
            });
            mockShiftTemplateModel.create.mockResolvedValue(mockCreatedInstance);
            mockShiftTemplateRuleModel.create.mockResolvedValue(mockSequelizeModelInstance<ShiftTemplateRuleAttributes>({id: 12, shiftTemplateId:2, ...ruleDto1, ruleDescription: ruleDto1.ruleDescription ?? null}));

            mockMembershipModel.findByPk.mockResolvedValue(mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership, {
                getUser: jest.fn().mockResolvedValue(mockSequelizeModelInstance<UserAttributes>(mockAdminUser))
            }));

            const result = await shiftTemplateService.createShiftTemplate(dtoWithoutDesc, mockActorAdminMembership);

            expect(result.description).toBeNull();
            expect(mockShiftTemplateModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ description: null }),
                expect.anything()
            );
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });

        it('Edge - Scénario 1: Nom de Template à Longueur Maximale (100 chars)', async () => {
            const longName = 'a'.repeat(100);
            const dtoWithLongName: CreateShiftTemplateDto = { ...createDto, name: longName, rules: [ruleDto1] }; // Une seule règle pour simplifier
            mockShiftTemplateModel.findOne.mockResolvedValue(null);
            const mockCreatedInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>({
                id: 3,
                name: dtoWithLongName.name,
                description: dtoWithLongName.description ?? null,
                establishmentId: mockActorAdminMembership.establishmentId,
                createdByMembershipId: mockActorAdminMembership.id,
            });
            mockShiftTemplateModel.create.mockResolvedValue(mockCreatedInstance);
            mockShiftTemplateRuleModel.create.mockResolvedValue(mockSequelizeModelInstance<ShiftTemplateRuleAttributes>({id:13, shiftTemplateId:3, ...ruleDto1, ruleDescription: ruleDto1.ruleDescription ?? null}));

            mockMembershipModel.findByPk.mockResolvedValue(mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership, {
                getUser: jest.fn().mockResolvedValue(mockSequelizeModelInstance<UserAttributes>(mockAdminUser))
            }));


            const result = await shiftTemplateService.createShiftTemplate(dtoWithLongName, mockActorAdminMembership);
            expect(result.name).toBe(longName);
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });

        it('Adv - Scénario 1: Nom de Template Dupliqué', async () => {
            // Arrange
            const existingTemplateData: ShiftTemplateAttributes = {
                id: 99,
                name: createDto.name, // Même nom que createDto
                establishmentId: mockActorAdminMembership.establishmentId,
                createdByMembershipId: mockActorAdminMembership.id,
                description: "An existing template", // Assurer la présence de description
                createdAt: new Date(), // Assurer présence
                updatedAt: new Date(), // Assurer présence
            };
            // Simuler qu'un template avec ce nom existe déjà
            mockShiftTemplateModel.findOne.mockResolvedValue(mockSequelizeModelInstance<ShiftTemplateAttributes>(existingTemplateData));

            // Act & Assert
            await expect(shiftTemplateService.createShiftTemplate(createDto, mockActorAdminMembership))
                .rejects
                .toThrow(ShiftTemplateCreationError); // Vérifier que l'erreur attendue est levée

            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledWith({
                where: { name: createDto.name, establishmentId: mockActorAdminMembership.establishmentId },
            });
            expect(mockShiftTemplateModel.create).not.toHaveBeenCalled(); // create ne doit pas être appelé

            // *** CORRECTION : La transaction n'est pas démarrée si le nom est dupliqué avant ***
            expect(mockSequelizeTransactionFn).not.toHaveBeenCalled(); // Vérifier que transaction() n'a pas été appelée
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
            expect(mockTransactionInstance.rollback).not.toHaveBeenCalled(); // Pas de rollback car pas de transaction démarrée
        });

        it('Adv - Scénario 2: Échec de la création de ShiftTemplateRule (simulé)', async () => {
            mockShiftTemplateModel.findOne.mockResolvedValue(null);
            const mockCreatedTemplateInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>({
                id: 5,
                name: createDto.name,
                description: createDto.description ?? null,
                establishmentId: mockActorAdminMembership.establishmentId,
                createdByMembershipId: mockActorAdminMembership.id,
            });
            mockShiftTemplateModel.create.mockResolvedValue(mockCreatedTemplateInstance);

            mockShiftTemplateRuleModel.create.mockRejectedValueOnce(new Error("DB error creating rule")); // Simuler un échec

            await expect(shiftTemplateService.createShiftTemplate(createDto, mockActorAdminMembership))
                .rejects
                .toThrow(ShiftTemplateCreationError); // Ou une AppError générique selon la gestion d'erreur

            expect(mockTransactionInstance.rollback).toHaveBeenCalledTimes(1);
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
        });
    });

    describe('getShiftTemplateById', () => {
        const existingTemplateId = 1;
        const nonExistingTemplateId = 999;
        const otherEstablishmentId = MOCK_ESTABLISHMENT_ID + 1;

        const mockRule1Data: ShiftTemplateRuleAttributes = {
            id: 101,
            shiftTemplateId: existingTemplateId,
            rruleString: 'FREQ=DAILY;DTSTART=T090000',
            durationMinutes: 240,
            isWorking: true,
            ruleDescription: 'Morning Shift Rule',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockTemplateData: ShiftTemplateAttributes = {
            id: existingTemplateId,
            name: 'Morning Template',
            description: 'Standard morning shift template',
            establishmentId: MOCK_ESTABLISHMENT_ID,
            createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Mock de l'instance du créateur (Membership) avec son User associé
        const mockCreatorInstance = mockSequelizeModelInstance<MembershipAttributes>(
            { ...mockActorAdminMembership }, // Utiliser les données de l'admin acteur comme base
            {
                // La méthode 'get' sur le mock de User doit retourner le plain object
                // L'association 'user' sera résolue par l'include dans findOne
            }
        );
        // Le mock de User doit être configuré pour retourner l'instance de User lorsque
        // MembershipModel.findByPk inclut l'association 'user'.
        // Dans le beforeEach global, mockUserModel.findByPk est déjà configuré.

        it('Func - Scénario 1: Récupération Réussie d\'un template existant appartenant à l\'établissement', async () => {
            // Arrange
            const mockTemplateInstanceWithAssociations = mockSequelizeModelInstance<ShiftTemplateAttributes>(
                mockTemplateData
            );
            // Attacher les associations simulées
            (mockTemplateInstanceWithAssociations as any).rules = [
                mockSequelizeModelInstance<ShiftTemplateRuleAttributes>({ ...mockRule1Data, shiftTemplateId: existingTemplateId })
            ];
            const creatorInstance = mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership);
            (creatorInstance as any).user = mockSequelizeModelInstance<UserAttributes>(mockAdminUser);
            (mockTemplateInstanceWithAssociations as any).creator = creatorInstance;

            mockShiftTemplateModel.findOne.mockResolvedValue(mockTemplateInstanceWithAssociations);

            // Act
            const result = await shiftTemplateService.getShiftTemplateById(existingTemplateId, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(result).toBeDefined();
            expect(result).not.toBeNull();
            if (!result) throw new Error("Test failed: result is null");

            expect(result.id).toEqual(existingTemplateId);
            expect(result.name).toEqual(mockTemplateData.name);
            expect(result.establishmentId).toEqual(MOCK_ESTABLISHMENT_ID);
            expect(result.rules).toHaveLength(1);
            // Assurez-vous que mockRule1Data inclut shiftTemplateId ou que la comparaison l'ignore au besoin
            const expectedRuleOutput = {
                ...mockRule1Data,
                ruleDescription: mockRule1Data.ruleDescription ?? null,
                createdAt: mockRule1Data.createdAt ? new Date(mockRule1Data.createdAt) : undefined, // Convertir en Date si nécessaire
                updatedAt: mockRule1Data.updatedAt ? new Date(mockRule1Data.updatedAt) : undefined,
            };
            delete (expectedRuleOutput as any).createdAt; // Si le DTO ne les a pas comme requis
            delete (expectedRuleOutput as any).updatedAt; // Si le DTO ne les a pas comme requis

            expect(result.rules[0]).toMatchObject(expectedRuleOutput);

            expect(result.creator).toBeDefined();
            expect(result.creator?.username).toEqual(mockAdminUser.username);

            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledTimes(1);
            // *** CORRECTION DE L'ASSERTION toHaveBeenCalledWith ***
            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledWith({
                where: { id: existingTemplateId, establishmentId: MOCK_ESTABLISHMENT_ID },
                include: [
                    { model: mockShiftTemplateRuleModel, as: 'rules' }, // Utiliser le mock du modèle
                    {
                        model: mockMembershipModel, // Utiliser le mock du modèle
                        as: 'creator',
                        include: [{ model: mockUserModel, as: 'user', attributes: ['username'] }] // Utiliser le mock du modèle
                    }
                ],
            });
        });

        it('Func - Scénario 2: Tentative de récupération d\'un template sans règles (template existe, rules est un tableau vide)', async () => {
            // Arrange
            const templateDataWithoutRulesAttributes: ShiftTemplateAttributes = {
                // Utiliser les attributs de mockTemplateData mais sans les règles, et s'assurer que 'description' est explicitement null si c'est le cas.
                id: 2, // ID spécifique pour ce test
                name: 'Template Without Rules',
                description: null, // Ou une description spécifique
                establishmentId: MOCK_ESTABLISHMENT_ID,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockTemplateInstanceWithoutRules = mockSequelizeModelInstance<ShiftTemplateAttributes>(
                templateDataWithoutRulesAttributes // Ne contient que les attributs directs
            );

            // *** CORRECTION : Attacher explicitement un tableau de règles vide ***
            (mockTemplateInstanceWithoutRules as any).rules = [];

            // Attacher l'association creator (car le DTO de sortie peut l'attendre)
            const creatorInstanceForEmptyRules = mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership);
            const adminUserInstanceForEmptyRules = mockSequelizeModelInstance<UserAttributes>(mockAdminUser);
            (creatorInstanceForEmptyRules as any).user = adminUserInstanceForEmptyRules;
            (mockTemplateInstanceWithoutRules as any).creator = creatorInstanceForEmptyRules;

            mockShiftTemplateModel.findOne.mockResolvedValue(mockTemplateInstanceWithoutRules);

            // Act
            const result = await shiftTemplateService.getShiftTemplateById(2, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(result).toBeDefined();
            expect(result).not.toBeNull();
            if (!result) throw new Error("Test failed: result is null");

            expect(result.id).toEqual(2);
            expect(result.rules).toEqual([]); // L'assertion devrait maintenant passer
            expect(result.creator?.username).toBe(mockAdminUser.username); // Vérifier que le créateur est toujours là
            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledTimes(1); // S'assurer qu'il a été appelé une seule fois pour ce test
        });

        it('Adv - Scénario 1: `templateId` Inexistant', async () => {
            // Arrange
            mockShiftTemplateModel.findOne.mockResolvedValue(null);

            // Act
            const result = await shiftTemplateService.getShiftTemplateById(nonExistingTemplateId, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(result).toBeNull();
            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: nonExistingTemplateId, establishmentId: MOCK_ESTABLISHMENT_ID },
                })
            );
        });

        it('Adv - Scénario 2: `templateId` Existant mais n\'appartenant pas à l\'`establishmentId` fourni', async () => {
            // Arrange
            // findOne avec where: { id: existingTemplateId, establishmentId: otherEstablishmentId } ne trouvera rien
            // si le template avec existingTemplateId appartient à MOCK_ESTABLISHMENT_ID.
            // Le service appelle findOne avec l'establishmentId fourni. Si le template n'y appartient pas, findOne retourne null.
            mockShiftTemplateModel.findOne.mockResolvedValue(null);

            // Act
            const result = await shiftTemplateService.getShiftTemplateById(existingTemplateId, otherEstablishmentId);

            // Assert
            expect(result).toBeNull();
            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: existingTemplateId, establishmentId: otherEstablishmentId },
                })
            );
        });
    });

    describe('listShiftTemplatesForEstablishment', () => {
        const defaultListQueryDto: ListShiftTemplatesQueryDto = {
            page: 1,
            limit: 10,
            sortBy: 'name',
            sortOrder: 'asc',
        };

        const mockTemplateDataA: ShiftTemplateAttributes = {
            id: 1, name: 'Template Alpha', establishmentId: MOCK_ESTABLISHMENT_ID,
            createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
            description: null,
            createdAt: new Date(2023, 0, 1), updatedAt: new Date(2023, 0, 1)
        };
        const mockTemplateDataB: ShiftTemplateAttributes = {
            id: 2, name: 'Template Beta', establishmentId: MOCK_ESTABLISHMENT_ID,
            createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID, description: 'Beta desc', createdAt: new Date(2023, 0, 2), updatedAt: new Date(2023, 0, 2)
        };
        const mockTemplateDataC: ShiftTemplateAttributes = {
            id: 3, name: 'Charlie Template', establishmentId: MOCK_ESTABLISHMENT_ID,
            createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID, description: 'Charlie desc', createdAt: new Date(2023, 0, 3), updatedAt: new Date(2023, 0, 3)
        };

        it('Func - Scénario 1: Liste avec Plusieurs Templates, sans filtres ni tri spécifique (défauts)', async () => {
            const mockTemplates = [mockTemplateDataA, mockTemplateDataB];
            const mockInstances = mockTemplates.map(data => {
                const shiftTemplateInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>(data);
                const creatorMembershipInstance = mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership);
                const adminUserInstance = mockSequelizeModelInstance<UserAttributes>(mockAdminUser);
                (creatorMembershipInstance as any).user = adminUserInstance;
                (shiftTemplateInstance as any).creator = creatorMembershipInstance;
                (shiftTemplateInstance as any).rules = [];

                return shiftTemplateInstance;
            });

            mockShiftTemplateModel.findAndCountAll.mockResolvedValue({
                count: [{ count: mockTemplates.length }],
                rows: mockInstances,
            });

            // Act
            const result = await shiftTemplateService.listShiftTemplatesForEstablishment(MOCK_ESTABLISHMENT_ID, defaultListQueryDto);

            // Assert
            expect(result).toBeDefined();
            expect(result.data).toHaveLength(2);
            expect(result.meta.totalItems).toBe(2);
            expect(result.meta.currentPage).toBe(1);
            expect(result.meta.itemsPerPage).toBe(10);
            expect(result.meta.totalPages).toBe(1);
            expect(result.data[0].name).toBe(mockTemplateDataA.name);
            expect(result.data[0].rules).toEqual([]);
            expect(result.data[0].creator?.username).toBe(mockAdminUser.username);

            expect(mockShiftTemplateModel.findAndCountAll).toHaveBeenCalledWith({
                where: { establishmentId: MOCK_ESTABLISHMENT_ID },
                include: [
                    {
                        model: mockMembershipModel,
                        as: 'creator',
                        include: [{
                            model: mockUserModel,
                            as: 'user',
                            attributes: ['username']
                        }]
                    }
                ],
                limit: 10,
                offset: 0,
                order: [['name', 'ASC']],
            });
        });

        it('Func - Scénario 2: Liste avec Pagination (page 2, limit 1)', async () => {
            const mockTemplatesAll = [mockTemplateDataA, mockTemplateDataB, mockTemplateDataC];
            const shiftTemplateInstanceForPage2 = mockSequelizeModelInstance<ShiftTemplateAttributes>(mockTemplateDataB);

            const creatorMembershipInstanceForPage2 = mockSequelizeModelInstance<MembershipAttributes>(mockActorAdminMembership);
            const adminUserInstanceForPage2 = mockSequelizeModelInstance<UserAttributes>(mockAdminUser);
            (creatorMembershipInstanceForPage2 as any).user = adminUserInstanceForPage2;
            (shiftTemplateInstanceForPage2 as any).creator = creatorMembershipInstanceForPage2;
            (shiftTemplateInstanceForPage2 as any).rules = [];

            const mockInstancesPage2 = [shiftTemplateInstanceForPage2];

            mockShiftTemplateModel.findAndCountAll.mockResolvedValue({
                count: [{ count: mockTemplatesAll.length }],
                rows: mockInstancesPage2,
            });
            const queryPage2: ListShiftTemplatesQueryDto = { ...defaultListQueryDto, page: 2, limit: 1 };

            // Act
            const result = await shiftTemplateService.listShiftTemplatesForEstablishment(MOCK_ESTABLISHMENT_ID, queryPage2);

            // Assert
            expect(result.data).toHaveLength(1);
            expect(result.data[0].name).toBe(mockTemplateDataB.name);
            expect(result.meta.totalItems).toBe(3);
            expect(result.meta.currentPage).toBe(2);
            expect(result.meta.itemsPerPage).toBe(1);
            expect(result.meta.totalPages).toBe(3);
            expect(mockShiftTemplateModel.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    limit: 1,
                    offset: 1, // (2 - 1) * 1
                    order: [['name', 'ASC']],
                })
            );
        });

        it('Func - Scénario 3: Liste avec Tri (createdAt DESC)', async () => {
            // Arrange
            mockShiftTemplateModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] }); // Le contenu exact des rows n'importe pas ici
            const querySort: ListShiftTemplatesQueryDto = { ...defaultListQueryDto, sortBy: 'createdAt', sortOrder: 'desc' };

            // Act
            await shiftTemplateService.listShiftTemplatesForEstablishment(MOCK_ESTABLISHMENT_ID, querySort);

            // Assert
            expect(mockShiftTemplateModel.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    order: [['createdAt', 'DESC']],
                })
            );
        });

        it('Func - Scénario 4: Liste avec Recherche (search sur name)', async () => {
            // Arrange
            mockShiftTemplateModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] });
            const searchTerm = 'Alpha';
            const querySearch: ListShiftTemplatesQueryDto = { ...defaultListQueryDto, search: searchTerm };

            // Act
            await shiftTemplateService.listShiftTemplatesForEstablishment(MOCK_ESTABLISHMENT_ID, querySearch);

            // Assert
            expect(mockShiftTemplateModel.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        establishmentId: MOCK_ESTABLISHMENT_ID,
                        name: { [Op.iLike]: `%${searchTerm}%` }, // Op.iLike pour case-insensitive (Postgres)
                                                                 // Pour MySQL, Op.like est case-insensitive par défaut sur beaucoup de collations
                    },
                })
            );
        });

        it('Func - Scénario 5: Liste pour Établissement sans Template', async () => {
            // Arrange
            mockShiftTemplateModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] });

            // Act
            const result = await shiftTemplateService.listShiftTemplatesForEstablishment(MOCK_ESTABLISHMENT_ID, defaultListQueryDto);

            // Assert
            expect(result.data).toHaveLength(0);
            expect(result.meta.totalItems).toBe(0);
            expect(result.meta.totalPages).toBe(0);
            expect(result.meta.currentPage).toBe(1);
        });

        it('Edge - Scénario 1: Limite de Pagination Maximale (100)', async () => {
            // Arrange
            mockShiftTemplateModel.findAndCountAll.mockResolvedValue({ count: [{ count: 0 }], rows: [] });
            const queryMaxLimit: ListShiftTemplatesQueryDto = { ...defaultListQueryDto, limit: 100 };

            // Act
            await shiftTemplateService.listShiftTemplatesForEstablishment(MOCK_ESTABLISHMENT_ID, queryMaxLimit);

            // Assert
            expect(mockShiftTemplateModel.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    limit: 100,
                })
            );
        });
    });

    describe('updateShiftTemplate', () => {
        const templateIdToUpdate = 1;
        const originalTemplateData: ShiftTemplateAttributes & { rules: ShiftTemplateRuleAttributes[] } = {
            id: templateIdToUpdate,
            name: 'Original Template Name',
            description: 'Original description.',
            establishmentId: MOCK_ESTABLISHMENT_ID,
            createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
            createdAt: new Date('2023-01-01T10:00:00Z'),
            updatedAt: new Date('2023-01-01T10:00:00Z'),
            rules: [
                { id: 101, shiftTemplateId: templateIdToUpdate, rruleString: 'FREQ=DAILY;DTSTART=T080000', durationMinutes: 120, isWorking: true, ruleDescription: 'Rule Original 1', createdAt: new Date(), updatedAt: new Date() },
            ],
        };

        let mockExistingTemplateInstance: jest.Mocked<ShiftTemplate & {
            rules: jest.Mocked<ShiftTemplateRule>[],
            creator: jest.Mocked<Membership & { user?: jest.Mocked<User> }>
        }>;

        let rulesPassedToUpdate: ShiftTemplateRuleInputDto[] | undefined;

        beforeEach(() => {
            const rulesData = [
                { id: 101, shiftTemplateId: templateIdToUpdate, rruleString: 'FREQ=DAILY;DTSTART=T080000', durationMinutes: 120, isWorking: true, ruleDescription: 'Rule Original 1', createdAt: new Date(), updatedAt: new Date() },
            ];
            const mockedRules = rulesData.map(r => mockSequelizeModelInstance<ShiftTemplateRuleAttributes>(r)) as jest.Mocked<ShiftTemplateRule>[];

            const adminUserData = { ...mockAdminUser };
            const mockedAdminUser = mockSequelizeModelInstance<UserAttributes>(adminUserData);

            const creatorData = { ...mockActorAdminMembership };
            const mockedCreator = mockSequelizeModelInstance<MembershipAttributes>(creatorData, {
                // Simuler l'objet user s'il est inclus
            }) as jest.Mocked<Membership & { user?: jest.Mocked<User> }>;
            // @ts-ignore // Permettre d'assigner l'association
            mockedCreator.user = mockedAdminUser;


            const existingTemplatePlainData = {
                id: templateIdToUpdate,
                name: 'Original Template Name',
                description: 'Original description.',
                establishmentId: MOCK_ESTABLISHMENT_ID,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                createdAt: new Date('2023-01-01T10:00:00Z'),
                updatedAt: new Date('2023-01-01T10:00:00Z'),
            };

            mockExistingTemplateInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>(
                existingTemplatePlainData
            ) as jest.Mocked<ShiftTemplate & { rules: jest.Mocked<ShiftTemplateRule>[], creator: jest.Mocked<Membership & { user?: jest.Mocked<User> }> }>;

            (mockExistingTemplateInstance as any).rules = mockedRules;
            const creatorWithUserForUpdate = mockSequelizeModelInstance<MembershipAttributes>(creatorData);
            (creatorWithUserForUpdate as any).user = mockedAdminUser;
            (mockExistingTemplateInstance as any).creator = creatorWithUserForUpdate;


            // Configurer findOne pour retourner cette instance pour le templateId et establishmentId corrects
            mockShiftTemplateModel.findOne.mockImplementation(async (options) => {
                if (options?.where && (options.where as any).id === templateIdToUpdate && (options.where as any).establishmentId === MOCK_ESTABLISHMENT_ID) {
                    return mockExistingTemplateInstance;
                }
                // Pour la vérification d'unicité du nom
                if (options?.where && (options.where as any).name && (options.where as any).establishmentId === MOCK_ESTABLISHMENT_ID && (options.where as any).id?.[Op.ne] === templateIdToUpdate) {
                    // Simuler aucun conflit par défaut pour les tests de MàJ de nom
                    return null;
                }
                return null;
            });

            rulesPassedToUpdate = undefined;
            // Mock pour le re-fetch à la fin de updateShiftTemplate
            // Cette partie simule le getShiftTemplateById appelé en interne par updateShiftTemplate
            // (directement ou indirectement) pour retourner le DTO complet.
            // S'assurer que ce mock retourne une structure similaire à ce que getShiftTemplateById retournerait.
            // Ce mock est crucial car updateShiftTemplate appelle this.getShiftTemplateById.
            jest.spyOn(shiftTemplateService, 'getShiftTemplateById')
                .mockImplementation(async (idToFetch: number, establishmentIdToFetch: number): Promise<ShiftTemplateOutputDto | null> => {
                    if (idToFetch === templateIdToUpdate && establishmentIdToFetch === MOCK_ESTABLISHMENT_ID) {
                        const updatedName = (mockExistingTemplateInstance as any).name as string;
                        const updatedDescription = (mockExistingTemplateInstance as any).description as string | null;
                        const actualUpdatedAtValue = (mockExistingTemplateInstance as any).updatedAt;
                        const actualUpdatedAt = actualUpdatedAtValue instanceof Date ? actualUpdatedAtValue : new Date();


                        let finalRulesForOutput: ShiftTemplateRuleOutputDto[];
                        if (rulesPassedToUpdate) {
                            finalRulesForOutput = rulesPassedToUpdate.map((inputRule, index) => ({
                                id: 9000 + index,
                                shiftTemplateId: templateIdToUpdate,
                                rruleString: inputRule.rruleString,
                                durationMinutes: inputRule.durationMinutes,
                                isWorking: inputRule.isWorking,
                                ruleDescription: inputRule.ruleDescription ?? null,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            }));
                        } else {
                            finalRulesForOutput = ((mockExistingTemplateInstance as any).rules || []).map((dbRule: any) => {
                                const plainRule = dbRule.get ? dbRule.get({ plain: true }) : dbRule;
                                const ruleCreatedAt = plainRule.createdAt;
                                const ruleUpdatedAt = plainRule.updatedAt;
                                return {
                                    id: plainRule.id!,
                                    shiftTemplateId: plainRule.shiftTemplateId!,
                                    rruleString: plainRule.rruleString!,
                                    durationMinutes: plainRule.durationMinutes!,
                                    isWorking: plainRule.isWorking!,
                                    ruleDescription: plainRule.ruleDescription ?? null,
                                    createdAt: ruleCreatedAt instanceof Date ? ruleCreatedAt : (typeof ruleCreatedAt === 'string' || typeof ruleCreatedAt === 'number' ? new Date(ruleCreatedAt) : new Date()),
                                    updatedAt: ruleUpdatedAt instanceof Date ? ruleUpdatedAt : (typeof ruleUpdatedAt === 'string' || typeof ruleUpdatedAt === 'number' ? new Date(ruleUpdatedAt) : new Date()),
                                };
                            });
                        }

                        const creatorMembership = (mockExistingTemplateInstance as any).creator;
                        const creatorUser = creatorMembership?.user;

                        const originalCreatedAtValue = (mockExistingTemplateInstance as any).createdAt;

                        return {
                            id: templateIdToUpdate,
                            establishmentId: MOCK_ESTABLISHMENT_ID,
                            name: updatedName,
                            description: updatedDescription,
                            createdByMembershipId: (mockExistingTemplateInstance as any).createdByMembershipId,
                            rules: finalRulesForOutput,
                            creator: creatorUser ? { username: creatorUser.username } : undefined,
                            createdAt: originalCreatedAtValue instanceof Date ? originalCreatedAtValue : (typeof originalCreatedAtValue === 'string' || typeof originalCreatedAtValue === 'number' ? new Date(originalCreatedAtValue) : new Date()),
                            updatedAt: actualUpdatedAt,
                        };
                    }
                    return null;
                });


            mockShiftTemplateRuleModel.destroy.mockResolvedValue(originalTemplateData.rules.length); // Simule la suppression des règles existantes
            mockShiftTemplateRuleModel.create.mockImplementation(async (ruleData: any) => {
                return mockSequelizeModelInstance<ShiftTemplateRuleAttributes>({
                    id: Math.floor(Math.random() * 1000) + 200, // Nouvel ID pour la règle
                    shiftTemplateId: templateIdToUpdate,
                    ...ruleData,
                });
            });
        });

        it('Func - Scénario 1: Mise à Jour du Nom Seul', async () => {
            // Arrange
            const dtoWithNameOnly: UpdateShiftTemplateDto = { name: 'Super New Name Updated' };
            // mockShiftTemplateModel.findOne (pour unicité du nom) est déjà configuré pour retourner null (pas de conflit)

            // Act
            const result = await shiftTemplateService.updateShiftTemplate(templateIdToUpdate, dtoWithNameOnly, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(result).toBeDefined();
            expect(result.name).toBe(dtoWithNameOnly.name);
            expect(result.description).toBe(originalTemplateData.description); // Description inchangée
            expect(mockExistingTemplateInstance.update).toHaveBeenCalledWith(
                expect.objectContaining({ name: dtoWithNameOnly.name }),
                expect.anything() // { transaction: mockTransactionInstance }
            );
            expect(mockShiftTemplateRuleModel.destroy).not.toHaveBeenCalled();
            expect(mockShiftTemplateRuleModel.create).not.toHaveBeenCalled();
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });

        it('Func - Scénario 2: Mise à Jour de la Description Seule', async () => {
            // Arrange
            const dtoWithDescOnly: UpdateShiftTemplateDto = { description: 'A very new description' };

            // Act
            const result = await shiftTemplateService.updateShiftTemplate(templateIdToUpdate, dtoWithDescOnly, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(result.name).toBe(originalTemplateData.name); // Nom inchangé
            expect(result.description).toBe(dtoWithDescOnly.description);
            expect(mockExistingTemplateInstance.update).toHaveBeenCalledWith(
                expect.objectContaining({ description: dtoWithDescOnly.description }),
                expect.anything()
            );
            expect(mockShiftTemplateRuleModel.destroy).not.toHaveBeenCalled();
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });

        it('Func - Scénario 3: Mise à Jour des Règles Seules', async () => {
            // Arrange
            const newRule: ShiftTemplateRuleInputDto = { rruleString: 'FREQ=MONTHLY;DTSTART=T100000', durationMinutes: 240, isWorking: false, ruleDescription: 'Monthly Rule' };
            const dtoWithRulesOnly: UpdateShiftTemplateDto = { rules: [newRule] };
            rulesPassedToUpdate = dtoWithRulesOnly.rules;

            // Act
            const result = await shiftTemplateService.updateShiftTemplate(templateIdToUpdate, dtoWithRulesOnly, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(result.name).toBe(originalTemplateData.name); // Nom inchangé
            expect(result.rules).toHaveLength(1);
            expect(result.rules[0]).toMatchObject(newRule);
            expect(mockShiftTemplateRuleModel.destroy).toHaveBeenCalledWith({ where: { shiftTemplateId: templateIdToUpdate }, transaction: mockTransactionInstance });
            expect(mockShiftTemplateRuleModel.create).toHaveBeenCalledWith(
                { shiftTemplateId: templateIdToUpdate, ...newRule },
                { transaction: mockTransactionInstance }
            );
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });

        it('Func - Scénario 4: Mise à Jour de Tous les Champs (Nom, Description, Règles)', async () => {
            // Arrange
            const fullUpdateDto: UpdateShiftTemplateDto = {
                name: 'Completely Overhauled Template',
                description: 'This template is brand new!',
                rules: [{ rruleString: 'FREQ=YEARLY;DTSTART=T000000', durationMinutes: 1440, isWorking: true, ruleDescription: 'Annual Event' }]
            };
            rulesPassedToUpdate = fullUpdateDto.rules;

            // Act
            const result = await shiftTemplateService.updateShiftTemplate(templateIdToUpdate, fullUpdateDto, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(result.name).toBe(fullUpdateDto.name);
            expect(result.description).toBe(fullUpdateDto.description);
            expect(result.rules).toHaveLength(1);
            expect(result.rules[0]).toMatchObject(fullUpdateDto.rules![0]);
            expect(mockExistingTemplateInstance.update).toHaveBeenCalledWith(
                expect.objectContaining({ name: fullUpdateDto.name, description: fullUpdateDto.description }),
                expect.anything()
            );
            expect(mockShiftTemplateRuleModel.destroy).toHaveBeenCalledTimes(1);
            expect(mockShiftTemplateRuleModel.create).toHaveBeenCalledTimes(1);
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });


        it('Adv - Scénario 1: `templateId` Inexistant', async () => {
            // Arrange
            mockShiftTemplateModel.findOne.mockResolvedValue(null); // Simule template non trouvé
            const dto: UpdateShiftTemplateDto = { name: 'Try to update' };

            // Act & Assert
            await expect(shiftTemplateService.updateShiftTemplate(999, dto, MOCK_ESTABLISHMENT_ID))
                .rejects.toThrow(ShiftTemplateNotFoundError);
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
            // Le rollback est appelé dans le catch du service si findOne échoue avant la transaction,
            // mais ici findOne est la première étape, donc la transaction n'est pas encore démarrée.
            // Si l'erreur arrive après le début de la transaction, alors on vérifie le rollback.
        });

        it('Adv - Scénario 2: `templateId` n\'appartenant pas à `establishmentId` de l\'admin', async () => {
            // Arrange
            // findOne est configuré pour retourner null si establishmentId ne correspond pas
            mockShiftTemplateModel.findOne.mockResolvedValue(null);
            const dto: UpdateShiftTemplateDto = { name: 'Attempt cross-establishment update' };

            // Act & Assert
            await expect(shiftTemplateService.updateShiftTemplate(templateIdToUpdate, dto, MOCK_ESTABLISHMENT_ID + 5))
                .rejects.toThrow(ShiftTemplateNotFoundError);
        });

        it('Adv - Scénario 3: Nouveau Nom Dupliqué pour un autre template', async () => {
            // Arrange
            const newConflictingName = 'Existing Other Template Name';
            const dtoWithConflictingName: UpdateShiftTemplateDto = { name: newConflictingName };

            mockShiftTemplateModel.findOne
                .mockResolvedValueOnce(mockExistingTemplateInstance) // Premier appel pour charger le template à mettre à jour
                .mockResolvedValueOnce(mockSequelizeModelInstance<ShiftTemplateAttributes>({
                    id: 2,
                    description: null,
                    name: newConflictingName,
                    establishmentId: MOCK_ESTABLISHMENT_ID,
                    createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID
                })); // Deuxième appel pour vérifier l'unicité du nouveau nom

            // Act & Assert
            await expect(shiftTemplateService.updateShiftTemplate(templateIdToUpdate, dtoWithConflictingName, MOCK_ESTABLISHMENT_ID))
                .rejects.toThrow(ShiftTemplateCreationError); // Ou une erreur de conflit spécifique

            expect(mockSequelizeTransactionFn).not.toHaveBeenCalled();
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
            expect(mockTransactionInstance.rollback).not.toHaveBeenCalled();
        });

        it('Adv - Scénario 4: Mise à jour des règles échoue (simulé)', async () => {
            // Arrange
            const dtoWithRules: UpdateShiftTemplateDto = {
                rules: [{ rruleString: 'FREQ=NEVER', durationMinutes: 1, isWorking: true }]
            };
            mockShiftTemplateModel.findOne.mockResolvedValue(mockExistingTemplateInstance); // Template trouvé
            mockShiftTemplateRuleModel.destroy.mockResolvedValue(1); // Suppression des anciennes règles OK
            mockShiftTemplateRuleModel.create.mockRejectedValueOnce(new Error("DB error creating new rule")); // Échec création nouvelle règle

            // Act & Assert
            await expect(shiftTemplateService.updateShiftTemplate(templateIdToUpdate, dtoWithRules, MOCK_ESTABLISHMENT_ID))
                .rejects.toThrow(AppError); // Ou une erreur plus spécifique comme ShiftTemplateUpdateError

            expect(mockTransactionInstance.rollback).toHaveBeenCalledTimes(1);
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
        });
    });

    describe('deleteShiftTemplate', () => {
        const templateIdToDelete = 1;
        const nonExistingTemplateId = 999;
        const otherEstablishmentId = MOCK_ESTABLISHMENT_ID + 1;

        let mockTemplateToDeleteInstance: jest.Mocked<ShiftTemplate>;

        beforeEach(() => {
            // Préparer une instance mockée pour le template à supprimer
            const templateData = {
                id: templateIdToDelete,
                name: 'Template to Be Deleted',
                description: null,
                establishmentId: MOCK_ESTABLISHMENT_ID,
                createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            // La méthode destroy est sur l'instance elle-même
            mockTemplateToDeleteInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>(
                templateData,
                {
                    destroy: jest.fn().mockResolvedValue(undefined) // Important de mocker destroy
                }
            ) as jest.Mocked<ShiftTemplate>; // Caster en ShiftTemplate pour l'accès à destroy

            // Par défaut, findOne retourne le template à supprimer si les IDs correspondent
            mockShiftTemplateModel.findOne.mockImplementation(async (options) => {
                if (options?.where && (options.where as any).id === templateIdToDelete && (options.where as any).establishmentId === MOCK_ESTABLISHMENT_ID) {
                    return mockTemplateToDeleteInstance;
                }
                return null;
            });
        });

        it('Func - Scénario 1: Suppression Réussie d\'un template existant appartenant à l\'établissement', async () => {
            // Arrange
            // mockShiftTemplateModel.findOne est déjà configuré dans le beforeEach

            // Act
            await shiftTemplateService.deleteShiftTemplate(templateIdToDelete, MOCK_ESTABLISHMENT_ID);

            // Assert
            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledWith({
                where: { id: templateIdToDelete, establishmentId: MOCK_ESTABLISHMENT_ID },
            });
            expect(mockTemplateToDeleteInstance.destroy).toHaveBeenCalledTimes(1);
            // Pour la suppression, il n'y a pas de transaction explicite démarrée DANS cette méthode du service.
            // La méthode `destroy()` de Sequelize gère sa propre opération.
            // Donc, on ne vérifie pas mockTransactionInstance.commit ou rollback ici, à moins que
            // le service `deleteShiftTemplate` n'enveloppe l'appel à `destroy()` dans une transaction.
            // D'après le code du service que j'ai fourni, il ne le fait pas, se fiant à l'atomicité de destroy().
            // Si vous l'aviez enveloppé, alors il faudrait vérifier le commit.
        });

        it('Adv - Scénario 1: `templateId` Inexistant', async () => {
            // Arrange
            mockShiftTemplateModel.findOne.mockResolvedValue(null); // Simule que le template n'est pas trouvé

            // Act & Assert
            await expect(shiftTemplateService.deleteShiftTemplate(nonExistingTemplateId, MOCK_ESTABLISHMENT_ID))
                .rejects.toThrow(ShiftTemplateNotFoundError);

            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledWith({
                where: { id: nonExistingTemplateId, establishmentId: MOCK_ESTABLISHMENT_ID },
            });
            expect(mockTemplateToDeleteInstance.destroy).not.toHaveBeenCalled(); // destroy ne doit pas être appelé
        });

        it('Adv - Scénario 2: `templateId` Existant mais n\'appartenant pas à l\'`establishmentId` fourni', async () => {
            // Arrange
            // findOne retournera null car la condition where { establishmentId: otherEstablishmentId } ne correspondra pas
            // à l'establishmentId du mockTemplateToDeleteInstance.
            mockShiftTemplateModel.findOne.mockResolvedValue(null);

            // Act & Assert
            await expect(shiftTemplateService.deleteShiftTemplate(templateIdToDelete, otherEstablishmentId))
                .rejects.toThrow(ShiftTemplateNotFoundError);

            expect(mockShiftTemplateModel.findOne).toHaveBeenCalledWith({
                where: { id: templateIdToDelete, establishmentId: otherEstablishmentId },
            });
            expect(mockTemplateToDeleteInstance.destroy).not.toHaveBeenCalled();
        });

        it('Adv - Scénario 3: Échec de la méthode destroy de l\'instance (simulé)', async () => {
            // Arrange
            mockTemplateToDeleteInstance.destroy.mockRejectedValueOnce(new Error("Database deletion failed"));
            mockShiftTemplateModel.findOne.mockResolvedValue(mockTemplateToDeleteInstance); // Assurer que le template est trouvé

            // Act & Assert
            await expect(shiftTemplateService.deleteShiftTemplate(templateIdToDelete, MOCK_ESTABLISHMENT_ID))
                .rejects.toThrow("Database deletion failed"); // L'erreur originale est propagée

            expect(mockTemplateToDeleteInstance.destroy).toHaveBeenCalledTimes(1);
        });
    });

    describe('applyShiftTemplateToMemberships', () => {
        const templateIdToApply = 1;
        const mockStaffMembership1: MembershipAttributes = { id: MOCK_STAFF_MEMBERSHIP_ID_1_CONST, establishmentId: MOCK_ESTABLISHMENT_ID, userId: 301, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, invitedEmail:null, invitationTokenHash:null, invitationTokenExpiresAt:null, joinedAt: new Date() };
        const mockStaffMembership2: MembershipAttributes = { id: MOCK_STAFF_MEMBERSHIP_ID_2_CONST, establishmentId: MOCK_ESTABLISHMENT_ID, userId: 302, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, invitedEmail:null, invitationTokenHash:null, invitationTokenExpiresAt:null, joinedAt: new Date() };

        const mockRuleMorning: ShiftTemplateRuleAttributes = { id: 101, shiftTemplateId: templateIdToApply, rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T090000', durationMinutes: 240, isWorking: true, ruleDescription: 'Morning Block' };
        const mockRuleAfternoon: ShiftTemplateRuleAttributes = { id: 102, shiftTemplateId: templateIdToApply, rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T140000', durationMinutes: 180, isWorking: true, ruleDescription: 'Afternoon Block' };
        const mockRuleBreak: ShiftTemplateRuleAttributes = { id: 103, shiftTemplateId: templateIdToApply, rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=T120000', durationMinutes: 60, isWorking: false, ruleDescription: 'Lunch Break' };

        let mockTemplateWithRulesInstance: jest.Mocked<ShiftTemplate & { rules: jest.Mocked<ShiftTemplateRule>[] }>;
        let mockValidEstablishmentInstance: jest.Mocked<Establishment>;

        beforeEach(() => {
            const rules = [
                mockSequelizeModelInstance<ShiftTemplateRuleAttributes>(mockRuleMorning),
                mockSequelizeModelInstance<ShiftTemplateRuleAttributes>(mockRuleAfternoon),
                mockSequelizeModelInstance<ShiftTemplateRuleAttributes>(mockRuleBreak),
            ];
            // @ts-ignore
            mockTemplateWithRulesInstance = mockSequelizeModelInstance<ShiftTemplateAttributes>(
                { id: templateIdToApply, name: 'Full Day Template', description: null, establishmentId: MOCK_ESTABLISHMENT_ID, createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID },
                // @ts-ignore
                { rules: rules } // Simuler l'association 'rules' chargée
            );
            // @ts-ignore
            mockTemplateWithRulesInstance.rules = rules; // Attacher directement pour accès facile dans les tests


            mockValidEstablishmentInstance = mockSequelizeModelInstance<EstablishmentAttributes>(mockEstablishment) as jest.Mocked<Establishment>; // mockEstablishment a timezone: 'Europe/Paris'

            mockShiftTemplateModel.findOne.mockResolvedValue(mockTemplateWithRulesInstance); // findOne pour le template par ID
            mockEstablishmentModel.findByPk.mockResolvedValue(mockValidEstablishmentInstance);

            mockMembershipModel.findOne.mockImplementation(async (options) => {
                const id = (options?.where as any)?.id;
                const establishmentId = (options?.where as any)?.establishmentId;

                if (establishmentId !== MOCK_ESTABLISHMENT_ID) return null; // Simplification: tous les membres testés sont dans MOCK_ESTABLISHMENT_ID

                if (id === MOCK_STAFF_MEMBERSHIP_ID_1_CONST) {
                    return mockSequelizeModelInstance<MembershipAttributes>(mockStaffMembership1Data);
                }
                if (id === MOCK_STAFF_MEMBERSHIP_ID_2_CONST) {
                    return mockSequelizeModelInstance<MembershipAttributes>(mockStaffMembership2Data);
                }
                // Pour la vérification d'unicité du nom de template dans updateShiftTemplate
                if ((options?.where as any)?.name && (options?.where as any)?.establishmentId === MOCK_ESTABLISHMENT_ID) {
                    // Ce mock est complexe car il dépend du test. Il est souvent mieux de le configurer par test.
                    // Pour l'instant, on retourne null (pas de conflit de nom par défaut)
                    return null;
                }
                return null;
            });

            mockStaffAvailabilityModel.destroy.mockResolvedValue(1); // Simule au moins une suppression
            mockStaffAvailabilityModel.create.mockImplementation(
                async (data?: StaffAvailabilityCreationAttributes | Optional<StaffAvailabilityAttributes, any>) => {
                    if (!data) throw new Error("Mock create called without data");
                    const creationData = data as StaffAvailabilityCreationAttributes;
                    return mockSequelizeModelInstance<StaffAvailabilityAttributes>({
                        id: Math.floor(Math.random() * 10000), // ID aléatoire pour le test
                        membershipId: creationData.membershipId,
                        rruleString: creationData.rruleString,
                        durationMinutes: creationData.durationMinutes,
                        isWorking: creationData.isWorking,
                        effectiveStartDate: new Date(creationData.effectiveStartDate).toString(), // Assurer que c'est une Date
                        effectiveEndDate: creationData.effectiveEndDate ? new Date(creationData.effectiveEndDate).toString() : null,
                        description: creationData.description ?? null, // CORRIGÉ
                        // appliedShiftTemplateRuleId et createdByMembershipId seraient ici si présents dans StaffAvailabilityCreationAttributes
                        appliedShiftTemplateRuleId: (data as any).appliedShiftTemplateRuleId ?? null,
                        createdByMembershipId: (data as any).createdByMembershipId ?? null,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                }
            );
        });

        const getExpectedUtcRRuleString = (startDate: string, localTimeStr: string, originalFreqAndByDay: string, establishmentTz: string): string => {
            const localDt = moment.tz(`${startDate}T${localTimeStr}`, "YYYY-MM-DDTHHmmss", establishmentTz);
            const utcDtStart = localDt.utc().format('YYYYMMDDTHHmmss[Z]');
            return `DTSTART=${utcDtStart};${originalFreqAndByDay.replace(/DTSTART=T[0-9]+;?/, '').replace(/;;/g, ';').replace(/;$/, '')}`;
        };


        it('Func - Scénario 1: Application Réussie (REPLACE_ALL_IN_PERIOD) à plusieurs membres', async () => {
            // Arrange
            const applyDto: ApplyShiftTemplateDto = {
                targetMembershipIds: [MOCK_STAFF_MEMBERSHIP_ID_1_CONST, MOCK_STAFF_MEMBERSHIP_ID_2_CONST],
                applicationStartDate: '2025-01-06', // Un lundi
                applicationEndDate: '2025-01-10', // Un vendredi
                overwriteMode: OverwriteMode.REPLACE_ALL_IN_PERIOD,
            };

            // Act
            const result = await shiftTemplateService.applyShiftTemplateToMemberships(
                templateIdToApply, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            // Assert
            expect(result.generatedAvailabilitiesCount).toBe(applyDto.targetMembershipIds.length * mockTemplateWithRulesInstance.rules.length);
            expect(result.errors).toHaveLength(0);

            // Vérifier la suppression des anciennes disponibilités
            expect(mockStaffAvailabilityModel.destroy).toHaveBeenCalledTimes(applyDto.targetMembershipIds.length);
            for (const memberId of applyDto.targetMembershipIds) {
                expect(mockStaffAvailabilityModel.destroy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            membershipId: memberId,
                            effectiveStartDate: { [Op.lte]: applyDto.applicationEndDate }, // YYYY-MM-DD strings
                            [Op.or]: [
                                { effectiveEndDate: { [Op.gte]: applyDto.applicationStartDate } },
                                { effectiveEndDate: null }
                            ]
                        }),
                        transaction: mockTransactionInstance
                    })
                );
            }

            // Vérifier la création des nouvelles disponibilités
            // expect(mockStaffAvailabilityModel.create).toHaveBeenCalledTimes(expectedGeneratedCount);

            // Vérification détaillée pour la première règle et le premier membre
            const firstRule = mockTemplateWithRulesInstance.rules[0]; // Morning Block
            // const expectedRRuleForMorning = getExpectedUtcRRuleString(applyDto.applicationStartDate, '090000', firstRule.rruleString, mockEstablishment.timezone);

            const allCallsToCreate = mockStaffAvailabilityModel.create.mock.calls;
            console.log('DEBUG JEST - All calls to StaffAvailabilityModel.create:', JSON.stringify(allCallsToCreate, null, 2));

            const firstMemberId = MOCK_STAFF_MEMBERSHIP_ID_1_CONST;

            for (const rule of mockTemplateWithRulesInstance.rules) {
                const ruleDtStartLocalTime = rule.rruleString.match(/DTSTART=T([0-9]{6})/)?.[1];
                if (!ruleDtStartLocalTime) throw new Error(`Could not extract local time from rule ${rule.id}`);

                const expectedRRuleStringSegment = getExpectedUtcRRuleString(
                    applyDto.applicationStartDate,
                    ruleDtStartLocalTime,
                    rule.rruleString,
                    mockEstablishment.timezone
                );

                const callForThisRuleThisMember = allCallsToCreate.find(call => {
                    const arg = call[0] as StaffAvailabilityCreationAttributes;
                    return arg.membershipId === firstMemberId &&
                        arg.appliedShiftTemplateRuleId === rule.id;
                });

                expect(callForThisRuleThisMember).toBeDefined();
                if (callForThisRuleThisMember) {
                    const dataPassedToCreate = callForThisRuleThisMember[0] as StaffAvailabilityCreationAttributes;
                    expect(dataPassedToCreate.rruleString).toContain(expectedRRuleStringSegment); // Utiliser toContain car la rruleString complète peut avoir des ordres différents pour les composants après DTSTART
                    expect(dataPassedToCreate).toMatchObject({
                        membershipId: firstMemberId,
                        durationMinutes: rule.durationMinutes,
                        isWorking: rule.isWorking,
                        effectiveStartDate: applyDto.applicationStartDate,
                        effectiveEndDate: applyDto.applicationEndDate,
                        appliedShiftTemplateRuleId: rule.id,
                        createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID,
                        description: rule.ruleDescription || `Generated by template: ${mockTemplateWithRulesInstance.name}` // Assurez-vous que le nom du template est correct
                    });
                }
            }
            // Répéter pour le deuxième membre si nécessaire, ou faire une boucle sur les membres
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });

        it('Func - Scénario 2: Application Réussie (REPLACE_TEMPLATE_GENERATED_IN_PERIOD)', async () => {
            // Arrange
            const applyDto: ApplyShiftTemplateDto = {
                targetMembershipIds: [MOCK_STAFF_MEMBERSHIP_ID_1_CONST],
                applicationStartDate: '2025-02-03',
                applicationEndDate: '2025-02-07',
                overwriteMode: OverwriteMode.REPLACE_TEMPLATE_GENERATED_IN_PERIOD,
            };
            // S'assurer que la colonne appliedShiftTemplateRuleId existe pour le mock
            mockStaffAvailabilityModel.destroy.mockClear(); // Clear previous calls

            // Act
            await shiftTemplateService.applyShiftTemplateToMemberships(
                templateIdToApply, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            // Assert
            expect(mockStaffAvailabilityModel.destroy).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        membershipId: MOCK_STAFF_MEMBERSHIP_ID_1_CONST,
                        appliedShiftTemplateRuleId: { [Op.not]: null }, // Condition clé pour ce mode
                        // ... autres conditions de date
                    }),
                    transaction: mockTransactionInstance
                })
            );
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });


        it('Func - Scénario 3: Application sans applicationEndDate (devrait utiliser une large fenêtre ou la fin de la rrule)', async () => {
            // Arrange
            const applyDto: ApplyShiftTemplateDto = {
                targetMembershipIds: [MOCK_STAFF_MEMBERSHIP_ID_1_CONST],
                applicationStartDate: '2025-03-03',
                applicationEndDate: null, // ou undefined
                overwriteMode: OverwriteMode.REPLACE_ALL_IN_PERIOD,
            };

            // Act
            await shiftTemplateService.applyShiftTemplateToMemberships(
                templateIdToApply, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            // Assert
            // Vérifier que effectiveEndDate est null lors de la création
            expect(mockStaffAvailabilityModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    membershipId: MOCK_STAFF_MEMBERSHIP_ID_1_CONST,
                    effectiveEndDate: null, // ou undefined, selon ce que le DTO passe
                }),
                expect.anything()
            );
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });


        it('Edge - Scénario 1: Appliquer un template à un seul membre', async () => {
            // Arrange
            const applyDto: ApplyShiftTemplateDto = {
                targetMembershipIds: [MOCK_STAFF_MEMBERSHIP_ID_1_CONST], // Un seul membre
                applicationStartDate: '2025-01-06',
                applicationEndDate: '2025-01-10',
                overwriteMode: OverwriteMode.REPLACE_ALL_IN_PERIOD,
            };

            // Act
            const result = await shiftTemplateService.applyShiftTemplateToMemberships(
                templateIdToApply, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            // Assert
            const expectedGeneratedCount = 1 * mockTemplateWithRulesInstance.rules.length;
            expect(result.generatedAvailabilitiesCount).toBe(expectedGeneratedCount);
            expect(result.errors).toHaveLength(0);
            expect(mockStaffAvailabilityModel.destroy).toHaveBeenCalledTimes(1); // Une seule fois pour ce membre
            expect(mockStaffAvailabilityModel.create).toHaveBeenCalledTimes(expectedGeneratedCount);
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1);
        });


        it('Adv - Scénario 1: `templateId` Inexistant', async () => {
            // Arrange
            mockShiftTemplateModel.findOne.mockResolvedValue(null); // Le template n'est pas trouvé
            const applyDto: ApplyShiftTemplateDto = { ...mockApplyDtoBase };

            // Act & Assert
            await expect(shiftTemplateService.applyShiftTemplateToMemberships(
                999, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(ShiftTemplateNotFoundError);

            expect(mockSequelizeTransactionFn).not.toHaveBeenCalled();
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
            expect(mockTransactionInstance.rollback).not.toHaveBeenCalled();
        });

        it('Adv - Scénario 3: Un `targetMembershipId` inexistant parmi plusieurs', async () => {
            // Arrange
            const invalidMemberId = 999;
            const applyDto: ApplyShiftTemplateDto = {
                targetMembershipIds: [MOCK_STAFF_MEMBERSHIP_ID_1_CONST, invalidMemberId],
                applicationStartDate: '2025-01-06',
                applicationEndDate: '2025-01-10',
                overwriteMode: OverwriteMode.REPLACE_ALL_IN_PERIOD,
            };
            mockMembershipModel.findOne.mockImplementation(async (options) => {
                const id = (options?.where as any)?.id;
                if (id === MOCK_STAFF_MEMBERSHIP_ID_1_CONST) return mockSequelizeModelInstance<MembershipAttributes>(mockStaffMembership1);
                if (id === invalidMemberId) return null; // Ce membre n'est pas trouvé
                return null;
            });

            // Act
            const result = await shiftTemplateService.applyShiftTemplateToMemberships(
                templateIdToApply, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            );

            // Assert
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].membershipId).toBe(invalidMemberId);
            expect(result.errors[0].error).toContain(`Membership ID ${invalidMemberId} not found`);
            expect(result.generatedAvailabilitiesCount).toBe(1 * mockTemplateWithRulesInstance.rules.length); // Uniquement pour le membre valide
            expect(mockStaffAvailabilityModel.create).toHaveBeenCalledTimes(mockTemplateWithRulesInstance.rules.length);
            expect(mockTransactionInstance.commit).toHaveBeenCalledTimes(1); // La transaction globale réussit pour les membres valides
        });

        it('Adv - Scénario 5: `establishmentId` sans `timezone` configuré', async () => {
            // Arrange
            mockEstablishmentModel.findByPk.mockResolvedValue(
                mockSequelizeModelInstance<EstablishmentAttributes>({ ...mockEstablishment, timezone: null as any }) // Timezone nulle
            );
            const applyDto: ApplyShiftTemplateDto = { ...mockApplyDtoBase };

            // Act & Assert
            await expect(shiftTemplateService.applyShiftTemplateToMemberships(
                templateIdToApply, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(EstablishmentNotFoundError); // Ou une AppError spécifique pour timezone manquante

            expect(mockSequelizeTransactionFn).not.toHaveBeenCalled();
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
            expect(mockTransactionInstance.rollback).not.toHaveBeenCalled();
        });

        it('Adv - Scénario 6: Template sans règles', async () => {
            // Arrange
            const templateWithoutRules = mockSequelizeModelInstance<ShiftTemplateAttributes>(
                { id: templateIdToApply, name: 'Empty Template', description: null, establishmentId: MOCK_ESTABLISHMENT_ID, createdByMembershipId: MOCK_ADMIN_MEMBERSHIP_ID },
                // @ts-ignore
                { rules: [] }
            );
            // @ts-ignore
            templateWithoutRules.rules = [];
            mockShiftTemplateModel.findOne.mockResolvedValue(templateWithoutRules);
            const applyDto: ApplyShiftTemplateDto = { ...mockApplyDtoBase };

            // Act & Assert
            await expect(shiftTemplateService.applyShiftTemplateToMemberships(
                templateIdToApply, applyDto, MOCK_ESTABLISHMENT_ID, MOCK_ADMIN_MEMBERSHIP_ID
            )).rejects.toThrow(ShiftTemplateNotFoundError); // Le message exact est "Shift template not found or has no rules."

            expect(mockSequelizeTransactionFn).not.toHaveBeenCalled();
            expect(mockTransactionInstance.commit).not.toHaveBeenCalled();
            expect(mockTransactionInstance.rollback).not.toHaveBeenCalled();
        });
    });

});