// tests/services/planning/daily-adjustment-slot-service.unit.test.ts
import { Op } from 'sequelize';
import { DailyAdjustmentSlotService } from '../../../src/services/daily-adjustment-slot.service';
import { DasConflictError, DasNotFoundError, RpmNotFoundError, PlanningModuleError } from '../../../src/errors/planning.errors';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { CreateDailyAdjustmentSlotDto, UpdateDailyAdjustmentSlotDto, BulkDeleteDasDto, BulkUpdateDasDto } from '../../../src/dtos/planning/daily-adjustment-slot.validation';
import { SlotType } from '../../../src/types/planning.enums';
import { MembershipNotFoundError } from '../../../src/errors/membership.errors';

// --- Déclaration des Mocks et du Service ---
let dailyAdjustmentSlotModelMock: { findOne: jest.Mock; findAll: jest.Mock; create: jest.Mock; findByPk: jest.Mock; destroy: jest.Mock; };
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

const createMockDasInstance = (dto: CreateDailyAdjustmentSlotDto | UpdateDailyAdjustmentSlotDto, id = 1) => ({
    id,
    ...dto,
    update: jest.fn().mockImplementation(function(this: any, data: any) {
        Object.assign(this, data);
        return Promise.resolve(this);
    }),
    get: jest.fn().mockReturnThis(),
});

