// tests/services/planning/daily-adjustment-slot-service.unit.test.ts

import { DailyAdjustmentSlotService } from '../../../src/services/daily-adjustment-slot.service';
import { DasConflictError, DasNotFoundError, RpmNotFoundError } from '../../../src/errors/planning.errors';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { CreateDailyAdjustmentSlotDto, UpdateDailyAdjustmentSlotDto } from '../../../src/dtos/planning/daily-adjustment-slot.validation';
import { SlotType } from '../../../src/types/planning.enums';

// --- Déclaration des Mocks et du Service ---
let dailyAdjustmentSlotModelMock: { findOne: jest.Mock; findAll: jest.Mock; create: jest.Mock; findByPk: jest.Mock; };
let membershipModelMock: { findOne: jest.Mock; };
let recurringPlanningModelModelMock: { findOne: jest.Mock; };
let sequelizeMock: { transaction: jest.Mock; };
let cacheServiceMock: jest.Mocked<ICacheService>;
let service: DailyAdjustmentSlotService;

// --- Helpers de Données de Mock ---
const mockTransaction = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    LOCK: { UPDATE: 'UPDATE' },
};

const mockMembership = { id: 101, establishmentId: 10 };
const mockRpm = { id: 201, establishmentId: 10 };
const establishmentId = 10;

const createMockDasDto = (overrides: Partial<CreateDailyAdjustmentSlotDto> = {}): CreateDailyAdjustmentSlotDto => ({
    membershipId: 101,
    establishmentId: establishmentId,
    slotDate: '2024-11-15',
    startTime: '09:00:00',
    endTime: '11:00:00',
    slotType: SlotType.EFFECTIVE_WORK,
    isManualOverride: true,
    ...overrides,
});

const createMockDasInstance = (dto: CreateDailyAdjustmentSlotDto) => ({
    ...dto,
    id: 1,
    update: jest.fn().mockImplementation(function(this: any, data: any) {
        Object.assign(this, data);
        return Promise.resolve(this);
    }),
    get: jest.fn().mockReturnThis(),
});

