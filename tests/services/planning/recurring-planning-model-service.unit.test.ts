import { Op } from 'sequelize';
import { RecurringPlanningModelService } from '../../../src/services/recurring-planning-model.service';
import { RpmNameConflictError, RpmNotFoundError, RpmCreationError } from '../../../src/errors/planning.errors';
import { CreateRecurringPlanningModelDto, UpdateRecurringPlanningModelDto, ListRecurringPlanningModelsQueryDto } from '../../../src/dtos/planning/recurring-planning-model.validation';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { DefaultBlockType, BreakType } from '../../../src/types/planning.enums';

jest.mock('uuid', () => ({
    v4: () => 'mock-uuid-for-break',
}));

// --- Déclaration des Mocks et du Service ---
let recurringPlanningModelModelMock: { findOne: jest.Mock; create: jest.Mock; findAndCountAll: jest.Mock; };
let rpmMemberAssignmentModelMock: { findAll: jest.Mock };
let sequelizeMock: { transaction: jest.Mock };
let cacheServiceMock: jest.Mocked<ICacheService>;
let service: RecurringPlanningModelService;

// --- Helpers de Données de Mock ---
const mockTransaction = {
    commit: jest.fn(),
    rollback: jest.fn(),
    LOCK: { UPDATE: 'UPDATE' },
};

const createMockRpmDto = (overrides: Partial<CreateRecurringPlanningModelDto> = {}): CreateRecurringPlanningModelDto => ({
    name: 'Morning Shift',
    referenceDate: '2024-01-01',
    globalStartTime: '08:00:00',
    globalEndTime: '12:00:00',
    rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU',
    defaultBlockType: DefaultBlockType.WORK,
    breaks: [{
        id: 'mock-id-to-satisfy-type',
        startTime: '10:00:00',
        endTime: '10:15:00',
        breakType: BreakType.SHORT_REST,
        description: 'Coffee Break',
    }],
    ...overrides
});

const createMockRpmInstance = (dto: any, establishmentId: number, id = 1) => ({
    id,
    establishmentId,
    ...dto,
    breaks: dto.breaks?.map((b: any) => ({ ...b, id: b.id || 'mock-uuid-for-break' })) ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
    destroy: jest.fn().mockResolvedValue(1),
    update: jest.fn().mockImplementation(function(this: any, data: any) {
        Object.assign(this, data);
        return Promise.resolve(this);
    }),
});

