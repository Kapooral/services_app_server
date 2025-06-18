// tests/services/planning/daily-schedule-service.integration.test.ts

import { execSync } from 'child_process';
import { Sequelize } from 'sequelize';
import bcrypt from 'bcrypt';
import db from '../../../src/models';
import { DailyScheduleService } from '../../../src/services/daily-schedule.service';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { MembershipRole, MembershipStatus } from '../../../src/models';
import { SlotType, DefaultBlockType, BreakType } from '../../../src/types/planning.enums';

// --- Configuration et Déclaration ---
let service: DailyScheduleService;
let sequelize: Sequelize;
let testUserAdmin: any;
let testEstablishment: any;

const mockCacheService: jest.Mocked<ICacheService> = {
    get: jest.fn(), set: jest.fn(), delete: jest.fn(),
    flushAll: jest.fn(), deleteByPattern: jest.fn(),
};

describe('DailyScheduleService - Integration Tests', () => {

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') { throw new Error('Tests d\'intégration à lancer en environnement de test.'); }

        sequelize = db.sequelize;

        execSync('npm run migrate:undo:all:test', { stdio: 'ignore' });
        execSync('npm run migrate:test', { stdio: 'ignore' });

        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.RecurringPlanningModel.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUserAdmin = await db.User.create({
            username: 'admin_sched_integ', email: 'admin_sched_integ@test.com',
            password: hashedPassword, email_masked: 'masked-sched@test.com',
        });

        testEstablishment = await db.Establishment.create({
            name: "Schedule Calculation Test Studio", siret: "33344455566677",
            siren: "333444555", owner_id: testUserAdmin.id,
            is_validated: true, address_line1: 'a3', city: 'c3',
            postal_code: 'p3', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
        });

        service = new DailyScheduleService(
            db.RecurringPlanningModelMemberAssignment,
            db.DailyAdjustmentSlot,
            db.Membership,
            mockCacheService
        );
    });

    afterAll(async () => {
        if (sequelize) { await sequelize.close(); }
    });

    afterEach(async () => {
        // Nettoyage après chaque test pour garantir l'isolation
        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: { id: { [db.Sequelize.Op.ne]: testUserAdmin.id } } });
        await db.RecurringPlanningModel.destroy({ where: {} });
    });

    it('should calculate a complex schedule with an RPM, a break, and a DAS override', async () => {
        // --- ARRANGE (SETUP) ---
        // 1. Créer un RPM "Journée Type" avec une pause
        const rpmJourneeType = await db.RecurringPlanningModel.create({
            name: 'Journée Type 9-17',
            establishmentId: testEstablishment.id,
            referenceDate: '2024-01-01',
            globalStartTime: '09:00:00',
            globalEndTime: '17:00:00',
            rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
            defaultBlockType: DefaultBlockType.WORK,
            breaks: [{ id: 'uuid-lunch', startTime: '12:00:00', endTime: '13:00:00', breakType: BreakType.MEAL, description: 'Pause Déjeuner' }]
        });

        // 2. Créer un membre
        const hashedPassword = await bcrypt.hash('password123', 10);
        const user = await db.User.create({ username: 'testmember', email: 'member.calc@test.com', password: hashedPassword, email_masked: 'masked-member-calc@test.com' });
        const member = await db.Membership.create({ userId: user.id, establishmentId: testEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE });

        // 3. Lier le membre au RPM
        await db.RecurringPlanningModelMemberAssignment.create({
            membershipId: member.id,
            recurringPlanningModelId: rpmJourneeType.id,
            assignmentStartDate: '2024-01-01',
            assignmentEndDate: null,
        });

        // 4. Créer un DAS "Formation" qui surcharge une partie du planning
        const targetDate = '2024-11-21'; // Un jeudi, couvert par la RRULE
        await db.DailyAdjustmentSlot.create({
            membershipId: member.id,
            establishmentId: testEstablishment.id,
            slotDate: targetDate,
            startTime: '14:00:00',
            endTime: '15:00:00',
            slotType: SlotType.TRAINING_EXTERNAL,
            description: 'Formation Spéciale',
            isManualOverride: true,
        });

        // --- ACT ---
        const schedule = await service.getDailyScheduleForMember(member.id, targetDate);

        // --- ASSERT ---
        // 5. Vérifier que le résultat final est correct et bien ordonné
        expect(schedule).toHaveLength(5);

        // Ordre et types des blocs
        const blockTypes = schedule.map(s => s.type);
        expect(blockTypes).toEqual([
            DefaultBlockType.WORK,      // 09:00 - 12:00
            BreakType.MEAL,             // 12:00 - 13:00
            DefaultBlockType.WORK,      // 13:00 - 14:00
            SlotType.TRAINING_EXTERNAL,          // 14:00 - 15:00 (le DAS)
            DefaultBlockType.WORK       // 15:00 - 17:00
        ]);

        // Horaires précis
        expect(schedule[0]).toEqual(expect.objectContaining({ startTime: '09:00:00', endTime: '12:00:00' }));
        expect(schedule[1]).toEqual(expect.objectContaining({ startTime: '12:00:00', endTime: '13:00:00' }));
        expect(schedule[2]).toEqual(expect.objectContaining({ startTime: '13:00:00', endTime: '14:00:00' }));
        expect(schedule[3]).toEqual(expect.objectContaining({ startTime: '14:00:00', endTime: '15:00:00', source: 'DAS' }));
        expect(schedule[4]).toEqual(expect.objectContaining({ startTime: '15:00:00', endTime: '17:00:00' }));
    });

    it('should return a map of schedules for all members assigned to an RPM', async () => {
        // --- ARRANGE ---
        // 1. Créer le RPM, 3 membres, 3 affectations, et 1 DAS pour le membre B
        const rpm = await db.RecurringPlanningModel.create({
            name: 'RPM for Bulk Test', establishmentId: testEstablishment.id,
            referenceDate: '2024-01-01', globalStartTime: '08:00:00',
            globalEndTime: '16:00:00', rruleString: 'FREQ=DAILY',
            defaultBlockType: DefaultBlockType.WORK, breaks: []
        });

        const hashedPassword = await bcrypt.hash('password123', 10);
        const userA = await db.User.create({ username: 'testMemberA', email: 'memberA@test.com', password: hashedPassword, email_masked: 'masked-memberA@test.com' });
        const memberA = await db.Membership.create({ userId: userA.id, establishmentId: testEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE });
        const userB = await db.User.create({ username: 'testMemberB', email: 'memberB@test.com', password: hashedPassword, email_masked: 'masked-memberB@test.com' });
        const memberB = await db.Membership.create({ userId: userB.id, establishmentId: testEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE });
        const userC = await db.User.create({ username: 'testMemberC', email: 'memberC@test.com', password: hashedPassword, email_masked: 'masked-memberC@test.com' });
        const memberC = await db.Membership.create({ userId: userC.id, establishmentId: testEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE });

        await db.RecurringPlanningModelMemberAssignment.bulkCreate([
            { membershipId: memberA.id, recurringPlanningModelId: rpm.id, assignmentStartDate: '2024-01-01' },
            { membershipId: memberB.id, recurringPlanningModelId: rpm.id, assignmentStartDate: '2024-01-01' },
            { membershipId: memberC.id, recurringPlanningModelId: rpm.id, assignmentStartDate: '2024-01-01' },
        ]);

        const targetDate = '2024-11-21';
        await db.DailyAdjustmentSlot.create({
            membershipId: memberB.id, establishmentId: testEstablishment.id, slotDate: targetDate,
            startTime: '10:00:00', endTime: '11:00:00',
            slotType: SlotType.TRAINING_EXTERNAL, isManualOverride: true,
        });

        // Espionner les appels DB pour vérifier l'optimisation N+1
        const assignmentSpy = jest.spyOn(db.RecurringPlanningModelMemberAssignment, 'findAll');
        const dasSpy = jest.spyOn(db.DailyAdjustmentSlot, 'findAll');

        // --- ACT ---
        const scheduleMap = await service.getScheduleForRpm(rpm.id, targetDate, testEstablishment.id);

        // --- ASSERT ---
        expect(assignmentSpy).toHaveBeenCalledTimes(1);
        expect(dasSpy).toHaveBeenCalledTimes(1);

        expect(scheduleMap).toBeInstanceOf(Map);
        expect(scheduleMap.size).toBe(3);
        expect(scheduleMap.has(memberA.id)).toBe(true);
        expect(scheduleMap.has(memberB.id)).toBe(true);
        expect(scheduleMap.has(memberC.id)).toBe(true);

        const scheduleA = scheduleMap.get(memberA.id);
        const scheduleB = scheduleMap.get(memberB.id);
        const scheduleC = scheduleMap.get(memberC.id);

        expect(scheduleA).toHaveLength(1); // Juste le travail
        expect(scheduleC).toEqual(scheduleA); // A et C doivent avoir le même planning
        expect(scheduleB).toHaveLength(3); // Le planning de B est découpé par le DAS
        expect(scheduleB?.some(slot => slot.type === SlotType.TRAINING_EXTERNAL)).toBe(true);

        assignmentSpy.mockRestore();
        dasSpy.mockRestore();
    });

});