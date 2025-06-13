// tests/e2e/PlanningRobustness.e2e.test.ts

import request from 'supertest';
import { execSync } from 'child_process';
import { Sequelize } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import { app } from '../../src/server';
import db from '../../src/models';
import { MembershipRole, MembershipStatus } from '../../src/models';
import { DefaultBlockType, SlotType } from '../../src/types/planning.enums';
import { AccessTokenPayload } from '../../src/dtos/auth.validation';

// --- Configuration et Déclaration ---
let sequelize: Sequelize;
let adminToken: string;
let testEstablishment: any;
let testMember: any;
let apiPrefix: string;

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';

describe('E2E - API Robustness and Input Validation', () => {

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') { throw new Error('E2E tests must run in test environment.'); }
        sequelize = db.sequelize;
        execSync('npm run migrate:undo:all:test', { stdio: 'ignore' });
        execSync('npm run migrate:test', { stdio: 'ignore' });
    });

    beforeEach(async () => {
        // Nettoyage complet de la base de données avant chaque test
        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.RecurringPlanningModel.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        // Création des données de base nécessaires pour les tests
        const adminPassword = await bcrypt.hash('password123', 10);
        const adminUser = await db.User.create({ username: 'robust_admin', email: 'robust_admin@test.com', password: adminPassword, email_masked: 'rob_admin' });

        testEstablishment = await db.Establishment.create({
            name: "Robustness Test Facility", siret: "11122233344455", siren: "111222333", owner_id: adminUser.id,
            is_validated: true, address_line1: 'a5', city: 'c5',
            postal_code: 'p5', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
        });
        apiPrefix = `/api/users/me/establishments/${testEstablishment.id}/planning`;

        const adminMembership = await db.Membership.create({ userId: adminUser.id, establishmentId: testEstablishment.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE });

        const adminPayload: AccessTokenPayload = { userId: adminUser.id, type: 'access', username: adminUser.username };
        adminToken = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '1h' });

        // Créer un membre cible pour les tests de création de DAS
        const staffPassword = await bcrypt.hash('password123', 10);
        const staffUser = await db.User.create({ username: 'robust_staff', email: 'robust_staff@test.com', password: staffPassword, email_masked: 'rob_staff' });
        testMember = await db.Membership.create({ userId: staffUser.id, establishmentId: testEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE });

    }, 20000);

    afterAll(async () => {
        if (sequelize) { await sequelize.close(); }
    });

    it('should return 400 Bad Request with a structured error for invalid data in POST /daily-adjustment-slots', async () => {
        // Action: Tenter de créer un DAS avec une startTime postérieure à la endTime
        const response = await request(app)
            .post(`${apiPrefix}/daily-adjustment-slots`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                membershipId: testMember.id,
                establishmentId: testEstablishment.id,
                slotDate: '2024-12-01',
                startTime: '11:00:00', // INVALIDE
                endTime: '10:00:00',   // INVALIDE
                slotType: SlotType.EFFECTIVE_WORK,
                isManualOverride: true,
            });

        // Assertion
        expect(response.status).toBe(400);
        expect(response.body).toEqual(expect.objectContaining({
            name: 'ZodValidationError',
            details: expect.arrayContaining([
                expect.objectContaining({
                    message: 'Slot endTime must be after startTime.',
                })
            ])
        }));
    });

    it('should return 400 Bad Request for an invalid RRULE string in POST /recurring-planning-models', async () => {
        // Action: Tenter de créer un RPM avec une rruleString invalide
        const response = await request(app)
            .post(`${apiPrefix}/recurring-planning-models`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'Invalid RRule RPM',
                referenceDate: '2024-01-01',
                globalStartTime: '09:00:00',
                globalEndTime: '17:00:00',
                rruleString: 'THIS_IS_NOT_VALID', // INVALIDE
                defaultBlockType: DefaultBlockType.WORK,
            });

        // Assertion
        expect(response.status).toBe(400);
        expect(response.body).toEqual(expect.objectContaining({
            name: 'ZodValidationError',
            details: expect.arrayContaining([
                expect.objectContaining({
                    message: 'RRule string must contain a FREQ component.',
                })
            ])
        }));
    });
});