describe('RecurringPlanningModelService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        recurringPlanningModelModelMock = { findOne: jest.fn(), create: jest.fn(), findAndCountAll: jest.fn(), };
        rpmMemberAssignmentModelMock = { findAll: jest.fn(), };
        sequelizeMock = { transaction: jest.fn().mockResolvedValue(mockTransaction), };
        cacheServiceMock = { get: jest.fn(), set: jest.fn(), delete: jest.fn(), flushAll: jest.fn(), deleteByPattern: jest.fn() };
        service = new RecurringPlanningModelService(
            recurringPlanningModelModelMock as any, rpmMemberAssignmentModelMock as any,
            sequelizeMock as any, cacheServiceMock
        );
    });

    describe('createRpm', () => {
        it('should create a new RPM successfully with valid data', async () => {
            const dto = createMockRpmDto();
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);
            recurringPlanningModelModelMock.create.mockResolvedValue(createMockRpmInstance(dto, 10));
            const result = await service.createRpm(dto, 10);
            expect(recurringPlanningModelModelMock.create).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it('should throw RpmNameConflictError if an RPM with the same name already exists', async () => {
            const dto = createMockRpmDto();
            recurringPlanningModelModelMock.findOne.mockResolvedValue(createMockRpmInstance(dto, 10));
            await expect(service.createRpm(dto, 10)).rejects.toThrow(RpmNameConflictError);
        });

        it('should fail if rruleString is invalid', async () => {
            const dto = createMockRpmDto({ rruleString: 'INVALID-RULE' });
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);
            // La validation a lieu avant l'appel à la DB, donc on ne mocke pas .create
            await expect(service.createRpm(dto, 10)).rejects.toThrow(RpmCreationError);
        });
    });

    describe('updateRpm', () => {
        it('should update an RPM and invalidate all relevant caches', async () => {
            const establishmentId = 10;
            const rpmId = 1;
            const updateDto = { name: 'New Shift Name' } as UpdateRecurringPlanningModelDto;
            const mockRpmInstance = createMockRpmInstance(createMockRpmDto(), establishmentId);
            const mockAssignments = [
                { membershipId: 101, member: { establishmentId } },
                { membershipId: 102, member: { establishmentId } },
            ];

            recurringPlanningModelModelMock.findOne.mockResolvedValueOnce(mockRpmInstance).mockResolvedValueOnce(null);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue(mockAssignments);

            const result = await service.updateRpm(rpmId, updateDto, establishmentId);

            expect(mockRpmInstance.update).toHaveBeenCalledWith(updateDto, { transaction: mockTransaction });
            expect(result.name).toBe('New Shift Name');

            // --- CORRECTION CLÉ : Assertions précises pour l'invalidation du cache ---
            expect(cacheServiceMock.delete).toHaveBeenCalledWith(`rpm:estId10:id1`); // Cache de l'objet RPM
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledWith(`rpms:estId10:`); // Cache des listes
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledWith(`schedule:estId10:membId101:date*`); // Cache du membre 1
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledWith(`schedule:estId10:membId102:date*`); // Cache du membre 2
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledTimes(3); // 1 pour la liste + 2 pour les membres
        });

        it('should throw RpmNotFoundError if trying to update a non-existent RPM', async () => {
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);
            await expect(service.updateRpm(999, { name: 'New' } as UpdateRecurringPlanningModelDto, 10)).rejects.toThrow(RpmNotFoundError);
        });

        it('should throw RpmNameConflictError when updating a name to one that already exists', async () => {
            const rpmIdToUpdate = 1;
            const updateDto = { name: 'Existing Name' } as UpdateRecurringPlanningModelDto;
            const rpmToUpdateInstance = createMockRpmInstance(createMockRpmDto(), 10, rpmIdToUpdate);
            const conflictingRpmInstance = createMockRpmInstance(createMockRpmDto({ name: 'Existing Name' }), 10, 2);

            recurringPlanningModelModelMock.findOne.mockResolvedValueOnce(rpmToUpdateInstance).mockResolvedValueOnce(conflictingRpmInstance);

            await expect(service.updateRpm(rpmIdToUpdate, updateDto, 10)).rejects.toThrow(RpmNameConflictError);
            expect(rpmToUpdateInstance.update).not.toHaveBeenCalled();
        });
    });

    describe('deleteRpm', () => {
        it('should successfully delete an RPM and invalidate all related caches', async () => {
            const establishmentId = 10;
            const rpmId = 1;
            const mockRpmInstance = createMockRpmInstance(createMockRpmDto(), establishmentId, rpmId);
            const mockAssignments = [
                { membershipId: 101, member: { establishmentId } },
                { membershipId: 102, member: { establishmentId } },
            ];

            recurringPlanningModelModelMock.findOne.mockResolvedValue(mockRpmInstance);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue(mockAssignments);

            await service.deleteRpm(rpmId, establishmentId);

            expect(mockRpmInstance.destroy).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();

            // Vérifier que tous les caches pertinents sont invalidés
            expect(cacheServiceMock.delete).toHaveBeenCalledWith(`rpm:estId10:id1`);
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledWith(`rpms:estId10:`);
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledWith(`schedule:estId10:membId101:date*`);
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledWith(`schedule:estId10:membId102:date*`);
        });

        it('should fail to delete an RPM if it does not belong to the actor\'s establishment', async () => {
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);
            await expect(service.deleteRpm(1, 10)).rejects.toThrow(RpmNotFoundError);
        });
    });

    describe('listRpmsForEstablishment', () => {
        const baseQuery: ListRecurringPlanningModelsQueryDto = {
            page: 1,
            limit: 10,
            sortBy: 'name',
            sortOrder: 'asc'
        };

        it('should return a paginated list of RPMs', async () => {
            // Surcharger la base avec les valeurs spécifiques au test
            const query: ListRecurringPlanningModelsQueryDto = { ...baseQuery, page: 2, limit: 5 };
            const establishmentId = 10;
            recurringPlanningModelModelMock.findAndCountAll.mockResolvedValue({ count: 12, rows: [] });

            await service.listRpmsForEstablishment(query, establishmentId);

            expect(recurringPlanningModelModelMock.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                limit: 5,
                offset: 5, // (page 2 - 1) * 5
                where: { establishmentId: 10 }
            }));
        });

        it('should filter RPMs by name when searchByName is provided', async () => {
            // Surcharger la base avec les valeurs spécifiques au test
            const query: ListRecurringPlanningModelsQueryDto = { ...baseQuery, searchByName: 'Shift' };
            const establishmentId = 10;
            recurringPlanningModelModelMock.findAndCountAll.mockResolvedValue({ count: 1, rows: [] });

            await service.listRpmsForEstablishment(query, establishmentId);

            expect(recurringPlanningModelModelMock.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                where: {
                    establishmentId: 10,
                    // Note: Op.like pour MySQL, Op.iLike pour PostgreSQL.
                    // Le test doit être agnostique, ou on choisit l'un. Op.like est plus universel.
                    name: { [Op.like]: '%Shift%' }
                }
            }));
        });

        it('should sort the results correctly', async () => {
            // Surcharger la base avec les valeurs spécifiques au test
            const query: ListRecurringPlanningModelsQueryDto = { ...baseQuery, sortBy: 'createdAt', sortOrder: 'desc' };
            const establishmentId = 10;
            recurringPlanningModelModelMock.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

            await service.listRpmsForEstablishment(query, establishmentId);

            expect(recurringPlanningModelModelMock.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
                order: [['createdAt', 'DESC']]
            }));
        });
    });
});