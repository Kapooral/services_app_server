import { RpmMemberAssignmentService } from '../../../src/services/rpm-member-assignment.service';
import { RpmAssignmentError, RpmNotFoundError, RpmAssignmentNotFoundError } from '../../../src/errors/planning.errors';
import { AppError } from '../../../src/errors/app.errors';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { CreateRpmMemberAssignmentDto, BulkAssignMembersToRpmDto } from '../../../src/dtos/planning/rpm-member-assignment.validation';

// --- Déclaration des Mocks et du Service ---
let rpmMemberAssignmentModelMock: { findOne: jest.Mock; create: jest.Mock; findAll: jest.Mock; findByPk: jest.Mock; destroy: jest.Mock; };
let membershipModelMock: { findOne: jest.Mock; };
let recurringPlanningModelModelMock: { findOne: jest.Mock; };
let sequelizeMock: { transaction: jest.Mock; };
let cacheServiceMock: jest.Mocked<ICacheService>;
let service: RpmMemberAssignmentService;

// --- Helpers de Données de Mock ---
const mockTransaction = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    LOCK: { UPDATE: 'UPDATE' },
};

const mockMembership = { id: 101, establishmentId: 10, userId: 1 };
const mockRpm = { id: 201, establishmentId: 10, name: 'Day Shift' };

const createMockAssignmentInstance = (id: number, startDate: string, endDate: string | null, membershipId = 101) => ({
    id, membershipId, recurringPlanningModelId: 201,
    assignmentStartDate: startDate,
    assignmentEndDate: endDate,
    destroy: jest.fn().mockResolvedValue(1),
    member: { id: membershipId, establishmentId: 10 },
    update: jest.fn().mockImplementation(function(this: any, data: any) {
        Object.assign(this, data);
        return Promise.resolve(this);
    }),
});


