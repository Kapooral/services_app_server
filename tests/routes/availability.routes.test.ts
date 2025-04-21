// tests/routes/availability.routes.test.ts
import supertest from 'supertest';
import { app, server } from '../../src/server';
import db from '../../src/models';
import { UserAttributes } from '../../src/models/User';
import Role, { ROLES } from '../../src/models/Role';
import Establishment from '../../src/models/Establishment';
import Service from '../../src/models/Service';
import AvailabilityRule from '../../src/models/AvailabilityRule';
import AvailabilityOverride from '../../src/models/AvailabilityOverride';
import { CreateAvailabilityRuleDto, CreateAvailabilityOverrideDto, UpdateAvailabilityOverrideDto, UpdateAvailabilityRuleDto } from '../../src/dtos/availability.validation';
import { generateTestUser, loginTestUser } from '../helpers/auth.helpers'; // AuthResult retiré
import { BookingStatus, PaymentStatus } from '../../src/models/Booking';

// --- Variables globales ---
let clientUser: UserAttributes;
let ownerUser: UserAttributes;
let otherOwnerUser: UserAttributes;
let clientAgent: any; // Type inféré/any
let ownerAgent: any;  // Type inféré/any
let otherOwnerAgent: any; // Type inféré/any
let clientAccessToken: string;
let ownerAccessToken: string;
let otherOwnerAccessToken: string;
let ownedEstablishment: Establishment;
let otherEstablishment: Establishment;
let existingRuleId: number;
let otherOwnerRuleId: number;
let existingOverrideId: number;
let otherOwnerOverrideId: number;
let serviceId_60min: number;
let serviceId_90min: number;
let serviceId_30min: number;

const ESTABLISHMENT_ADMIN_ROLE_NAME = ROLES.ESTABLISHMENT_ADMIN;
const CLIENT_ROLE_NAME = ROLES.CLIENT;

const todayStr = new Date().toISOString().split('T')[0];
const targetDateStr = '2024-07-15';
let targetDayOfWeek: number;

// --- Helpers ---
const expectSlots = (baseDateStr: string, timeSlots: string[]): string[] => timeSlots.map(time => `${baseDateStr}T${time}.000Z`);
const createRule = async (estabId: number, day: number, start: string, end: string) => await db.AvailabilityRule.create({ establishment_id: estabId, day_of_week: day, start_time: start, end_time: end });
const createOverride = async (estabId: number, startISO: string, endISO: string, available: boolean) => await db.AvailabilityOverride.create({ establishment_id: estabId, start_datetime: new Date(startISO), end_datetime: new Date(endISO), is_available: available });
const createBooking = async (svcId: number, userId: number, estabId: number, startISO: string, endISO: string, status: BookingStatus = BookingStatus.CONFIRMED) => await db.Booking.create({ user_id: userId, establishment_id: estabId, service_id: svcId, start_datetime: new Date(startISO), end_datetime: new Date(endISO), status: status, price_at_booking: 50, currency_at_booking: 'EUR', payment_status: PaymentStatus.NOT_PAID });
const getFutureDateISO = (daysToAdd: number, time: string = '10:00:00'): string => { const d = new Date(); d.setUTCDate(d.getUTCDate() + daysToAdd); d.setUTCHours(parseInt(time.split(':')[0]), parseInt(time.split(':')[1]), parseInt(time.split(':')[2]), 0); return d.toISOString(); };
const getPastDateISO = (daysToSubtract: number, time: string = '10:00:00'): string => { const d = new Date(); d.setUTCDate(d.getUTCDate() - daysToSubtract); d.setUTCHours(parseInt(time.split(':')[0]), parseInt(time.split(':')[1]), parseInt(time.split(':')[2]), 0); return d.toISOString(); };
// --- Fin Helpers ---

