// tests/routes/booking.routes.test.ts
import supertest from 'supertest';
import { app, server } from '../../src/server';
import db from '../../src/models';
import { UserAttributes } from '../../src/models/User';
import Establishment from '../../src/models/Establishment';
import Service from '../../src/models/Service';
import Role, { ROLES } from '../../src/models/Role';
import Booking, { BookingStatus, PaymentStatus } from '../../src/models/Booking';
import { CreateBookingDto, UpdateBookingStatusDto } from '../../src/dtos/booking.validation';
import { generateTestUser, loginTestUser } from '../helpers/auth.helpers'; // Supprimé AuthResult

// --- Variables globales ---
let clientUser: UserAttributes;
let ownerUser: UserAttributes;
let otherOwnerUser: UserAttributes;

// *** CORRECTION : Laisser TypeScript inférer le type des agents ***
let clientAgent: any;
let ownerAgent: any;
let otherOwnerAgent: any;

let clientAccessToken: string;
let ownerAccessToken: string;
let otherOwnerAccessToken: string;

let ownedEstablishment: Establishment;
let otherEstablishment: Establishment;
let unvalidatedEstablishment: Establishment;

let serviceId_60min: number;
let inactiveServiceId: number;
let unvalidatedEstablishmentServiceId: number;

const ESTABLISHMENT_ADMIN_ROLE_NAME = ROLES.ESTABLISHMENT_ADMIN;
const CLIENT_ROLE_NAME = ROLES.CLIENT;

const getTomorrowDateString = (): string => {
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow.toISOString().split('T')[0];
};

let targetDateStr: string;
let slotOk: string;
let slotConflict: string;
let slotPast: string = '2023-01-01T10:00:00.000Z';
let slotNearFuture: Date = new Date();
let slotFarFuture: Date = new Date();

// --- Helpers ---
const createRule = async (estabId: number, day: number, start: string, end: string) => {
    await db.AvailabilityRule.findOrCreate({
        where: { establishment_id: estabId, day_of_week: day },
        defaults: { establishment_id: estabId, day_of_week: day, start_time: start, end_time: end }
    });
};
const createOverride = async (estabId: number, startISO: string, endISO: string, available: boolean) => {
    await db.AvailabilityOverride.create({ establishment_id: estabId, start_datetime: new Date(startISO), end_datetime: new Date(endISO), is_available: available });
};
const createTestBooking = async (svcId: number, userId: number, estabId: number, startISO: string, durationMinutes: number, status: BookingStatus = BookingStatus.CONFIRMED): Promise<Booking> => {
    const start = new Date(startISO);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    try {
        return await db.Booking.create({
            user_id: userId, establishment_id: estabId, service_id: svcId,
            start_datetime: start, end_datetime: end,
            status: status, price_at_booking: 50, currency_at_booking: 'EUR', payment_status: PaymentStatus.NOT_PAID
        });
    } catch (error) {
        console.error(`Error in createTestBooking (svcId: ${svcId}, userId: ${userId}, estabId: ${estabId}, startISO: ${startISO}):`, error);
        throw error;
    }
};
// --- Fin Helpers ---