describe('DailyAdjustmentSlotService', () => {

    beforeEach(() => {
        dailyAdjustmentSlotModelMock = { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), findByPk: jest.fn() };
        membershipModelMock = { findOne: jest.fn().mockResolvedValue(mockMembership) };
        recurringPlanningModelModelMock = { findOne: jest.fn().mockResolvedValue(mockRpm) };
        sequelizeMock = { transaction: jest.fn().mockResolvedValue(mockTransaction) };
        cacheServiceMock = { get: jest.fn(), set: jest.fn(), delete: jest.fn(), flushAll: jest.fn(), deleteByPattern: jest.fn() };

        service = new DailyAdjustmentSlotService(
            dailyAdjustmentSlotModelMock as any,
            membershipModelMock as any,
            recurringPlanningModelModelMock as any,
            sequelizeMock as any,
            cacheServiceMock
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createDas', () => {
        it('should create a DAS successfully for a free time slot', async () => {
            const dto = createMockDasDto();
            dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([]);
            const mockCreatedDas = createMockDasInstance(dto);
            dailyAdjustmentSlotModelMock.create.mockResolvedValue(mockCreatedDas);

            await service.createDas(dto, establishmentId);

            expect(dailyAdjustmentSlotModelMock.create).toHaveBeenCalledWith(dto, { transaction: mockTransaction });
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw DasConflictError if an overlapping slot exists', async () => {
            const dto = createMockDasDto({ startTime: '10:00:00', endTime: '12:00:00' });
            const existingDas = createMockDasInstance(createMockDasDto({ startTime: '09:00:00', endTime: '10:30:00' }));
            dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([existingDas]);

            await expect(service.createDas(dto, establishmentId)).rejects.toThrow(DasConflictError);
        });

        it('should throw RpmNotFoundError if sourceRpmId does not exist', async () => {
            const dto = createMockDasDto({ sourceRecurringPlanningModelId: 999 });
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);
            await expect(service.createDas(dto, establishmentId)).rejects.toThrow(RpmNotFoundError);
        });
    });

    describe('updateDas', () => {
        it('should update a DAS successfully', async () => {
            const dasId = 1;
            const updateDto: UpdateDailyAdjustmentSlotDto = { startTime: '13:00:00', endTime: '14:00:00' };
            const existingDas = createMockDasInstance(createMockDasDto());

            dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(existingDas);
            // --- LA CORRECTION CLÉ ---
            // On configure `findAll` pour qu'il retourne un tableau vide, simulant l'absence de conflit.
            dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([]);

            dailyAdjustmentSlotModelMock.findByPk.mockResolvedValue({ ...existingDas, ...updateDto });

            await service.updateDas(dasId, updateDto, establishmentId);

            expect(existingDas.update).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw DasNotFoundError if trying to update a non-existent DAS', async () => {
            dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(null);
            await expect(service.updateDas(999, {}, establishmentId)).rejects.toThrow(DasNotFoundError);
        });

        it('should throw DasConflictError when updating a slot to overlap with another existing slot', async () => {
            // SCÉNARIO : On met à jour le DAS "A" (9h-10h) pour qu'il devienne 9h-11h30,
            // ce qui entre en conflit avec le DAS "B" (11h-12h) qui existe déjà.
            const dasIdToUpdate = 1;
            const updateDto: UpdateDailyAdjustmentSlotDto = { endTime: '11:30:00' };

            const dasToUpdateInstance = createMockDasInstance(createMockDasDto({ startTime: '09:00:00', endTime: '10:00:00' }));
            dasToUpdateInstance.id = dasIdToUpdate;
            const otherExistingDas = createMockDasInstance(createMockDasDto({ startTime: '11:00:00', endTime: '12:00:00' }));
            otherExistingDas.id = 2;

            // 1. findOne trouve le DAS à mettre à jour.
            dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(dasToUpdateInstance);
            // 2. findAll (dans checkForOverlappingSlots) trouve l'autre DAS qui crée le conflit.
            dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([otherExistingDas]);

            await expect(service.updateDas(dasIdToUpdate, updateDto, establishmentId))
                .rejects.toThrow(DasConflictError);

            // On vérifie que l'écriture n'a pas eu lieu.
            expect(dasToUpdateInstance.update).not.toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
        });

        it('should throw an error if an update makes existing tasks fall outside the new slot times', async () => {
            // SCÉNARIO : Un DAS de 9h-12h contient une tâche à 11h. On le met à jour pour qu'il se termine à 10h.
            // La tâche à 11h est maintenant invalide. Le service doit rejeter cette mise à jour.
            const dasId = 1;
            const updateDto: UpdateDailyAdjustmentSlotDto = { endTime: '10:00:00' };

            const existingDasDto = createMockDasDto({
                startTime: '09:00:00',
                endTime: '12:00:00',
                tasks: [{
                    id: 'task-uuid-1',
                    taskName: 'Late Task',
                    taskStartTime: '11:00:00',
                    taskEndTime: '11:30:00'
                }]
            });
            const existingDasInstance = createMockDasInstance(existingDasDto);
            existingDasInstance.id = dasId;

            dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(existingDasInstance);
            // On suppose qu'il n'y a pas d'autres conflits de slot.
            dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([]);

            // NOTE: Ce test suppose que le service a une logique interne pour re-valider la cohérence
            // des tâches par rapport aux nouvelles bornes du slot avant de sauvegarder.
            // Si le test échoue car aucune erreur n'est levée, cela révèle une faille dans le service.
            await expect(service.updateDas(dasId, updateDto, establishmentId))
                .rejects.toThrow(); // Idéalement, une erreur spécifique comme DasUpdateError

            expect(existingDasInstance.update).not.toHaveBeenCalled();
        });
    });
});