// tests/e2e/PlanningModule.e2e.test.ts

import request from 'supertest';
import { execSync } from 'child_process';
import { Sequelize } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { app } from '../../src/server';
import db from '../../src/models';
// --- CORRECTION DÉFINITIVE : La bonne approche de Mocking E2E ---
import { MemoryCacheService } from '../../src/services/cache/memory-cache.service'; // Importer la VRAIE classe
import { MembershipRole, MembershipStatus } from '../../src/models';
import { DefaultBlockType, BreakType, SlotType } from '../../src/types/planning.enums';
import { AccessTokenPayload } from '../../src/dtos/auth.validation';

// 1. On dit à Jest de remplacer automatiquement le module par un mock.
// Jest remplacera la classe `MemoryCacheService` par un constructeur mocké.
jest.mock('../../src/services/cache/memory-cache.service');

// 2. On type notre classe mockée pour avoir accès aux méthodes de mock de Jest.
const MockedCacheService = MemoryCacheService as jest.MockedClass<typeof MemoryCacheService>;

// --- Déclaration des variables de contexte ---
let sequelize: Sequelize;
let adminToken: string;
let testEstablishment: any;

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';

describe('E2E - Planning Module', () => {

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') { throw new Error('E2E tests must run in test environment.'); }
        sequelize = db.sequelize;
        execSync('npm run migrate:undo:all:test', { stdio: 'ignore' });
        execSync('npm run migrate:test', { stdio: 'ignore' });
    });

    beforeEach(async () => {
        // 3. On nettoie les instances du mock et l'état de la BDD avant chaque test.
        MockedCacheService.mockClear();

        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.RecurringPlanningModel.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        // Création du contexte de base...
        const hashedPassword = await bcrypt.hash('password123', 10);
        const adminUser = await db.User.create({
            username: 'e2e_admin', email: 'e2e_admin@test.com',
            password: hashedPassword, email_masked: 'masked-admin@test.com',
        });
        testEstablishment = await db.Establishment.create({
            name: "E2E Test Establishment", siret: "33344455566677",
            siren: "333444555", owner_id: adminUser.id,
            is_validated: true, address_line1: 'a3', city: 'c3',
            postal_code: 'p3', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
        });
        await db.Membership.create({
            userId: adminUser.id, establishmentId: testEstablishment.id,
            role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE,
        });
        const payload: AccessTokenPayload = { userId: adminUser.id, type: 'access', username: adminUser.username };
        adminToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    });

    afterAll(async () => {
        if (sequelize) { await sequelize.close(); }
    });

    it('should allow an admin to manage the full lifecycle of a schedule', async () => {
        // 4. On configure le comportement de l'instance qui SERA créée par l'application.
        // On suppose que l'app ne crée qu'une seule instance (singleton).
        // On configure la méthode `get` de CETTE instance future.
        MockedCacheService.prototype.get = jest.fn().mockResolvedValue(null);

        const staffHashedPassword = await bcrypt.hash('password123', 10);
        const staffUser = await db.User.create({
            username: 'e2e_staff', email: 'e2e_staff@test.com',
            password: staffHashedPassword, email_masked: 'masked-staff@test.com',
        });
        const testMember = await db.Membership.create({
            userId: staffUser.id, establishmentId: testEstablishment.id,
            role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE,
        });

        const targetDate = '2024-11-21';
        const establishmentId = testEstablishment.id;
        const apiPrefix = `/api/users/me/establishments/${establishmentId}/planning`;

        // Le reste du test est identique, mais il fonctionne maintenant car le cache est VRAIMENT contrôlé.
        const rpmResponse = await request(app).post(`${apiPrefix}/recurring-planning-models`).set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'E2E Base Day', referenceDate: '2024-01-01',
                globalStartTime: '09:00:00', globalEndTime: '17:00:00',
                rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
                defaultBlockType: DefaultBlockType.WORK,
                breaks: [{ id: uuidv4(), startTime: '12:00:00', endTime: '13:00:00', breakType: BreakType.MEAL }]
            }).expect(201);
        const rpmId = rpmResponse.body.id;

        await request(app).post(`${apiPrefix}/recurring-planning-models/${rpmId}/member-assignments`).set('Authorization', `Bearer ${adminToken}`)
            .send({ membershipId: testMember.id, assignmentStartDate: '2024-01-01', assignmentEndDate: null }).expect(201);

        const baseScheduleResponse = await request(app).get(`${apiPrefix}/memberships/${testMember.id}/daily-schedule?date=${targetDate}`)
            .set('Authorization', `Bearer ${adminToken}`).expect(200);
        expect(baseScheduleResponse.body).toHaveLength(3);
        const baseSchedule = baseScheduleResponse.body;

        const dasResponse = await request(app).post(`${apiPrefix}/daily-adjustment-slots`).set('Authorization', `Bearer ${adminToken}`)
            .send({
                membershipId: testMember.id, establishmentId, slotDate: targetDate,
                startTime: '14:00:00', endTime: '15:00:00',
                slotType: SlotType.TRAINING_EXTERNAL, isManualOverride: true,
            }).expect(201);
        const dasId = dasResponse.body.id;

        const overriddenScheduleResponse = await request(app).get(`${apiPrefix}/memberships/${testMember.id}/daily-schedule?date=${targetDate}`)
            .set('Authorization', `Bearer ${adminToken}`).expect(200);
        expect(overriddenScheduleResponse.body).toHaveLength(5);
        expect(overriddenScheduleResponse.body[3].type).toBe(SlotType.TRAINING_EXTERNAL);

        await request(app).delete(`${apiPrefix}/daily-adjustment-slots/${dasId}`).set('Authorization', `Bearer ${adminToken}`).expect(204);

        const finalScheduleResponse = await request(app).get(`${apiPrefix}/memberships/${testMember.id}/daily-schedule?date=${targetDate}`)
            .set('Authorization', `Bearer ${adminToken}`).expect(200);
        expect(finalScheduleResponse.body).toEqual(baseSchedule);
    }, 30000);
});