describe('Booking Routes Integration Tests', () => {

    beforeAll(async () => {
        try {
            await db.sequelize.authenticate();
            console.log('Test Database connection authenticated for Booking tests.');
            await db.Role.findOrCreate({ where: { name: CLIENT_ROLE_NAME }, defaults: { name: CLIENT_ROLE_NAME } });
            await db.Role.findOrCreate({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME }, defaults: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
            console.log('Required roles checked/created for Booking tests.');
        } catch (error) {
            console.error('!!! BOOKING TEST DATABASE SETUP FAILED (beforeAll) !!!', error);
            throw error;
        }
    });

    beforeEach(async () => {
        try {
            // Calculer les dates DYNAMIQUEMENT dans beforeEach
            targetDateStr = getTomorrowDateString();
            slotOk = `${targetDateStr}T10:00:00.000Z`;
            slotConflict = `${targetDateStr}T11:00:00.000Z`;
            slotNearFuture = new Date(); slotNearFuture.setUTCHours(slotNearFuture.getUTCHours() + 1); slotNearFuture.setUTCMinutes(0); slotNearFuture.setUTCSeconds(0); slotNearFuture.setUTCMilliseconds(0);
            slotFarFuture = new Date(); slotFarFuture.setUTCDate(slotFarFuture.getUTCDate() + 3); slotFarFuture.setUTCHours(14,0,0,0);


            // Nettoyage ordonné
            await db.Booking.destroy({ where: {}, force: true });
            await db.AvailabilityOverride.destroy({ where: {} });
            await db.AvailabilityRule.destroy({ where: {} });
            await db.Service.destroy({ where: {} });
            await db.UserRole.destroy({ where: {} });
            await db.Establishment.destroy({ where: {} });
            await db.RefreshToken.destroy({ where: {} });
            await db.User.destroy({ where: {} });

            // Recréer utilisateurs
            clientUser = await generateTestUser({ username: 'client_book', email: 'client_book@test.com', password: 'p' });
            ownerUser = await generateTestUser({ username: 'owner_book', email: 'owner_book@test.com', password: 'p' });
            otherOwnerUser = await generateTestUser({ username: 'other_owner_book', email: 'other_book@test.com', password: 'p' });

            // Assigner rôles
            const clientRole = await db.Role.findOne({ where: { name: CLIENT_ROLE_NAME } });
            const adminRole = await db.Role.findOne({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
            if (!clientRole || !adminRole) throw new Error("Roles not found in beforeEach.");
            const clientInst = await db.User.findByPk(clientUser.id);
            const ownerInst = await db.User.findByPk(ownerUser.id);
            const otherOwnerInst = await db.User.findByPk(otherOwnerUser.id);
            if (!clientInst || !ownerInst || !otherOwnerInst) throw new Error("User instances not found in beforeEach");
            await clientInst.addRole(clientRole);
            await ownerInst.addRole(clientRole); await ownerInst.addRole(adminRole);
            await otherOwnerInst.addRole(clientRole); await otherOwnerInst.addRole(adminRole);

            // Recréer établissements
            ownedEstablishment = await db.Establishment.create({ name: "Booking Studio", siret: "66600066660066", siren: "666000666", owner_id: ownerUser.id, is_validated: true, address_line1: 'a', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
            otherEstablishment = await db.Establishment.create({ name: "Other Booking Studio", siret: "77700077770077", siren: "777000777", owner_id: otherOwnerUser.id, is_validated: true, address_line1: 'b', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
            unvalidatedEstablishment = await db.Establishment.create({ name: "Unvalidated Booking Studio", siret: "88800088880088", siren: "888000888", owner_id: ownerUser.id, is_validated: false, address_line1: 'd', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });

            // Recréer services
            const svc1 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Bookable Service", duration_minutes: 60, price: 50, currency: "EUR", is_active: true });
            const svc2 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Inactive Bookable", duration_minutes: 30, price: 30, currency: "EUR", is_active: false });
            const svc3 = await db.Service.create({ establishment_id: unvalidatedEstablishment.id, name: "Unvalidated Service Book", duration_minutes: 90, price: 70, currency: "EUR", is_active: true });
            serviceId_60min = svc1.id;
            inactiveServiceId = svc2.id;
            unvalidatedEstablishmentServiceId = svc3.id;

            // Créer règle de dispo pour le jour de test
            const dayOfWeek = new Date(targetDateStr).getUTCDay();
            await createRule(ownedEstablishment.id, dayOfWeek, '09:00:00', '17:00:00');
            await createRule(otherEstablishment.id, dayOfWeek, '10:00:00', '18:00:00');

            // Authentifier
            clientAgent = supertest.agent(app); // Laisser TypeScript inférer
            ownerAgent = supertest.agent(app); // Laisser TypeScript inférer
            otherOwnerAgent = supertest.agent(app); // Laisser TypeScript inférer

            // Utiliser 'any' pour le résultat de loginTestUser
            let authResult: any;
            authResult = await loginTestUser(clientAgent, { email: clientUser.email, password: 'p' });
            clientAccessToken = authResult.accessToken;
            authResult = await loginTestUser(ownerAgent, { email: ownerUser.email, password: 'p' });
            ownerAccessToken = authResult.accessToken;
            authResult = await loginTestUser(otherOwnerAgent, { email: otherOwnerUser.email, password: 'p' });
            otherOwnerAccessToken = authResult.accessToken;

        } catch(error) {
            console.error("!!! ERROR DURING beforeEach !!!", error);
            throw error;
        }
    });

    afterAll(async () => {
        await db.sequelize.close();
        if (server && server.close) server.close();
    });

    // =========================================================================
    // Tests pour POST /api/bookings (Création)
    // =========================================================================
    describe('POST /api/bookings', () => {
        let validBookingData: CreateBookingDto;

        beforeEach(() => {
            if (!slotOk) throw new Error("slotOk not defined in beforeEach");
            validBookingData = {
                serviceId: serviceId_60min,
                startDatetime: slotOk,
                userNotes: "Need a quiet session."
            };
        });

        it('should create a booking successfully for an available slot (201)', async () => {
            const response = await clientAgent
                .post('/api/bookings')
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send(validBookingData);
            expect(response.status).toBe(201);
            expect(response.body.id).toBeDefined();
            expect(new Date(response.body.start_datetime).toISOString()).toBe(slotOk);
            expect(response.body.status).toBe(BookingStatus.CONFIRMED);
        });

        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).post('/api/bookings').send(validBookingData);
            expect(response.status).toBe(401);
        });

        it('should return 409 if the selected slot is already booked', async () => {
            await createTestBooking(serviceId_60min, otherOwnerUser.id, ownedEstablishment.id, slotOk, 60);
            const response = await clientAgent
                .post('/api/bookings')
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send(validBookingData);
            expect(response.status).toBe(409);
        });

        it('should return 409 if the slot conflicts with an existing booking (test avec slotConflict)', async () => {
            validBookingData.startDatetime = slotConflict;
            const startConflict = new Date(slotConflict); startConflict.setUTCMinutes(startConflict.getUTCMinutes() - 30);
            await createTestBooking(serviceId_60min, otherOwnerUser.id, ownedEstablishment.id, startConflict.toISOString(), 60);
            const response = await clientAgent
                .post('/api/bookings')
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send(validBookingData);
            expect(response.status).toBe(409);
        });

        it('should return 409 if the selected slot is unavailable due to a closing override', async () => {
            await createOverride(ownedEstablishment.id, `${targetDateStr}T09:30:00.000Z`, `${targetDateStr}T10:30:00.000Z`, false);
            const response = await clientAgent
                .post('/api/bookings')
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send(validBookingData);
            expect(response.status).toBe(409);
        });

        it('should return 404 if the service ID does not exist', async () => {
            const response = await clientAgent
                .post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`)
                .send({ ...validBookingData, serviceId: 999999 });
            expect(response.status).toBe(404);
        });

        it('should return 404 if the service is inactive', async () => {
            const response = await clientAgent
                .post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`)
                .send({ ...validBookingData, serviceId: inactiveServiceId });
            expect(response.status).toBe(404);
        });

        it('should return 404 if the service belongs to a non-validated establishment', async () => {
            const response = await clientAgent
                .post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`)
                .send({ ...validBookingData, serviceId: unvalidatedEstablishmentServiceId });
            expect(response.status).toBe(404);
        });

        it('should return 400 if the selected slot is in the past', async () => {
            const response = await clientAgent
                .post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`)
                .send({ ...validBookingData, startDatetime: slotPast });
            expect(response.status).toBe(400);
        });

        it('should return 400 if request body is invalid (Zod)', async () => {
            const response = await clientAgent
                .post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`)
                .send({ startDatetime: slotOk });
            expect(response.status).toBe(400);
        });

        it('should return 400 if startDatetime format is invalid', async () => {
            const response = await clientAgent
                .post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`)
                .send({ ...validBookingData, startDatetime: 'invalid-date' });
            expect(response.status).toBe(400);
        });
    });

    // =========================================================================
    // Tests pour GET Lists (/users/me/bookings & /users/me/establishments/:id/bookings)
    // =========================================================================
    describe('GET Lists: User & Establishment Bookings', () => {
        let bookingClientOwned: Booking;
        let bookingClientOther: Booking;
        let bookingOwnerOwned: Booking;

        beforeEach(async () => {
            bookingClientOwned = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, `${targetDateStr}T14:00:00.000Z`, 60);
            bookingOwnerOwned = await createTestBooking(serviceId_60min, ownerUser.id, ownedEstablishment.id, `${targetDateStr}T15:00:00.000Z`, 60);
            const otherSvc = await db.Service.create({ establishment_id: otherEstablishment.id, name: "Other Svc", duration_minutes: 60, price: 50, currency: "EUR", is_active: true });
            bookingClientOther = await createTestBooking(otherSvc.id, clientUser.id, otherEstablishment.id, `${targetDateStr}T10:00:00.000Z`, 60);
        });

        // --- /users/me/bookings ---
        it('should return the bookings belonging to the authenticated client', async () => {
            const response = await clientAgent
                .get('/api/users/me/bookings')
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(2);
            expect(response.body.pagination.totalItems).toBe(2);
        });
        it('should return 401 if client is not authenticated when fetching their bookings', async () => {
            const response = await supertest(app).get('/api/users/me/bookings');
            expect(response.status).toBe(401);
        });

        // --- /users/me/establishments/:establishmentId/bookings ---
        it('should return bookings for the specified owned establishment', async () => {
            const route = `/api/users/me/establishments/${ownedEstablishment.id}/bookings`;
            const response = await ownerAgent
                .get(route)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(2);
            expect(response.body.pagination.totalItems).toBe(2);
        });
        it('should return 401 if admin is not authenticated when fetching establishment bookings', async () => {
            const route = `/api/users/me/establishments/${ownedEstablishment.id}/bookings`;
            const response = await supertest(app).get(route);
            expect(response.status).toBe(401);
        });
        it('should return 403 if user does not have ESTABLISHMENT_ADMIN role', async () => {
            const route = `/api/users/me/establishments/${ownedEstablishment.id}/bookings`;
            const response = await clientAgent
                .get(route)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403);
        });
        it('should return 404 if admin tries to access bookings of establishment they dont own', async () => {
            const route = `/api/users/me/establishments/${otherEstablishment.id}/bookings`;
            const response = await ownerAgent
                .get(route)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });
        it('should return 404 if establishment ID does not exist', async () => {
            const route = `/api/users/me/establishments/999999/bookings`;
            const response = await ownerAgent
                .get(route)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour GET /api/bookings/:bookingId (Détail)
    // =========================================================================
    describe('GET /api/bookings/:bookingId (Detail)', () => {
        let bookingIdClient: number;
        let bookingIdOwner: number;
        let bookingIdOtherEstablishment: number;

        beforeEach(async () => {
            const bkCl = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, `${targetDateStr}T14:00:00.000Z`, 60);
            const bkOw = await createTestBooking(serviceId_60min, ownerUser.id, ownedEstablishment.id, `${targetDateStr}T15:00:00.000Z`, 60);
            const otherSvc = await db.Service.create({ establishment_id: otherEstablishment.id, name: "Other Svc Get", duration_minutes: 60, price: 50, currency: "EUR", is_active: true });
            const bkOther = await createTestBooking(otherSvc.id, clientUser.id, otherEstablishment.id, `${targetDateStr}T10:00:00.000Z`, 60);
            bookingIdClient = bkCl.id;
            bookingIdOwner = bkOw.id;
            bookingIdOtherEstablishment = bkOther.id;
        });

        it('should return booking details if requested by the client owner (200)', async () => {
            const response = await clientAgent
                .get(`/api/bookings/${bookingIdClient}`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
        });
        it('should return booking details if requested by the establishment admin (200)', async () => {
            const response = await ownerAgent
                .get(`/api/bookings/${bookingIdClient}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(200);
        });
        it('should return 404 if client tries to access another user\'s booking', async () => {
            const response = await clientAgent
                .get(`/api/bookings/${bookingIdOwner}`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(404);
        });
        it('should return 404 if admin tries to access a booking from another establishment', async () => {
            const response = await ownerAgent
                .get(`/api/bookings/${bookingIdOtherEstablishment}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });
        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).get(`/api/bookings/${bookingIdClient}`);
            expect(response.status).toBe(401);
        });
        it('should return 404 if booking ID does not exist', async () => {
            const response = await clientAgent.get(`/api/bookings/99999`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour PATCH /api/bookings/:bookingId/cancel (Annulation Client)
    // =========================================================================
    describe('PATCH /api/bookings/:bookingId/cancel (Client Cancellation)', () => {
        let bookingToCancelFar: Booking;
        let bookingToCancelNear: Booking;
        let bookingCancelled: Booking;
        let bookingNotOwned: Booking;

        beforeEach(async () => {
            slotFarFuture = new Date(); slotFarFuture.setUTCDate(slotFarFuture.getUTCDate() + 3); slotFarFuture.setUTCHours(14,0,0,0);
            slotNearFuture = new Date(); slotNearFuture.setUTCHours(slotNearFuture.getUTCHours() + 1); slotNearFuture.setUTCMinutes(0); slotNearFuture.setUTCSeconds(0); slotNearFuture.setUTCMilliseconds(0);

            bookingToCancelFar = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, slotFarFuture.toISOString(), 60);
            bookingToCancelNear = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, slotNearFuture.toISOString(), 60);
            bookingCancelled = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, slotFarFuture.toISOString(), 60, BookingStatus.CANCELLED_BY_ADMIN);
            bookingNotOwned = await createTestBooking(serviceId_60min, ownerUser.id, ownedEstablishment.id, slotFarFuture.toISOString(), 60);
        });

        it('should cancel the booking successfully if client owner and within window (200)', async () => {
            const response = await clientAgent
                .patch(`/api/bookings/${bookingToCancelFar.id}/cancel`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CANCELLED_BY_USER);
        });
        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).patch(`/api/bookings/${bookingToCancelFar.id}/cancel`);
            expect(response.status).toBe(401);
        });
        it('should return 403 if user tries to cancel another user\'s booking', async () => {
            const response = await clientAgent
                .patch(`/api/bookings/${bookingNotOwned.id}/cancel`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403); // Le service renvoie BookingOwnershipError (403)
        });
        it('should return 403 if cancellation window has passed', async () => {
            const response = await clientAgent
                .patch(`/api/bookings/${bookingToCancelNear.id}/cancel`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403); // Le service renvoie CancellationNotAllowedError (403)
        });
        it('should return 400 if booking is not in a cancellable state (already cancelled)', async () => {
            const response = await clientAgent
                .patch(`/api/bookings/${bookingCancelled.id}/cancel`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(400); // Le service renvoie InvalidBookingOperationError (400)
        });
        it('should return 404 if booking ID does not exist', async () => {
            const response = await clientAgent
                .patch(`/api/bookings/99999/cancel`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(404); // Le service renvoie BookingNotFoundError (404)
        });
    });

    // =========================================================================
    // Tests pour PATCH /api/bookings/:bookingId (MAJ Statut Admin)
    // =========================================================================
    describe('PATCH /api/bookings/:bookingId (Admin Status Update)', () => {
        let bookingToConfirm: Booking;
        let bookingToComplete: Booking;
        let bookingCompleted: Booking;
        let bookingOtherAdminEstablishment: Booking;

        beforeEach(async () => {
            const futureDate = new Date(); futureDate.setUTCDate(futureDate.getUTCDate() + 2); futureDate.setUTCHours(10,0,0,0);
            const pastDate = new Date(); pastDate.setUTCDate(pastDate.getUTCDate() - 1); pastDate.setUTCHours(10,0,0,0);

            bookingToConfirm = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, futureDate.toISOString(), 60, BookingStatus.PENDING_CONFIRMATION);
            bookingToComplete = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, pastDate.toISOString(), 60, BookingStatus.CONFIRMED);
            bookingCompleted = await createTestBooking(serviceId_60min, clientUser.id, ownedEstablishment.id, pastDate.toISOString(), 60, BookingStatus.COMPLETED);
            const otherSvc = await db.Service.create({ establishment_id: otherEstablishment.id, name: "Other Svc Admin", duration_minutes: 60, price: 50, currency: "EUR", is_active: true });
            bookingOtherAdminEstablishment = await createTestBooking(otherSvc.id, clientUser.id, otherEstablishment.id, futureDate.toISOString(), 60);
        });

        it('should update status successfully by admin (CONFIRMED -> COMPLETED) (200)', async () => {
            const response = await ownerAgent
                .patch(`/api/bookings/${bookingToComplete.id}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.COMPLETED);
        });
        it('should update status and establishment notes by admin (200)', async () => {
            const notes = "Client was very satisfied.";
            const response = await ownerAgent
                .patch(`/api/bookings/${bookingToComplete.id}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send({ status: BookingStatus.COMPLETED, establishmentNotes: notes });
            expect(response.status).toBe(200);
            expect(response.body.establishment_notes).toBe(notes);
        });
        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).patch(`/api/bookings/${bookingToComplete.id}`).send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(401);
        });
        it('should return 403 if user is not an establishment admin', async () => {
            const response = await clientAgent
                .patch(`/api/bookings/${bookingToComplete.id}`)
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(403);
        });
        it('should return 403 if admin tries to update booking from another establishment', async () => {
            const response = await ownerAgent
                .patch(`/api/bookings/${bookingOtherAdminEstablishment.id}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(403); // Le service renvoie BookingOwnershipError (403)
        });
        it('should return 404 if booking ID does not exist', async () => {
            const response = await ownerAgent
                .patch(`/api/bookings/99999`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(404);
        });
        it('should return 400 if provided status is invalid (Zod)', async () => {
            const response = await ownerAgent
                .patch(`/api/bookings/${bookingToComplete.id}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send({ status: 'INVALID_ENUM_VALUE' });
            expect(response.status).toBe(400);
        });
        it('should return 400 if status transition is invalid (COMPLETED -> CONFIRMED)', async () => {
            const response = await ownerAgent
                .patch(`/api/bookings/${bookingCompleted.id}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send({ status: BookingStatus.CONFIRMED });
            expect(response.status).toBe(400);
        });
    });
});