describe('Availability Routes Integration Tests (CRUD & Calculation)', () => {

    beforeAll(async () => {
        try {
            await db.sequelize.authenticate();
            await db.Role.findOrCreate({ where: { name: CLIENT_ROLE_NAME }, defaults: { name: CLIENT_ROLE_NAME } });
            await db.Role.findOrCreate({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME }, defaults: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
        } catch (error) { console.error('!!! AVAILABILITY TEST DB SETUP FAILED !!!', error); throw error; }
    });

    beforeEach(async () => {
        targetDayOfWeek = new Date(targetDateStr + 'T00:00:00Z').getUTCDay();
        await db.Booking.destroy({ where: {}, force: true });
        await db.AvailabilityOverride.destroy({ where: {} });
        await db.AvailabilityRule.destroy({ where: {} });
        await db.Service.destroy({ where: {} });
        await db.UserRole.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.RefreshToken.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        clientUser = await generateTestUser({ username: 'client_avail', email: 'client_avail@test.com', password: 'p' });
        ownerUser = await generateTestUser({ username: 'owner_avail', email: 'owner_avail@test.com', password: 'p' });
        otherOwnerUser = await generateTestUser({ username: 'other_owner_avail', email: 'other_avail@test.com', password: 'p' });

        const clientRole = await db.Role.findOne({ where: { name: CLIENT_ROLE_NAME } });
        const adminRole = await db.Role.findOne({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
        if (!clientRole || !adminRole) throw new Error("Roles not found during beforeEach setup.");
        const clientUserInstance = await db.User.findByPk(clientUser.id);
        const ownerUserInstance = await db.User.findByPk(ownerUser.id);
        const otherOwnerUserInstance = await db.User.findByPk(otherOwnerUser.id);
        if (!clientUserInstance || !ownerUserInstance || !otherOwnerUserInstance) throw new Error("User instances not found");
        await clientUserInstance.addRole(clientRole);
        await ownerUserInstance.addRole(clientRole); await ownerUserInstance.addRole(adminRole);
        await otherOwnerUserInstance.addRole(clientRole); await otherOwnerUserInstance.addRole(adminRole);

        ownedEstablishment = await db.Establishment.create({ name: "Avail Studio", siret: "11100011110011", siren: "111000111", owner_id: ownerUser.id, is_validated: true, address_line1: 'a', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
        otherEstablishment = await db.Establishment.create({ name: "Other Avail Studio", siret: "22200022220022", siren: "222000222", owner_id: otherOwnerUser.id, is_validated: true, address_line1: 'b', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });

        clientAgent = supertest.agent(app);
        ownerAgent = supertest.agent(app);
        otherOwnerAgent = supertest.agent(app);

        let authResult: any;
        authResult = await loginTestUser(clientAgent, { email: clientUser.email, password: 'p' }); clientAccessToken = authResult.accessToken;
        authResult = await loginTestUser(ownerAgent, { email: ownerUser.email, password: 'p' }); ownerAccessToken = authResult.accessToken;
        authResult = await loginTestUser(otherOwnerAgent, { email: otherOwnerUser.email, password: 'p' }); otherOwnerAccessToken = authResult.accessToken;

        const svc60 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Service 60min", duration_minutes: 60, price: 50, currency: "EUR", is_active: true });
        const svc90 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Service 90min", duration_minutes: 90, price: 75, currency: "EUR", is_active: true });
        const svc30 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Service 30min", duration_minutes: 30, price: 25, currency: "EUR", is_active: true });
        serviceId_60min = svc60.id; serviceId_90min = svc90.id; serviceId_30min = svc30.id;
    });

    afterAll(async () => {
        await db.sequelize.close();
        if (server && server.close) server.close();
    });

    // --- CRUD Tests ---
    describe('Availability Admin Routes (CRUD)', () => {

        describe('POST /api/users/me/establishments/:establishmentId/availability/rules', () => {
            const validRuleData: CreateAvailabilityRuleDto = { day_of_week: 1, start_time: '09:00:00', end_time: '17:30:00' };
            let route: string;
            beforeEach(() => { route = `/api/users/me/establishments/${ownedEstablishment.id}/availability/rules`; });

            it('should create a new rule for the owned establishment (201)', async () => {
                const response = await ownerAgent.post(route).set('Authorization', `Bearer ${ownerAccessToken}`).send(validRuleData);
                expect(response.status).toBe(201);
                expect(response.body.establishment_id).toBe(ownedEstablishment.id);
            });
            it('should return 401 if user is not authenticated', async () => {
                const response = await supertest(app).post(route).send(validRuleData);
                expect(response.status).toBe(401);
            });
            it('should return 403 if user is not admin', async () => {
                const response = await clientAgent.post(route).set('Authorization', `Bearer ${clientAccessToken}`).send(validRuleData);
                expect(response.status).toBe(403);
            });
            it('should return 404 if user tries to create rule for establishment they dont own', async () => { // CORRECTION: 404
                const otherRoute = `/api/users/me/establishments/${otherEstablishment.id}/availability/rules`;
                const response = await ownerAgent.post(otherRoute).set('Authorization', `Bearer ${ownerAccessToken}`).send(validRuleData);
                expect(response.status).toBe(404);
            });
            it('should return 400 if request body is invalid', async () => {
                const invalidData = { ...validRuleData, start_time: '9:00' };
                const response = await ownerAgent.post(route).set('Authorization', `Bearer ${ownerAccessToken}`).send(invalidData);
                expect(response.status).toBe(400);
            });
            it('should return 409 if a rule for that day already exists', async () => {
                await createRule(ownedEstablishment.id, 1, '08:00:00', '16:00:00');
                const response = await ownerAgent.post(route).set('Authorization', `Bearer ${ownerAccessToken}`).send(validRuleData);
                expect(response.status).toBe(409);
            });
        });

        describe('GET /api/users/me/establishments/:establishmentId/availability/rules', () => {
            let route: string;
            beforeEach(async () => {
                route = `/api/users/me/establishments/${ownedEstablishment.id}/availability/rules`;
                await createRule(ownedEstablishment.id, 1, '09:00:00', '17:00:00');
                await createRule(ownedEstablishment.id, 3, '10:00:00', '18:00:00');
                await createRule(otherEstablishment.id, 1, '08:00:00', '16:00:00');
            });
            it('should return all rules for the owned establishment (200)', async () => {
                const response = await ownerAgent.get(route).set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.length).toBe(2);
            });
            it('should return 403 if user is not admin', async () => {
                const response = await clientAgent.get(route).set('Authorization', `Bearer ${clientAccessToken}`);
                expect(response.status).toBe(403);
            });
            it('should return 404 if user tries to access rules for establishment they dont own', async () => { // CORRECTION: 404
                const otherRoute = `/api/users/me/establishments/${otherEstablishment.id}/availability/rules`;
                const response = await ownerAgent.get(otherRoute).set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(404);
            });
        });

        describe('PUT /api/availability/rules/:ruleId', () => {
            let ruleToUpdateId: number;
            let otherOwnerRuleToUpdateId: number;
            const updateData: UpdateAvailabilityRuleDto = { day_of_week: 4, start_time: '10:00:00', end_time: '19:00:00' };
            beforeEach(async () => {
                const rule1 = await createRule(ownedEstablishment.id, 1, '09:00:00', '17:00:00');
                const rule2 = await createRule(otherEstablishment.id, 4, '08:00:00', '16:00:00');
                ruleToUpdateId = rule1.id;
                otherOwnerRuleToUpdateId = rule2.id;
            });
            it('should update the rule successfully if user owns it (200)', async () => {
                const response = await ownerAgent.put(`/api/availability/rules/${ruleToUpdateId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateData);
                expect(response.status).toBe(200);
                expect(response.body.day_of_week).toBe(updateData.day_of_week);
            });
            it('should return 401 if user is not authenticated', async () => {
                const response = await supertest(app).put(`/api/availability/rules/${ruleToUpdateId}`).send(updateData);
                expect(response.status).toBe(401);
            });
            it('should return 403 if user does not have ESTABLISHMENT_ADMIN role', async () => {
                const response = await clientAgent.put(`/api/availability/rules/${ruleToUpdateId}`).set('Authorization', `Bearer ${clientAccessToken}`).send(updateData);
                expect(response.status).toBe(403);
            });
            it('should return 403 if user tries to update rule belonging to another establishment', async () => {
                const response = await ownerAgent.put(`/api/availability/rules/${otherOwnerRuleToUpdateId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateData);
                expect(response.status).toBe(403);
            });
            it('should return 404 if rule ID does not exist', async () => {
                const response = await ownerAgent.put(`/api/availability/rules/999999`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateData);
                expect(response.status).toBe(404);
            });
            it('should return 400 if request body is invalid (Zod - bad time format)', async () => {
                const invalidData = { ...updateData, end_time: 'invalid' };
                const response = await ownerAgent.put(`/api/availability/rules/${ruleToUpdateId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(invalidData);
                expect(response.status).toBe(400);
            });
            it('should return 400 if start_time is not before end_time (Zod refine)', async () => {
                const invalidData = { ...updateData, start_time: '19:00:00', end_time: '10:00:00' };
                const response = await ownerAgent.put(`/api/availability/rules/${ruleToUpdateId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(invalidData);
                expect(response.status).toBe(400);
            });
            it('should return 409 if updating to a day_of_week that already has a rule', async () => {
                await createRule(ownedEstablishment.id, 4, '08:00:00', '12:00:00');
                const response = await ownerAgent.put(`/api/availability/rules/${ruleToUpdateId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateData);
                expect(response.status).toBe(409);
            });
            it('should allow updating times without changing day, even if other days have rules', async () => {
                await createRule(ownedEstablishment.id, 4, '08:00:00', '12:00:00');
                const updateTimesOnly = { day_of_week: 1, start_time: '10:30:00', end_time: '16:30:00' };
                const response = await ownerAgent.put(`/api/availability/rules/${ruleToUpdateId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateTimesOnly);
                expect(response.status).toBe(200);
                expect(response.body.day_of_week).toBe(1);
            });
        });

        describe('DELETE /api/availability/rules/:ruleId', () => {
            beforeEach(async () => {
                const rule1 = await createRule(ownedEstablishment.id, 2, '09:00:00', '17:00:00');
                const rule2 = await createRule(otherEstablishment.id, 2, '08:00:00', '16:00:00');
                existingRuleId = rule1.id;
                otherOwnerRuleId = rule2.id;
            });
            it('should delete the rule successfully if user owns it (204)', async () => {
                const response = await ownerAgent.delete(`/api/availability/rules/${existingRuleId}`).set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(204);
            });
            it('should return 403 if user does not own the rule', async () => {
                const response = await ownerAgent.delete(`/api/availability/rules/${otherOwnerRuleId}`).set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(403);
            });
            it('should return 401 if not authenticated', async () => {
                const response = await supertest(app).delete(`/api/availability/rules/${existingRuleId}`);
                expect(response.status).toBe(401);
            });
            it('should return 403 if user is not admin', async () => {
                const response = await clientAgent.delete(`/api/availability/rules/${existingRuleId}`).set('Authorization', `Bearer ${clientAccessToken}`);
                expect(response.status).toBe(403);
            });
            it('should return 404 if rule ID does not exist', async () => {
                const response = await ownerAgent.delete('/api/availability/rules/99999').set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(404);
            });
        });

        describe('POST /api/users/me/establishments/:establishmentId/availability/overrides', () => {
            let route: string;
            beforeEach(() => { route = `/api/users/me/establishments/${ownedEstablishment.id}/availability/overrides`; });

            it('should create a new override for the owned establishment (201)', async () => {
                const futureStartISO = getFutureDateISO(2, '10:00:00');
                const futureEndISO = getFutureDateISO(2, '14:00:00');
                const validOverrideData = { start_datetime: futureStartISO, end_datetime: futureEndISO, is_available: false, reason: "Maintenance" };
                const response = await ownerAgent.post(route).set('Authorization', `Bearer ${ownerAccessToken}`).send(validOverrideData);
                expect(response.status).toBe(201);
            });
            it('should return 400 if start_datetime is in the past', async () => {
                const pastStartISO = getPastDateISO(1, '10:00:00');
                const futureEndForPastStart = getFutureDateISO(0, '14:00:00');
                const pastData = { start_datetime: pastStartISO, end_datetime: futureEndForPastStart, is_available: false };
                const response = await ownerAgent.post(route).set('Authorization', `Bearer ${ownerAccessToken}`).send(pastData);
                expect(response.status).toBe(400);
                expect(response.body.errors?.[0]?.message).toContain("Start date/time cannot be in the past");
            });
            it('should return 400 if duration exceeds maximum allowed', async () => {
                const futureStartISO = getFutureDateISO(2, '10:00:00');
                const farFutureEndISO = getFutureDateISO(400, '10:00:00');
                const longData = { start_datetime: futureStartISO, end_datetime: farFutureEndISO, is_available: false };
                const response = await ownerAgent.post(route).set('Authorization', `Bearer ${ownerAccessToken}`).send(longData);
                expect(response.status).toBe(400);
                expect(response.body.errors?.[0]?.message).toContain("duration cannot exceed");
            });
            it('should return 401 if user is not authenticated', async () => {
                const futureStartISO = getFutureDateISO(2, '10:00:00'); const futureEndISO = getFutureDateISO(2, '14:00:00');
                const validOverrideData = { start_datetime: futureStartISO, end_datetime: futureEndISO, is_available: false, reason: "Maintenance" };
                const response = await supertest(app).post(route).send(validOverrideData); expect(response.status).toBe(401);
            });
            it('should return 403 if user is not admin', async () => {
                const futureStartISO = getFutureDateISO(2, '10:00:00'); const futureEndISO = getFutureDateISO(2, '14:00:00');
                const validOverrideData = { start_datetime: futureStartISO, end_datetime: futureEndISO, is_available: false, reason: "Maintenance" };
                const response = await clientAgent.post(route).set('Authorization', `Bearer ${clientAccessToken}`).send(validOverrideData); expect(response.status).toBe(403);
            });
            it('should return 404 if user tries to create override for establishment they dont own', async () => { // CORRECTION: 404
                const futureStartISO = getFutureDateISO(2, '10:00:00'); const futureEndISO = getFutureDateISO(2, '14:00:00');
                const validOverrideData = { start_datetime: futureStartISO, end_datetime: futureEndISO, is_available: false, reason: "Maintenance" };
                const otherRoute = `/api/users/me/establishments/${otherEstablishment.id}/availability/overrides`;
                const response = await ownerAgent.post(otherRoute).set('Authorization', `Bearer ${ownerAccessToken}`).send(validOverrideData);
                expect(response.status).toBe(404);
            });
            it('should return 400 if body is invalid (missing fields)', async () => {
                const futureStartISO = getFutureDateISO(2, '10:00:00'); const futureEndISO = getFutureDateISO(2, '14:00:00');
                const invalidData = { start_datetime: futureStartISO, end_datetime: futureEndISO };
                const response = await ownerAgent.post(route).set('Authorization', `Bearer ${ownerAccessToken}`).send(invalidData);
                expect(response.status).toBe(400);
                expect(response.body.errors?.[0]?.message).toEqual("Availability status (is_available) is required");
            });
        });

        describe('GET /api/users/me/establishments/:establishmentId/availability/overrides', () => {
            let route: string;
            beforeEach(async () => {
                route = `/api/users/me/establishments/${ownedEstablishment.id}/availability/overrides`;
                const ov1DateStart = getFutureDateISO(1, '09:00:00'); const ov1DateEnd = getFutureDateISO(1, '12:00:00');
                const ov2DateStart = getFutureDateISO(5, '00:00:00'); const ov2DateEnd = getFutureDateISO(6, '00:00:00');
                await createOverride(ownedEstablishment.id, ov1DateStart, ov1DateEnd, false);
                await createOverride(ownedEstablishment.id, ov2DateStart, ov2DateEnd, true);
                await createOverride(otherEstablishment.id, ov1DateStart, ov1DateEnd, false);
            });
            it('should return all overrides for the owned establishment (200)', async () => {
                const response = await ownerAgent.get(route).set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(200); expect(response.body.length).toBe(2);
            });
            it('should return 401 if not authenticated', async () => { const response = await supertest(app).get(route); expect(response.status).toBe(401); });
            it('should return 403 if user is not admin', async () => { const response = await clientAgent.get(route).set('Authorization', `Bearer ${clientAccessToken}`); expect(response.status).toBe(403); });
            it('should return 404 if user tries to access overrides for establishment they dont own', async () => { // CORRECTION: 404
                const otherRoute = `/api/users/me/establishments/${otherEstablishment.id}/availability/overrides`;
                const response = await ownerAgent.get(otherRoute).set('Authorization', `Bearer ${ownerAccessToken}`); expect(response.status).toBe(404);
            });
        });

        describe('PUT /api/availability/overrides/:overrideId', () => {
            let futureStartISO: string; let futureEndISO: string;
            const updatedReason = "Updated Reason";

            beforeEach(async () => {
                futureStartISO = getFutureDateISO(3, '09:00:00');
                futureEndISO = getFutureDateISO(3, '12:00:00');
                const ov1 = await createOverride(ownedEstablishment.id, futureStartISO, futureEndISO, false);
                const ov2 = await createOverride(otherEstablishment.id, futureStartISO, futureEndISO, false);
                existingOverrideId = ov1.id;
                otherOwnerOverrideId = ov2.id;
            });
            it('should update the override reason successfully if user owns it (200)', async () => {
                const updateDataReason = { reason: updatedReason };
                const response = await ownerAgent.put(`/api/availability/overrides/${existingOverrideId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateDataReason);
                expect(response.status).toBe(200); expect(response.body.reason).toBe(updatedReason);
            });
            it('should return 400 if updating start_datetime to the past', async () => {
                const pastStartISO = getPastDateISO(2, '09:00:00');
                const updateDataPast = { start_datetime: pastStartISO };
                const response = await ownerAgent.put(`/api/availability/overrides/${existingOverrideId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateDataPast);
                expect(response.status).toBe(400);
                expect(response.body.errors?.[0]?.message).toContain("Start date/time cannot be set in the past");
            });
            it('should return 400 if updating results in duration exceeding maximum', async () => {
                const farFutureEndISO = getFutureDateISO(400, '12:00:00');
                const updateDataLong = { end_datetime: farFutureEndISO };
                const response = await ownerAgent.put(`/api/availability/overrides/${existingOverrideId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateDataLong);
                expect(response.status).toBe(400);
                expect(response.body.message).toContain("duration cannot exceed");
            });
            it('should return 403 if user does not own the override', async () => { const updateDataReason = { reason: updatedReason }; const response = await ownerAgent.put(`/api/availability/overrides/${otherOwnerOverrideId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send(updateDataReason); expect(response.status).toBe(403); });
            it('should return 401 if not authenticated', async () => { const updateDataReason = { reason: updatedReason }; const response = await supertest(app).put(`/api/availability/overrides/${existingOverrideId}`).send(updateDataReason); expect(response.status).toBe(401); });
            it('should return 403 if user is not admin', async () => { const updateDataReason = { reason: updatedReason }; const response = await clientAgent.put(`/api/availability/overrides/${existingOverrideId}`).set('Authorization', `Bearer ${clientAccessToken}`).send(updateDataReason); expect(response.status).toBe(403); });
            it('should return 404 if override ID does not exist', async () => { const updateDataReason = { reason: updatedReason }; const response = await ownerAgent.put('/api/availability/overrides/99999').set('Authorization', `Bearer ${ownerAccessToken}`).send(updateDataReason); expect(response.status).toBe(404); });
            it('should return 400 if body is invalid (empty)', async () => { const response = await ownerAgent.put(`/api/availability/overrides/${existingOverrideId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({}); expect(response.status).toBe(400); });
        });

        describe('DELETE /api/availability/overrides/:overrideId', () => {
            let futureStartISO: string; let futureEndISO: string;
            beforeEach(async () => {
                futureStartISO = getFutureDateISO(3, '09:00:00');
                futureEndISO = getFutureDateISO(3, '12:00:00');
                const ov1 = await createOverride(ownedEstablishment.id, futureStartISO, futureEndISO, true);
                const ov2 = await createOverride(otherEstablishment.id, futureStartISO, futureEndISO, true);
                existingOverrideId = ov1.id;
                otherOwnerOverrideId = ov2.id;
            });
            it('should delete the override successfully if user owns it (204)', async () => {
                const response = await ownerAgent.delete(`/api/availability/overrides/${existingOverrideId}`).set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(204);
                const dbOverride = await db.AvailabilityOverride.findByPk(existingOverrideId); expect(dbOverride).toBeNull();
            });
            it('should return 403 if user does not own the override', async () => {
                const response = await ownerAgent.delete(`/api/availability/overrides/${otherOwnerOverrideId}`).set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(403);
            });
            it('should return 401 if not authenticated', async () => {
                const response = await supertest(app).delete(`/api/availability/overrides/${existingOverrideId}`);
                expect(response.status).toBe(401);
            });
            it('should return 403 if user is not admin', async () => {
                const response = await clientAgent.delete(`/api/availability/overrides/${existingOverrideId}`).set('Authorization', `Bearer ${clientAccessToken}`);
                expect(response.status).toBe(403);
            });
            it('should return 404 if override ID does not exist', async () => {
                const response = await ownerAgent.delete('/api/availability/overrides/99999').set('Authorization', `Bearer ${ownerAccessToken}`);
                expect(response.status).toBe(404);
            });
        });
    });

    // --- Calculation Tests ---
    describe('GET /api/services/:serviceId/availability (Calculation Logic)', () => {
        // --- Tests 1 à 22 (inchangés) ---
        it('1. should return all slots based on a simple rule (09-17, 60min)', async () => {
            await createRule(ownedEstablishment.id, targetDayOfWeek, '09:00:00', '17:00:00');
            const response = await supertest(app).get(`/api/services/${serviceId_60min}/availability?date=${targetDateStr}`);
            expect(response.status).toBe(200);
            const expected = expectSlots(targetDateStr, ['09:00:00', '10:00:00', '11:00:00', '12:00:00', '13:00:00', '14:00:00', '15:00:00', '16:00:00']);
            expect(response.body.availableSlots).toEqual(expected);
        });
        it('5. should exclude slots during a partial closing override (12-14)', async () => {
            await createRule(ownedEstablishment.id, targetDayOfWeek, '09:00:00', '17:00:00');
            await createOverride(ownedEstablishment.id, `${targetDateStr}T12:00:00.000Z`, `${targetDateStr}T14:00:00.000Z`, false);
            const response = await supertest(app).get(`/api/services/${serviceId_60min}/availability?date=${targetDateStr}`);
            expect(response.status).toBe(200);
            const expected = expectSlots(targetDateStr, ['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00', '16:00:00']);
            expect(response.body.availableSlots).toEqual(expected);
        });
        it('9. should exclude a slot blocked by an existing booking (11:00-12:00)', async () => {
            await createRule(ownedEstablishment.id, targetDayOfWeek, '09:00:00', '17:00:00');
            await createBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, `${targetDateStr}T11:00:00.000Z`, `${targetDateStr}T12:00:00.000Z`);
            const response = await supertest(app).get(`/api/services/${serviceId_60min}/availability?date=${targetDateStr}`);
            expect(response.status).toBe(200);
            const expected = expectSlots(targetDateStr, ['09:00:00', '10:00:00', '12:00:00', '13:00:00', '14:00:00', '15:00:00', '16:00:00']);
            expect(response.body.availableSlots).toEqual(expected);
        });

        describe('Error Handling for GET /availability', () => {
            let inactiveServiceId_avail: number;
            let unvalidatedEstablishmentServiceId_avail: number;
            beforeEach(async () => {
                const svcInactive = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Inactive Avail", duration_minutes: 30, price: 30, currency: "EUR", is_active: false });
                const unvalEstab = await db.Establishment.create({ name: "Avail Unval Studio 2", siret: "44400044440044", siren: "444000444", owner_id: ownerUser.id, is_validated: false, address_line1: 'e', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
                const svcUnval = await db.Service.create({ establishment_id: unvalEstab.id, name: "Unvalidated Service Avail 2", duration_minutes: 90, price: 70, currency: "EUR", is_active: true });
                inactiveServiceId_avail = svcInactive.id;
                unvalidatedEstablishmentServiceId_avail = svcUnval.id;
            });

            it('should return 404 if service ID does not exist', async () => {
                const response = await supertest(app).get(`/api/services/999999/availability?date=${targetDateStr}`);
                expect(response.status).toBe(404);
            });
            it('should return 404 if service exists but is inactive', async () => {
                const response = await supertest(app).get(`/api/services/${inactiveServiceId_avail}/availability?date=${targetDateStr}`);
                expect(response.status).toBe(404);
            });
            it('should return 404 if service exists but its establishment is not validated', async () => {
                const response = await supertest(app).get(`/api/services/${unvalidatedEstablishmentServiceId_avail}/availability?date=${targetDateStr}`);
                expect(response.status).toBe(404);
            });
            it('should return 400 if date query parameter is missing', async () => {
                const response = await supertest(app).get(`/api/services/${serviceId_60min}/availability`);
                expect(response.status).toBe(400);
            });
            it('should return 400 if date query parameter format is invalid', async () => {
                const response = await supertest(app).get(`/api/services/${serviceId_60min}/availability?date=2023/01/01`);
                expect(response.status).toBe(400);
            });
        });
    });
});