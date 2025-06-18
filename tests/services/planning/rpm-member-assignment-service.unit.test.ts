import { Op } from 'sequelize'
import { RpmMemberAssignmentService } from '../../../src/services/rpm-member-assignment.service';
import { RpmAssignmentError, RpmNotFoundError, RpmAssignmentNotFoundError } from '../../../src/errors/planning.errors';
import { AppError } from '../../../src/errors/app.errors';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { CreateRpmMemberAssignmentDto, BulkAssignMembersToRpmDto, UpdateRpmMemberAssignmentDto, BulkUnassignMembersFromRpmDto } from '../../../src/dtos/planning/rpm-member-assignment.validation';

// --- Déclaration des Mocks et du Service ---
let rpmMemberAssignmentModelMock: { findOne: jest.Mock; create: jest.Mock; findAll: jest.Mock; findByPk: jest.Mock; destroy: jest.Mock; };
let membershipModelMock: { findOne: jest.Mock; findAll: jest.Mock; };
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
        membershipModelMock = { findOne: jest.fn(), findAll: jest.fn() };
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

            expect(rpmMemberAssignmentModelMock.create).not.toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
            expect(mockTransaction.rollback).not.toHaveBeenCalled();
        });

        it('should rollback the transaction if the database create call fails', async () => {
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([]);
            const dbError = new AppError('DbError', 500, "Could not create the RPM assignment.");
            rpmMemberAssignmentModelMock.create.mockRejectedValue(dbError);

            await expect(service.createAssignment(dto, 201, 10)).rejects.toThrow(dbError);

            expect(mockTransaction.rollback).toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
        });

        it('should throw RpmNotFoundError if trying to assign a member to an RPM from another establishment', async () => {
            membershipModelMock.findOne.mockResolvedValue(mockMembership);
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);

            await expect(service.createAssignment(dto, 999, 10))
                .rejects.toThrow(RpmNotFoundError);
            expect(rpmMemberAssignmentModelMock.create).not.toHaveBeenCalled();
        });

        describe('Overlap Edge Cases', () => {
            it('should succeed when the new assignment starts exactly when an existing one ends (adjacence)', async () => {
                const existingAssignment = createMockAssignmentInstance(50, '2024-01-01', '2024-06-30');
                const newAssignmentDto: CreateRpmMemberAssignmentDto = { membershipId: 101, assignmentStartDate: '2024-07-01', assignmentEndDate: '2024-12-31' };
                rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingAssignment]);
                rpmMemberAssignmentModelMock.create.mockResolvedValue(
                    createMockAssignmentInstance(51, newAssignmentDto.assignmentStartDate, newAssignmentDto.assignmentEndDate ?? null)
                );

                // On s'attend à ce que la création réussisse
                await expect(service.createAssignment(newAssignmentDto, 201, 10)).resolves.toBeDefined();
                expect(rpmMemberAssignmentModelMock.create).toHaveBeenCalled();
            });

            it('should fail when the new assignment starts one day before an existing one ends', async () => {
                const existingAssignment = createMockAssignmentInstance(50, '2024-07-01', '2024-12-31');
                const newAssignmentDto: CreateRpmMemberAssignmentDto = { membershipId: 101, assignmentStartDate: '2024-01-01', assignmentEndDate: '2024-07-01' };
                rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingAssignment]);

                await expect(service.createAssignment(newAssignmentDto, 201, 10)).rejects.toThrow(RpmAssignmentError);
            });

            it('should fail when the new assignment is completely contained within an existing one', async () => {
                const existingAssignment = createMockAssignmentInstance(50, '2024-01-01', '2024-12-31');
                const newAssignmentDto: CreateRpmMemberAssignmentDto = { membershipId: 101, assignmentStartDate: '2024-03-01', assignmentEndDate: '2024-06-30' };
                rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingAssignment]);

                await expect(service.createAssignment(newAssignmentDto, 201, 10)).rejects.toThrow(RpmAssignmentError);
            });

            it('should fail when the new assignment contains an existing one', async () => {
                const existingAssignment = createMockAssignmentInstance(50, '2024-03-01', '2024-06-30');
                const newAssignmentDto: CreateRpmMemberAssignmentDto = { membershipId: 101, assignmentStartDate: '2024-01-01', assignmentEndDate: '2024-12-31' };
                rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingAssignment]);

                await expect(service.createAssignment(newAssignmentDto, 201, 10)).rejects.toThrow(RpmAssignmentError);
            });

            it('should succeed when creating an open-ended assignment after a finite one', async () => {
                const existingAssignment = createMockAssignmentInstance(50, '2024-01-01', '2024-12-31');
                const newAssignmentDto: CreateRpmMemberAssignmentDto = { membershipId: 101, assignmentStartDate: '2025-01-01', assignmentEndDate: null };
                rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingAssignment]);
                rpmMemberAssignmentModelMock.create.mockResolvedValue(
                    createMockAssignmentInstance(51, newAssignmentDto.assignmentStartDate, newAssignmentDto.assignmentEndDate ?? null)
                );

                await expect(service.createAssignment(newAssignmentDto, 201, 10)).resolves.toBeDefined();
            });

            it('should throw RpmAssignmentError when creating a finite assignment that conflicts with an open-ended one', async () => {
                const existingOpenEndedAssignment = createMockAssignmentInstance(50, '2024-01-01', null);
                rpmMemberAssignmentModelMock.findAll.mockResolvedValue([existingOpenEndedAssignment]);
                const newAssignmentDto: CreateRpmMemberAssignmentDto = { membershipId: 101, assignmentStartDate: '2025-01-01', assignmentEndDate: '2025-12-31' };

                await expect(service.createAssignment(newAssignmentDto, 201, 10)).rejects.toThrow(RpmAssignmentError);
            });
        });
    });

    describe('updateAssignment', () => {

        it('should throw RpmAssignmentError when updating an assignment to create an overlap', async () => {
            const assignmentToUpdateId = 1;
            const updateDto = { assignmentEndDate: '2024-04-15' };
            const assignmentA = createMockAssignmentInstance(assignmentToUpdateId, '2024-01-01', '2024-02-28');
            const assignmentB = createMockAssignmentInstance(2, '2024-04-01', '2024-05-31');

            rpmMemberAssignmentModelMock.findByPk.mockResolvedValue(assignmentA);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([assignmentB]);

            await expect(service.updateAssignment(assignmentToUpdateId, updateDto, 10)).rejects.toThrow(RpmAssignmentError);
            expect(assignmentA.update).not.toHaveBeenCalled();
            expect(mockTransaction.commit).not.toHaveBeenCalled();
        });

        it('should allow updating an assignment without creating an overlap with itself', async () => {
            const assignmentId = 1;
            const updateDto: UpdateRpmMemberAssignmentDto = { assignmentEndDate: '2024-08-31' };
            const assignment = createMockAssignmentInstance(assignmentId, '2024-01-01', '2024-06-30');
            rpmMemberAssignmentModelMock.findByPk.mockResolvedValue(assignment);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([]); // Il n'y a pas d'AUTRES affectations

            await expect(service.updateAssignment(assignmentId, updateDto, 10)).resolves.toBeDefined();
            expect(assignment.update).toHaveBeenCalledWith(expect.objectContaining(updateDto), expect.any(Object));
            expect(mockTransaction.commit).toHaveBeenCalled();
        });

        it('should allow shortening an assignment\'s duration', async () => {
            const assignmentId = 1;
            const updateDto: UpdateRpmMemberAssignmentDto = { assignmentEndDate: '2024-06-30' };
            const assignment = createMockAssignmentInstance(assignmentId, '2024-01-01', '2024-12-31');
            rpmMemberAssignmentModelMock.findByPk.mockResolvedValue(assignment);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([]);

            await expect(service.updateAssignment(assignmentId, updateDto, 10)).resolves.toBeDefined();
            expect(assignment.update).toHaveBeenCalledWith(expect.objectContaining(updateDto), expect.any(Object));
        });

        it('should correctly update an open-ended assignment to have a finite end date', async () => {
            const assignmentId = 1;
            const updateDto: UpdateRpmMemberAssignmentDto = { assignmentEndDate: '2024-12-31' };
            const assignment = createMockAssignmentInstance(assignmentId, '2024-01-01', null);
            rpmMemberAssignmentModelMock.findByPk.mockResolvedValue(assignment);
            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([]);

            await expect(service.updateAssignment(assignmentId, updateDto, 10)).resolves.toBeDefined();
            expect(assignment.update).toHaveBeenCalledWith(
                expect.objectContaining({ assignmentEndDate: '2024-12-31' }),
                expect.any(Object)
            );
        });
    });

    describe('bulkAssignMembersToRpm', () => {
        const bulkDto: BulkAssignMembersToRpmDto = {
            membershipIds: [101, 102, 103],
            assignmentStartDate: '2025-01-01',
            assignmentEndDate: '2025-12-31',
        };

        it('should handle partial success and failure correctly (due to overlap)', async () => {
            const existingAssignmentForMember102 = createMockAssignmentInstance(50, '2025-01-01', '2025-01-15', 102);

            // Mock des appels à la DB dans l'ordre d'exécution
            rpmMemberAssignmentModelMock.findAll
                .mockResolvedValueOnce([]) // Pas de conflit pour le membre 101
                .mockResolvedValueOnce([existingAssignmentForMember102]) // Conflit pour le membre 102
                .mockResolvedValueOnce([]); // Pas de conflit pour le membre 103

            // Mock des appels à la création qui réussissent
            rpmMemberAssignmentModelMock.create
                .mockResolvedValueOnce(createMockAssignmentInstance(1, bulkDto.assignmentStartDate, bulkDto.assignmentEndDate ?? null, 101))
                .mockResolvedValueOnce(createMockAssignmentInstance(2, bulkDto.assignmentStartDate, bulkDto.assignmentEndDate ?? null, 103));

            const result = await service.bulkAssignMembersToRpm(bulkDto, 201, 10);

            expect(result.successfulAssignments).toHaveLength(2);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual(expect.objectContaining({ membershipId: 102, errorCode: 'ASSIGNMENT_PERIOD_OVERLAP' }));
            expect(mockTransaction.commit).toHaveBeenCalledTimes(2);
            expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
        });

        it('should return a specific error if a membershipId does not exist', async () => {
            const dtoWithInvalidMember = { ...bulkDto, membershipIds: [101, 999] };
            membershipModelMock.findOne
                .mockResolvedValueOnce(mockMembership) // For 101
                .mockResolvedValueOnce(null);           // For 999

            rpmMemberAssignmentModelMock.findAll.mockResolvedValue([]);

            // Utilisation de l'opérateur de coalescence nulle `?? null`
            rpmMemberAssignmentModelMock.create.mockResolvedValue(createMockAssignmentInstance(1, dtoWithInvalidMember.assignmentStartDate, dtoWithInvalidMember.assignmentEndDate ?? null, 101));

            const result = await service.bulkAssignMembersToRpm(dtoWithInvalidMember, 201, 10);

            expect(result.successfulAssignments).toHaveLength(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual(expect.objectContaining({ membershipId: 999, errorCode: 'MEMBERSHIP_NOT_FOUND' }));
        });

        it('should not create any assignments if the target RPM does not exist', async () => {
            recurringPlanningModelModelMock.findOne.mockResolvedValue(null);

            await expect(service.bulkAssignMembersToRpm(bulkDto, 999, 10)).rejects.toThrow(RpmNotFoundError);
            expect(rpmMemberAssignmentModelMock.create).not.toHaveBeenCalled();
        });
    });

    describe('bulkUnassignMembersFromRpm', () => {
        it('should correctly unassign only the members specified from the given RPM', async () => {
            const dto: BulkUnassignMembersFromRpmDto = { membershipIds: [101, 102] };
            const rpmId = 201;
            membershipModelMock.findAll.mockResolvedValue([{id: 101}, {id: 102}]);
            rpmMemberAssignmentModelMock.destroy.mockResolvedValue(2); // Simule 2 suppressions

            const result = await service.bulkUnassignMembersFromRpm(dto, rpmId, 10);

            expect(rpmMemberAssignmentModelMock.destroy).toHaveBeenCalledWith({
                where: {
                    membershipId: { [Op.in]: [101, 102] },
                    recurringPlanningModelId: rpmId,
                },
                transaction: mockTransaction
            });
            expect(result.successCount).toBe(2);
            expect(result.errors).toHaveLength(0);
        });

        it('should return an error for membershipIds that do not belong to the establishment', async () => {
            const dto: BulkUnassignMembersFromRpmDto = { membershipIds: [101, 999] }; // 999 n'existe pas
            const rpmId = 201;
            // La DB ne renvoie que le membre valide
            membershipModelMock.findAll.mockResolvedValue([{ id: 101 }]);
            rpmMemberAssignmentModelMock.destroy.mockResolvedValue(1);

            const result = await service.bulkUnassignMembersFromRpm(dto, rpmId, 10);

            // On vérifie qu'on essaye bien de supprimer uniquement les membres valides
            expect(rpmMemberAssignmentModelMock.destroy).toHaveBeenCalledWith({
                where: {
                    membershipId: { [Op.in]: [101] },
                    recurringPlanningModelId: rpmId,
                },
                transaction: mockTransaction
            });
            expect(result.successCount).toBe(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual(expect.objectContaining({ membershipId: 999, errorCode: 'MEMBERSHIP_NOT_FOUND' }));
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
});