describe('DailyAdjustmentSlotService', () => {

    beforeEach(() => {
        dailyAdjustmentSlotModelMock = { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), findByPk: jest.fn(), destroy: jest.fn() };
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
            dailyAdjustmentSlotModelMock.create.mockResolvedValue(createMockDasInstance(dto));
            await service.createDas(dto, establishmentId);
            expect(dailyAdjustmentSlotModelMock.create).toHaveBeenCalledWith(dto, { transaction: mockTransaction });
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        describe('Overlap Edge Cases', () => {
            it('should throw DasConflictError if an overlapping slot exists', async () => {
                const dto = createMockDasDto({ startTime: '10:00:00', endTime: '12:00:00' });
                const existingDas = createMockDasInstance(createMockDasDto({ startTime: '09:00:00', endTime: '10:30:00' }));
                dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([existingDas]);
                await expect(service.createDas(dto, establishmentId)).rejects.toThrow(DasConflictError);
            });

            it('should succeed when a new slot starts exactly when an existing one ends (adjacence)', async () => {
                const dto = createMockDasDto({ startTime: '10:00:00', endTime: '11:00:00' });

                dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([]); // La logique de conflit ne doit pas le trouver
                dailyAdjustmentSlotModelMock.create.mockResolvedValue(createMockDasInstance(dto));
                await expect(service.createDas(dto, establishmentId)).resolves.toBeDefined();
            });

            it('should fail when the new slot is completely contained within an existing one', async () => {
                const dto = createMockDasDto({ startTime: '10:00:00', endTime: '11:00:00' });
                const existingDas = createMockDasInstance(createMockDasDto({ startTime: '09:00:00', endTime: '17:00:00' }));
                dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([existingDas]);
                await expect(service.createDas(dto, establishmentId)).rejects.toThrow(DasConflictError);
            });

            it('should fail when the new slot contains an existing one', async () => {
                const dto = createMockDasDto({ startTime: '09:00:00', endTime: '17:00:00' });
                const existingDas = createMockDasInstance(createMockDasDto({ startTime: '10:00:00', endTime: '11:00:00' }));
                dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([existingDas]);
                await expect(service.createDas(dto, establishmentId)).rejects.toThrow(DasConflictError);
            });
        });

        describe('Data Integrity and Security', () => {
            it('should throw RpmNotFoundError if sourceRpmId does not exist', async () => {
                const dto = createMockDasDto({ sourceRecurringPlanningModelId: 999 });
                recurringPlanningModelModelMock.findOne.mockResolvedValue(null);
                await expect(service.createDas(dto, establishmentId)).rejects.toThrow(RpmNotFoundError);
            });

            it('should throw MembershipNotFoundError if the membershipId does not exist', async () => {
                const dto = createMockDasDto({ membershipId: 999 });
                membershipModelMock.findOne.mockResolvedValue(null);
                await expect(service.createDas(dto, establishmentId)).rejects.toThrow(MembershipNotFoundError);
            });
        });
    });

    describe('updateDas', () => {
        it('should update a DAS successfully', async () => {
            const dasId = 1;
            const updateDto: UpdateDailyAdjustmentSlotDto = { startTime: '13:00:00', endTime: '14:00:00' };
            const existingDas = createMockDasInstance(createMockDasDto());
            dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(existingDas);
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

        it('should throw DasConflictError when updating a slot to overlap with another', async () => {
            const dasIdToUpdate = 1;
            const updateDto: UpdateDailyAdjustmentSlotDto = { endTime: '11:30:00' };
            const dasToUpdateInstance = createMockDasInstance(createMockDasDto({ startTime: '09:00:00', endTime: '10:00:00' }), dasIdToUpdate);
            const otherExistingDas = createMockDasInstance(createMockDasDto({ startTime: '11:00:00', endTime: '12:00:00' }), 2);
            dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(dasToUpdateInstance);
            dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([otherExistingDas]);
            await expect(service.updateDas(dasIdToUpdate, updateDto, establishmentId)).rejects.toThrow(DasConflictError);
            expect(dasToUpdateInstance.update).not.toHaveBeenCalled();
        });

        it('should throw an error if an update makes existing tasks fall outside the new slot times', async () => {
            const dasId = 1;
            const updateDto: UpdateDailyAdjustmentSlotDto = { endTime: '10:00:00' };
            const existingDasDto = createMockDasDto({
                startTime: '09:00:00', endTime: '12:00:00',
                tasks: [{ id: 'task-uuid-1', taskName: 'Late Task', taskStartTime: '11:00:00', taskEndTime: '11:30:00' }]
            });
            const existingDasInstance = createMockDasInstance(existingDasDto, dasId);
            dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(existingDasInstance);
            dailyAdjustmentSlotModelMock.findAll.mockResolvedValue([]);
            await expect(service.updateDas(dasId, updateDto, establishmentId)).rejects.toThrow();
            expect(existingDasInstance.update).not.toHaveBeenCalled();
        });
    });

    describe('Bulk Operations', () => {
        describe('bulkUpdateDas', () => {
            it('should handle partial success and failure correctly', async () => {
                const updates: BulkUpdateDasDto = { updates: [
                        { id: 1, startTime: '08:00:00' }, // Valide
                        { id: 2, endTime: '13:00:00' },   // Invalide (conflit)
                        { id: 3, description: 'New description' } // Valide
                    ]};
                const das1 = createMockDasInstance(createMockDasDto(), 1);
                const das2 = createMockDasInstance(createMockDasDto({ startTime: '10:00:00', endTime: '11:00:00' }), 2);
                const das3 = createMockDasInstance(createMockDasDto({ startTime: '14:00:00', endTime: '15:00:00' }), 3);
                const conflictingDas = createMockDasInstance(createMockDasDto({ startTime: '12:30:00', endTime: '13:30:00' }), 4);

                dailyAdjustmentSlotModelMock.findOne
                    .mockResolvedValueOnce(das1) // Pour l'ID 1
                    .mockResolvedValueOnce(das2) // Pour l'ID 2
                    .mockResolvedValueOnce(das3); // Pour l'ID 3

                dailyAdjustmentSlotModelMock.findAll
                    .mockResolvedValueOnce([])                // Pas de conflit pour l'ID 1
                    .mockResolvedValueOnce([conflictingDas]) // Conflit pour l'ID 2
                    .mockResolvedValueOnce([]);               // Pas de conflit pour l'ID 3

                const result = await service.bulkUpdateDas(updates, establishmentId);

                expect(result.updatedSlots).toHaveLength(2);
                expect(result.errors).toHaveLength(1);
                expect(result.errors[0].dasId).toBe(2);
                expect(result.errors[0].errorCode).toBe('DAS_SLOT_OVERLAP');
                expect(das1.update).toHaveBeenCalled();
                expect(das2.update).not.toHaveBeenCalled();
                expect(das3.update).toHaveBeenCalled();
            });

            it('should return an error for a DAS ID that does not exist', async () => {
                const updates: BulkUpdateDasDto = { updates: [{ id: 999, description: 'Test' }]};
                dailyAdjustmentSlotModelMock.findOne.mockResolvedValue(null);

                const result = await service.bulkUpdateDas(updates, establishmentId);

                expect(result.updatedSlots).toHaveLength(0);
                expect(result.errors).toHaveLength(1);
                expect(result.errors[0].dasId).toBe(999);
                expect(result.errors[0].errorCode).toBe('DAS_NOT_FOUND');
            });
        });

        describe('bulkDeleteDas', () => {
            it('should only delete DAS that belong to the actor\'s establishment', async () => {
                const dto: BulkDeleteDasDto = { dasIds: [1, 2, 3] }; // 3 n'appartient pas à l'établissement
                dailyAdjustmentSlotModelMock.destroy.mockResolvedValue(2); // Simule que 2 lignes ont été supprimées

                await service.bulkDeleteDas(dto, establishmentId);

                expect(dailyAdjustmentSlotModelMock.destroy).toHaveBeenCalledWith({
                    where: {
                        id: { [Op.in]: dto.dasIds },
                        establishmentId: establishmentId, // Vérification de sécurité cruciale
                    },
                    transaction: mockTransaction
                });
            });
        });
    });
});