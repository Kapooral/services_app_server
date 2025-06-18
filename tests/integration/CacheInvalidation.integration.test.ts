// tests/integration/CacheInvalidation.integration.test.ts

import { execSync } from 'child_process';
import { Sequelize } from 'sequelize';
import bcrypt from 'bcrypt';
import db from '../../src/models';

import { MemoryCacheService } from '../../src/services/cache/memory-cache.service';
import { DailyScheduleService } from '../../src/services/daily-schedule.service';
import { RecurringPlanningModelService } from '../../src/services/recurring-planning-model.service';
import { UpdateRecurringPlanningModelDto, ListRecurringPlanningModelsQueryDto } from '../../src/dtos/planning/recurring-planning-model.validation';

import { MembershipRole, MembershipStatus } from '../../src/models/Membership';
import { DefaultBlockType } from '../../src/types/planning.enums';
import RecurringPlanningModel from '../../src/models/RecurringPlanningModel';

// --- Configuration et Déclaration ---
let sequelize: Sequelize;
let dailyScheduleService: DailyScheduleService;
let recurringPlanningModelService: RecurringPlanningModelService;
let cacheService: MemoryCacheService;

let testUserAdmin: any;
let testEstablishment: any;

describe('Cache Invalidation - Integration Test', () => {

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') { throw new Error('Tests d\'intégration à lancer en environnement de test.'); }
        sequelize = db.sequelize;

        execSync('npm run migrate:undo:all:test', { stdio: 'ignore' });
        execSync('npm run migrate:test', { stdio: 'ignore' });
    });

    beforeEach(async () => {
        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.RecurringPlanningModel.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        // Création des données de base
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUserAdmin = await db.User.create({
            username: 'cache_admin_integ', email: 'cache_admin_integ@test.com',
            password: hashedPassword, email_masked: 'cache_admin'
        });
        testEstablishment = await db.Establishment.create({
            name: "Cache Test Facility", siret: "33344455566677",
            siren: "333444555", owner_id: testUserAdmin.id,
            is_validated: true, address_line1: 'a3', city: 'c3',
            postal_code: 'p3', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
        });

        // Instanciation des services avec une instance de cache fraîche
        cacheService = new MemoryCacheService();
        dailyScheduleService = new DailyScheduleService(db.RecurringPlanningModelMemberAssignment, db.DailyAdjustmentSlot, db.Membership, cacheService);
        recurringPlanningModelService = new RecurringPlanningModelService(db.RecurringPlanningModel, db.RecurringPlanningModelMemberAssignment, sequelize, cacheService);
    });

    afterAll(async () => {
        if (sequelize) { await sequelize.close(); }
    });

    it('should correctly invalidate a daily schedule cache when its source RPM is updated', async () => {
        // --- ARRANGE ---
        const rpm = await RecurringPlanningModel.create({
            name: 'Cache Test RPM', establishmentId: testEstablishment.id,
            referenceDate: '2024-01-01', globalStartTime: '09:00:00',
            globalEndTime: '17:00:00', rruleString: 'FREQ=DAILY',
            defaultBlockType: DefaultBlockType.WORK, breaks: [],
        });
        const staffUser = await db.User.create({ username: 'cache_staff', email: 'cache_staff@test.com', password: 'password', email_masked: 'cache_staff' });
        const member = await db.Membership.create({
            userId: staffUser.id, establishmentId: testEstablishment.id,
            role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE
        });
        await db.RecurringPlanningModelMemberAssignment.create({
            membershipId: member.id, recurringPlanningModelId: rpm.id,
            assignmentStartDate: '2024-01-01', assignmentEndDate: null,
        });
        const targetDate = '2024-11-21';
        const cacheKey = `schedule:estId${testEstablishment.id}:membId${member.id}:date${targetDate}`;

        // --- ACTIONS & ASSERTIONS ---
        await dailyScheduleService.getDailyScheduleForMember(member.id, targetDate);
        const cachedScheduleBefore = await cacheService.get(cacheKey);
        expect(cachedScheduleBefore).not.toBeNull();

        await recurringPlanningModelService.updateRpm(
            rpm.id,
            { name: 'Updated Cache Test RPM' } as UpdateRecurringPlanningModelDto,
            testEstablishment.id
        );

        const cachedScheduleAfter = await cacheService.get(cacheKey);
        expect(cachedScheduleAfter).toBeUndefined();
    }, 20000);

    it('should correctly invalidate the RPM list cache when a new RPM is created', async () => {
        // ARRANGE: Créer un RPM initial pour que la liste ne soit pas vide
        await RecurringPlanningModel.create({
            name: 'Initial RPM', establishmentId: testEstablishment.id,
            referenceDate: '2024-01-01', globalStartTime: '09:00:00',
            globalEndTime: '17:00:00', rruleString: 'FREQ=DAILY',
            defaultBlockType: DefaultBlockType.WORK
        });

        const listQueryParams: ListRecurringPlanningModelsQueryDto = {
            page: 1,
            limit: 10,
            sortBy: 'name',
            sortOrder: 'asc'
        };
        const listCacheKey = `rpms:estId${testEstablishment.id}:p1:l10:sbname:soasc:sN`;

        // ACT 1: Populer le cache de la liste
        await recurringPlanningModelService.listRpmsForEstablishment(listQueryParams, testEstablishment.id);
        const listCacheBefore = await cacheService.get(listCacheKey);
        expect(listCacheBefore).toBeDefined();
        expect((listCacheBefore as any).data).toHaveLength(1);

        // ACT 2: Déclencher l'invalidation en créant un nouveau RPM
        await recurringPlanningModelService.createRpm({
            name: 'Newly Created RPM', referenceDate: '2024-01-01',
            globalStartTime: '08:00:00', globalEndTime: '12:00:00',
            rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU', defaultBlockType: DefaultBlockType.WORK,
        }, testEstablishment.id);

        // ASSERT: Vérifier que le cache de la liste a été vidé
        const listCacheAfter = await cacheService.get(listCacheKey);
        expect(listCacheAfter).toBeUndefined();
    });

    it('should correctly invalidate the RPM list cache when an RPM is deleted', async () => {
        // ARRANGE: Créer deux RPMs
        const rpmToDelete = await RecurringPlanningModel.create({
            name: 'RPM to Delete', establishmentId: testEstablishment.id,
            referenceDate: '2024-01-01', globalStartTime: '09:00:00',
            globalEndTime: '17:00:00', rruleString: 'FREQ=DAILY',
            defaultBlockType: DefaultBlockType.WORK
        });
        await RecurringPlanningModel.create({
            name: 'Another RPM', establishmentId: testEstablishment.id,
            referenceDate: '2024-01-01', globalStartTime: '09:00:00',
            globalEndTime: '17:00:00', rruleString: 'FREQ=DAILY',
            defaultBlockType: DefaultBlockType.WORK
        });

        const listQueryParams: ListRecurringPlanningModelsQueryDto = {
            page: 1,
            limit: 10,
            sortBy: 'name',
            sortOrder: 'asc'
        };
        const listCacheKey = `rpms:estId${testEstablishment.id}:p1:l10:sbname:soasc:sN`;

        // ACT 1: Populer le cache de la liste
        await recurringPlanningModelService.listRpmsForEstablishment(listQueryParams, testEstablishment.id);
        const listCacheBefore = await cacheService.get(listCacheKey);
        expect(listCacheBefore).toBeDefined();
        expect((listCacheBefore as any).data).toHaveLength(2);

        // ACT 2: Déclencher l'invalidation en supprimant un RPM
        await recurringPlanningModelService.deleteRpm(rpmToDelete.id, testEstablishment.id);

        // ASSERT: Vérifier que le cache de la liste a été vidé
        const listCacheAfter = await cacheService.get(listCacheKey);
        expect(listCacheAfter).toBeUndefined();
    });
});