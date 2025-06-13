import { RecurringPlanningModelService } from '../../../src/services/recurring-planning-model.service';
import { RpmNameConflictError, RpmNotFoundError } from '../../../src/errors/planning.errors';
import { CreateRecurringPlanningModelDto, UpdateRecurringPlanningModelDto } from '../../../src/dtos/planning/recurring-planning-model.validation';
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

const createMockRpmDto = (): CreateRecurringPlanningModelDto => ({
    name: 'Morning Shift',
    referenceDate: '2024-01-01',
    globalStartTime: '08:00:00',
    globalEndTime: '12:00:00',
    rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU',
    defaultBlockType: DefaultBlockType.WORK,
    breaks: [{
        // --- CORRECTION : Ajout d'un ID pour satisfaire le type RPMBreakDto ---
        // Le DTO l'exige, même si le service le génère/remplace.
        id: 'mock-id-to-satisfy-type',
        startTime: '10:00:00',
        endTime: '10:15:00',
        breakType: BreakType.SHORT_REST,
        description: 'Coffee Break',
    }],
});

const createMockRpmInstance = (dto: any, establishmentId: number) => ({
    id: 1,
    establishmentId,
    ...dto,
    breaks: dto.breaks.map((b: any) => ({ ...b, id: 'mock-uuid-for-break' })),
    createdAt: new Date(),
    updatedAt: new Date(),
    update: jest.fn().mockImplementation(function(this: any, data: any) {
        Object.assign(this, data);
        return Promise.resolve(this);
    }),
});

describe('RecurringPlanningModelService', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        recurringPlanningModelModelMock = {
            findOne: jest.fn(), create: jest.fn(), findAndCountAll: jest.fn(),
        };
        rpmMemberAssignmentModelMock = {
            findAll: jest.fn(),
        };
        sequelizeMock = {
            transaction: jest.fn().mockResolvedValue(mockTransaction),
        };
        cacheServiceMock = {
            get: jest.fn(), set: jest.fn(), delete: jest.fn(), flushAll: jest.fn(), deleteByPattern: jest.fn()
        };

        service = new RecurringPlanningModelService(
            recurringPlanningModelModelMock as any,
            rpmMemberAssignmentModelMock as any,
            sequelizeMock as any,
            cacheServiceMock
        );
    });

    describe('createRpm', () => {
        it('should create a new RPM successfully with valid data', async () => {
            const establishmentId = 10;
            const dto = createMockRpmDto();
            const mockCreatedRpm = createMockRpmInstance(dto, establishmentId);

            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);
            recurringPlanningModelModelMock.create.mockResolvedValue(mockCreatedRpm);

            const result = await service.createRpm(dto, establishmentId);

            expect(recurringPlanningModelModelMock.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Morning Shift' }),
                { transaction: mockTransaction }
            );
            expect(mockTransaction.commit).toHaveBeenCalled();
            expect(result.id).toBe(mockCreatedRpm.id);
        });

        it('should throw RpmNameConflictError if an RPM with the same name already exists', async () => {
            const establishmentId = 10;
            const dto = createMockRpmDto();
            const mockExistingRpm = createMockRpmInstance(dto, establishmentId);

            recurringPlanningModelModelMock.findOne.mockResolvedValue(mockExistingRpm);

            await expect(service.createRpm(dto, establishmentId)).rejects.toThrow(RpmNameConflictError);
            expect(recurringPlanningModelModelMock.create).not.toHaveBeenCalled();
        });
    });

    describe('updateRpm', () => {
        it('should update an RPM and invalidate schedules for all assigned members', async () => {
            const establishmentId = 10;
            const rpmId = 1;
            // --- CORRECTION : Utilisation d'une assertion de type pour informer TS que ---
            // notre objet partiel est acceptable pour ce test.
            const updateDto = { name: 'New Shift Name' } as UpdateRecurringPlanningModelDto;

            const mockRpmInstance = createMockRpmInstance(createMockRpmDto(), establishmentId);
            const mockAssignments = [{ membershipId: 101, establishmentId }, { membershipId: 102, establishmentId }];

            recurringPlanningModelModelMock.findOne
                .mockResolvedValueOnce(mockRpmInstance)
                .mockResolvedValueOnce(null);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue(mockAssignments);

            const result = await service.updateRpm(rpmId, updateDto, establishmentId);

            expect(mockRpmInstance.update).toHaveBeenCalledWith(updateDto, { transaction: mockTransaction });
            expect(result.name).toBe('New Shift Name');
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledTimes(2);
        });

        it('should throw RpmNotFoundError if trying to update a non-existent RPM', async () => {
            const establishmentId = 10;
            const rpmId = 999;
            // --- CORRECTION : Typage correct avec assertion ---
            const updateDto = { name: 'New Name' } as UpdateRecurringPlanningModelDto;

            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);

            await expect(service.updateRpm(rpmId, updateDto, establishmentId)).rejects.toThrow(RpmNotFoundError);
        });

        it('should throw RpmNameConflictError when updating a name to one that already exists', async () => {
            // SCÉNARIO : On renomme RPM ID:1 avec le nom de RPM ID:2, ce qui doit échouer.
            const establishmentId = 10;
            const rpmIdToUpdate = 1;
            const updateDto = { name: 'Existing Name' } as UpdateRecurringPlanningModelDto;

            const rpmToUpdateInstance = createMockRpmInstance({ ...createMockRpmDto(), name: 'Old Name' }, establishmentId);
            const conflictingRpmInstance = createMockRpmInstance({ ...createMockRpmDto(), name: 'Existing Name' }, establishmentId);
            conflictingRpmInstance.id = 2; // Il a un ID différent

            // Premier findOne (dans findRpmForUpdate) trouve le RPM à mettre à jour.
            recurringPlanningModelModelMock.findOne.mockResolvedValueOnce(rpmToUpdateInstance);

            // Second findOne (dans validateRpmUpdate) trouve le RPM conflictuel par son nom.
            recurringPlanningModelModelMock.findOne.mockResolvedValueOnce(conflictingRpmInstance);

            await expect(service.updateRpm(rpmIdToUpdate, updateDto, establishmentId))
                .rejects.toThrow(RpmNameConflictError);

            // On s'assure que l'opération d'écriture n'a jamais eu lieu.
            expect(rpmToUpdateInstance.update).not.toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
        });
    });
});