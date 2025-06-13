// tests/services/planning/rpm-member-assignment-service.integration.test.ts

import { execSync } from 'child_process';
import { Sequelize } from 'sequelize';
import bcrypt from 'bcrypt';
import db from '../../../src/models';
import { RpmMemberAssignmentService } from '../../../src/services/rpm-member-assignment.service';
import { RpmAssignmentError } from '../../../src/errors/planning.errors';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { DefaultBlockType } from '../../../src/types/planning.enums';
import { MembershipRole, MembershipStatus } from '../../../src/models';

// --- Déclaration ---
let service: RpmMemberAssignmentService;
let sequelize: Sequelize;
let testUserAdmin: any;
let testEstablishment: any;
let testRpm: any;

const mockCacheService: jest.Mocked<ICacheService> = {
    get: jest.fn(), set: jest.fn(), delete: jest.fn(),
    flushAll: jest.fn(), deleteByPattern: jest.fn(),
};

describe('RpmMemberAssignmentService - Integration Tests', () => {

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') { throw new Error('Tests d\'intégration à lancer en environnement de test.'); }

        sequelize = db.sequelize;

        execSync('npm run migrate:undo:all:test', { stdio: 'ignore' });
        execSync('npm run migrate:test', { stdio: 'ignore' });

        // --- CORRECTION DÉFINITIVE : Respecter l'ordre des dépendances pour le nettoyage ---
        // On supprime les enfants AVANT les parents.
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.RecurringPlanningModel.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUserAdmin = await db.User.create({
            username: 'admin_assign_final',
            email: 'admin_assign_final@test.com',
            password: hashedPassword,
            email_masked: 'masked-admin@test.com',
        });

        testEstablishment = await db.Establishment.create({
            name: "Final Assignment Test Studio", siret: "33344455566677",
            siren: "333444555", owner_id: testUserAdmin.id,
            is_validated: true, address_line1: 'a3', city: 'c3',
            postal_code: 'p3', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
        });

        testRpm = await db.RecurringPlanningModel.create({
            name: 'Final Shift for Assignments', establishmentId: testEstablishment.id,
            referenceDate: '2024-01-01', globalStartTime: '09:00:00',
            globalEndTime: '17:00:00', rruleString: 'FREQ=DAILY',
            defaultBlockType: DefaultBlockType.WORK, breaks: [],
        });

        service = new RpmMemberAssignmentService(
            db.RecurringPlanningModelMemberAssignment,
            db.Membership,
            db.RecurringPlanningModel,
            sequelize,
            mockCacheService
        );
    });

    afterAll(async () => {
        if (sequelize) { await sequelize.close(); }
    });

    afterEach(async () => {
        // L'ordre est également crucial ici.
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        if (testUserAdmin) {
            await db.User.destroy({ where: { id: { [db.Sequelize.Op.ne]: testUserAdmin.id } } });
        }
    });

    const createTestMember = async (email: string) => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        const user = await db.User.create({
            username: email.split('@')[0],
            email: email,
            password: hashedPassword,
            email_masked: `masked-${email}`,
        });
        return await db.Membership.create({
            userId: user.id, establishmentId: testEstablishment.id,
            role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE
        });
    };

    it('should create a valid assignment between a member and an RPM', async () => {
        const member = await createTestMember('member1@test.com');
        await service.createAssignment({
            membershipId: member.id,
            assignmentStartDate: '2024-01-01',
            assignmentEndDate: '2024-12-31',
        }, testRpm.id, testEstablishment.id);
        const assignmentInDb = await db.RecurringPlanningModelMemberAssignment.findOne({ where: { membershipId: member.id } });
        expect(assignmentInDb).not.toBeNull();
        expect(assignmentInDb?.recurringPlanningModelId).toBe(testRpm.id);
    });

    it('should prevent creating an overlapping assignment and rollback', async () => {
        const member = await createTestMember('member2@test.com');
        await service.createAssignment({ membershipId: member.id, assignmentStartDate: '2024-01-01', assignmentEndDate: '2024-06-30' }, testRpm.id, testEstablishment.id);
        await expect(service.createAssignment({ membershipId: member.id, assignmentStartDate: '2024-05-01', assignmentEndDate: '2024-08-01' }, testRpm.id, testEstablishment.id)).rejects.toThrow(RpmAssignmentError);
        const assignmentCount = await db.RecurringPlanningModelMemberAssignment.count({ where: { membershipId: member.id } });
        expect(assignmentCount).toBe(1);
    });

    it('should handle bulk assignments atomically, committing successes and skipping failures', async () => {
        const memberA = await createTestMember('memberA@test.com');
        const memberB = await createTestMember('memberB@test.com');
        const memberC = await createTestMember('memberC@test.com');
        await db.RecurringPlanningModelMemberAssignment.create({ membershipId: memberB.id, recurringPlanningModelId: testRpm.id, assignmentStartDate: '2024-01-01', assignmentEndDate: '2024-12-31' });
        const result = await service.bulkAssignMembersToRpm({ membershipIds: [memberA.id, memberB.id, memberC.id], assignmentStartDate: '2024-06-01', assignmentEndDate: '2024-07-31' }, testRpm.id, testEstablishment.id);
        expect(result.successfulAssignments).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        const assignmentCount = await db.RecurringPlanningModelMemberAssignment.count();
        expect(assignmentCount).toBe(3);
    });
});