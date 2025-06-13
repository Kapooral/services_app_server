// tests/e2e/PlanningSecurity.e2e.test.ts

import request from 'supertest';
import { execSync } from 'child_process';
import { Sequelize } from 'sequelize';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { app } from '../../src/server';
import db from '../../src/models';
import { MembershipRole, MembershipStatus } from '../../src/models';
import { DefaultBlockType, BreakType, SlotType } from '../../src/types/planning.enums';
import { AccessTokenPayload } from '../../src/dtos/auth.validation';

// --- Déclaration des variables de contexte ---
// Elles seront assignées dans beforeEach pour être accessibles dans chaque 'it'
let sequelize: Sequelize;
let adminToken: string;
let staffToken: string;
let testEstablishment: any;
let adminMembership: any;
let staffMembership: any;
let rpmToTestOn: any;
let dasToTestOn: any;
let apiPrefix: string;

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';

describe('E2E - Planning Module Security', () => {

    beforeAll(async () => {
        // beforeAll prépare uniquement la structure de la BDD
        if (process.env.NODE_ENV !== 'test') { throw new Error('E2E tests must run in test environment.'); }
        sequelize = db.sequelize;
        execSync('npm run migrate:undo:all:test', { stdio: 'ignore' });
        execSync('npm run migrate:test', { stdio: 'ignore' });
    });

    beforeEach(async () => {
        // beforeEach nettoie la BDD et crée les données fraîches pour chaque test

        // 1. Nettoyage complet dans le bon ordre
        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.RecurringPlanningModelMemberAssignment.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.RecurringPlanningModel.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        // 2. Création des données de base pour CE test
        const adminPassword = await bcrypt.hash('password123', 10);
        const adminUser = await db.User.create({ username: 'security_admin', email: 'security_admin@test.com', password: adminPassword, email_masked: 'sec_admin' });

        const staffPassword = await bcrypt.hash('password123', 10);
        const staffUser = await db.User.create({ username: 'security_staff', email: 'security_staff@test.com', password: staffPassword, email_masked: 'sec_staff' });

        testEstablishment = await db.Establishment.create({
            name: "Security Test Corp", siret: "88877766655544", siren: "888777666", owner_id: adminUser.id,
            is_validated: true, address_line1: 'a4', city: 'c4',
            postal_code: 'p4', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
        });
        apiPrefix = `/api/users/me/establishments/${testEstablishment.id}/planning`;

        adminMembership = await db.Membership.create({ userId: adminUser.id, establishmentId: testEstablishment.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE });
        staffMembership = await db.Membership.create({ userId: staffUser.id, establishmentId: testEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE });

        const adminPayload: AccessTokenPayload = { userId: adminUser.id, type: 'access', username: adminUser.username };
        adminToken = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '1h' });

        const staffPayload: AccessTokenPayload = { userId: staffUser.id, type: 'access', username: staffUser.username };
        staffToken = jwt.sign(staffPayload, JWT_SECRET, { expiresIn: '1h' });

        // Création des ressources de test nécessaires pour les tests de permissions
        rpmToTestOn = await db.RecurringPlanningModel.create({
            name: 'Security Test RPM', establishmentId: testEstablishment.id, referenceDate: '2024-01-01',
            globalStartTime: '09:00:00', globalEndTime: '17:00:00', rruleString: 'FREQ=DAILY',
            defaultBlockType: DefaultBlockType.WORK
        });

        dasToTestOn = await db.DailyAdjustmentSlot.create({
            membershipId: staffMembership.id, establishmentId: testEstablishment.id,
            slotDate: '2025-01-01', startTime: '10:00:00', endTime: '11:00:00',
            slotType: SlotType.TRAINING_EXTERNAL, isManualOverride: true,
        });

    }, 30000); // Timeout long pour la configuration de chaque test

    afterAll(async () => {
        if (sequelize) { await sequelize.close(); }
    });

    describe('Role-Based Access Control', () => {

        describe('as a STAFF user (insufficient privileges)', () => {

            it('should return 403 Forbidden when trying to create a RecurringPlanningModel', async () => {
                const response = await request(app).post(`${apiPrefix}/recurring-planning-models`).set('Authorization', `Bearer ${staffToken}`).send({
                    name: 'Staff RPM Attempt', referenceDate: '2024-01-01', globalStartTime: '09:00:00',
                    globalEndTime: '17:00:00', rruleString: 'FREQ=DAILY', defaultBlockType: DefaultBlockType.WORK
                });
                expect(response.status).toBe(403);
            });

            it('should return 403 Forbidden when trying to update a RecurringPlanningModel', async () => {
                const response = await request(app).put(`${apiPrefix}/recurring-planning-models/${rpmToTestOn.id}`).set('Authorization', `Bearer ${staffToken}`).send({ description: 'Updated by staff' });
                expect(response.status).toBe(403);
            });

            it('should return 403 Forbidden when trying to delete a DailyAdjustmentSlot', async () => {
                const response = await request(app).delete(`${apiPrefix}/daily-adjustment-slots/${dasToTestOn.id}`).set('Authorization', `Bearer ${staffToken}`);
                expect(response.status).toBe(403);
            });
        });

        describe('as a STAFF user (allowed & horizontal access)', () => {

            it('should return 200 OK when getting their OWN daily schedule', async () => {
                const response = await request(app).get(`${apiPrefix}/memberships/${staffMembership.id}/daily-schedule?date=2025-01-01`).set('Authorization', `Bearer ${staffToken}`);
                expect(response.status).toBe(200);
            });

            it('should return 403 Forbidden when trying to get ANOTHER member\'s daily schedule', async () => {
                const response = await request(app).get(`${apiPrefix}/memberships/${adminMembership.id}/daily-schedule?date=2025-01-01`).set('Authorization', `Bearer ${staffToken}`);
                expect(response.status).toBe(403);
            });
        });
    });
});