describe('RpmMemberAssignmentService', () => {

    beforeEach(() => {
        rpmMemberAssignmentModelMock = {
            findOne: jest.fn(), create: jest.fn(), findAll: jest.fn(),
            findByPk: jest.fn(), destroy: jest.fn(),
        };
        membershipModelMock = { findOne: jest.fn() };
        recurringPlanningModelModelMock = { findOne: jest.fn() };
        sequelizeMock = { transaction: jest.fn().mockResolvedValue(mockTransaction) };
        cacheServiceMock = {
            get: jest.fn(), set: jest.fn(), delete: jest.fn(), flushAll: jest.fn(), deleteByPattern: jest.fn()
        };

        service = new RpmMemberAssignmentService(
            rpmMemberAssignmentModelMock as any,
            membershipModelMock as any,
            recurringPlanningModelModelMock as any,
            sequelizeMock as any,
            cacheServiceMock
        );

        membershipModelMock.findOne.mockResolvedValue(mockMembership);
        recurringPlanningModelModelMock.findOne.mockResolvedValue(mockRpm);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createAssignment', () => {
        const dto: CreateRpmMemberAssignmentDto = {
            membershipId: 101,
            assignmentStartDate: '2024-07-01',
            assignmentEndDate: '2024-12-31',
        };

        it('should create an assignment successfully if no overlaps exist', async () => {
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([]);
            rpmMemberAssignmentModelMock.create.mockResolvedValue(createMockAssignmentInstance(1, dto.assignmentStartDate, dto.assignmentEndDate ?? null));

            await service.createAssignment(dto, 201, 10);

            expect(rpmMemberAssignmentModelMock.create).toHaveBeenCalled();
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should throw RpmAssignmentError on overlapping assignments', async () => {
            const existingAssignment = createMockAssignmentInstance(50, '2024-01-01', '2024-08-30');
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingAssignment]);

            await expect(service.createAssignment(dto, 201, 10)).rejects.toThrow(RpmAssignmentError);

            // --- CORRECTION : La bonne assertion est de vérifier que l'écriture n'a pas eu lieu ---
            expect(rpmMemberAssignmentModelMock.create).not.toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
            expect(mockTransaction.rollback).not.toHaveBeenCalled(); // Le rollback n'est pas appelé car la transaction n'est pas démarrée
        });

        it('should rollback the transaction if the database create call fails', async () => {
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([]); // La validation passe
            const dbError = new AppError('DbError', 500, "Could not create the RPM assignment.");
            rpmMemberAssignmentModelMock.create.mockRejectedValue(dbError); // L'écriture échoue

            await expect(service.createAssignment(dto, 201, 10)).rejects.toThrow(dbError);

            // --- TEST DÉDIÉ : On vérifie que le rollback est appelé pour les erreurs de la DB ---
            expect(mockTransaction.rollback).toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
        });

        it('should throw RpmNotFoundError if trying to assign a member to an RPM from another establishment', async () => {
            // SCÉNARIO : L'admin de l'établissement 10 essaie d'utiliser un RPM de l'établissement 20.
            const dto: CreateRpmMemberAssignmentDto = {
                membershipId: 101,
                assignmentStartDate: '2024-07-01',
                assignmentEndDate: '2024-12-31',
            };
            const actorEstablishmentId = 10;

            // Le membre est bien trouvé dans l'établissement de l'acteur.
            membershipModelMock.findOne.mockResolvedValue(mockMembership);
            // Mais le RPM n'est pas trouvé dans l'établissement de l'acteur.
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);

            await expect(service.createAssignment(dto, 999, actorEstablishmentId))
                .rejects.toThrow(RpmNotFoundError);

            expect(rpmMemberAssignmentModelMock.create).not.toHaveBeenCalled();
        });

        it('should throw RpmAssignmentError when creating an assignment that conflicts with an existing open-ended assignment', async () => {
            // SCÉNARIO : Une affectation "infinie" existe déjà, toute nouvelle affectation doit échouer.
            const dto: CreateRpmMemberAssignmentDto = {
                membershipId: 101,
                assignmentStartDate: '2025-01-01',
                assignmentEndDate: null,
            };
            // L'affectation existante commence en 2024 et n'a pas de date de fin.
            const existingOpenEndedAssignment = createMockAssignmentInstance(50, '2024-01-01', null);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingOpenEndedAssignment]);

            await expect(service.createAssignment(dto, 201, 10))
                .rejects.toThrow(RpmAssignmentError);

            expect(rpmMemberAssignmentModelMock.create).not.toHaveBeenCalled();
        });

    });

    describe('bulkAssignMembersToRpm', () => {
        const bulkDto: BulkAssignMembersToRpmDto = {
            membershipIds: [101, 102, 103],
            assignmentStartDate: '2025-01-01',
            assignmentEndDate: '2025-12-31',
        };

        it('should handle partial success and failure correctly', async () => {
            // --- CORRECTION FINALE : Accepter la signature générique et faire une assertion de type à l'intérieur ---
            const serviceSpy = jest.spyOn(service as any, 'checkForOverlappingAssignments' as any)
                .mockImplementation((...args: unknown[]) => {
                    const membershipId = args[0] as number; // Assertion de type locale
                    if (membershipId === 102) {
                        return Promise.reject(new RpmAssignmentError('Overlap detected for member 102', 'ASSIGNMENT_PERIOD_OVERLAP'));
                    }
                    return Promise.resolve();
                });

            rpmMemberAssignmentModelMock.create
                .mockResolvedValueOnce(createMockAssignmentInstance(1, bulkDto.assignmentStartDate, bulkDto.assignmentEndDate ?? null, 101))
                .mockResolvedValueOnce(createMockAssignmentInstance(2, bulkDto.assignmentStartDate, bulkDto.assignmentEndDate ?? null, 103));

            const result = await service.bulkAssignMembersToRpm(bulkDto, 201, 10);

            expect(result.successfulAssignments).toHaveLength(2);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual(expect.objectContaining({ membershipId: 102 }));
            expect(mockTransaction.commit).toHaveBeenCalledTimes(2);
            expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);

            serviceSpy.mockRestore();
        });
    });

    describe('deleteAssignment', () => {
        it('should delete an assignment and invalidate member schedule cache', async () => {
            const assignmentId = 55;
            const mockAssignment = createMockAssignmentInstance(assignmentId, '2024-01-01', null);
            rpmMemberAssignmentModelMock.findByPk.mockResolvedValue(mockAssignment);

            await service.deleteAssignment(assignmentId, 10);

            expect(mockAssignment.destroy).toHaveBeenCalled();
            expect(cacheServiceMock.deleteByPattern).toHaveBeenCalledWith(`schedule:estId10:membId101:date*`);
        });

        it('should throw RpmAssignmentNotFoundError if assignment does not exist', async () => {
            rpmMemberAssignmentModelMock.findByPk.mockResolvedValue(null);

            await expect(service.deleteAssignment(999, 10)).rejects.toThrow(RpmAssignmentNotFoundError);
        });
    });

    describe('updateAssignment', () => {

        it('should throw RpmAssignmentError when updating an assignment to create an overlap', async () => {
            // SCÉNARIO : On met à jour l'affectation A pour qu'elle empiète sur l'affectation B.
            const assignmentToUpdateId = 1;
            const updateDto = { assignmentEndDate: '2024-04-15' }; // On prolonge la date de fin

            const assignmentA = createMockAssignmentInstance(assignmentToUpdateId, '2024-01-01', '2024-02-28');
            const assignmentB = createMockAssignmentInstance(2, '2024-04-01', '2024-05-31');

            // 1. findByPk trouve l'affectation A à mettre à jour.
            rpmMemberAssignmentModelMock.findByPk.mockResolvedValue(assignmentA);
            // 2. findAll (dans checkForOverlappingAssignments) trouve l'affectation B.
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([assignmentB]);

            await expect(service.updateAssignment(assignmentToUpdateId, updateDto, 10))
                .rejects.toThrow(RpmAssignmentError);

            // On vérifie que la méthode 'update' de l'instance Sequelize n'a pas été appelée.
            // Pour cela, il faut s'assurer que l'instance mockée a une méthode 'update' qui est un mock jest.
            const spiedUpdate = jest.spyOn(assignmentA, 'update');
            expect(spiedUpdate).not.toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
        });

    });
});