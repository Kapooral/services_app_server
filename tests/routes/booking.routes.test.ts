// tests/routes/booking.routes.test.ts
import supertest from 'supertest';
import { app, server } from '../../src/server';
import db from '../../src/models';
import User, { UserAttributes } from '../../src/models/User';
import Establishment from '../../src/models/Establishment';
import Service from '../../src/models/Service';
import Role, { ROLES } from '../../src/models/Role';
import Booking, { BookingStatus, PaymentStatus } from '../../src/models/Booking';
import { CreateBookingDto, UpdateBookingStatusDto } from '../../src/dtos/booking.validation';
import { generateTestUser, loginTestUser } from '../helpers/auth.helpers';

// --- Variables globales ---
let clientUser: UserAttributes;
let ownerUser: UserAttributes;
let otherOwnerUser: UserAttributes;

let clientAgent: any; // Use SuperTest types
let ownerAgent: any;
let otherOwnerAgent: any;

let clientAccessToken: string;
let ownerAccessToken: string;
let otherOwnerAccessToken: string;

let ownedEstablishment: Establishment;
let otherEstablishment: Establishment;
let unvalidatedEstablishment: Establishment;

// --- Service IDs ---
let serviceId_auto_confirm_24h_deadline: number;
let serviceId_manual_confirm: number;
let serviceId_auto_confirm_no_deadline: number;
let serviceId_auto_confirm_60m_deadline: number;
let inactiveServiceId: number;
let unvalidatedEstablishmentServiceId: number;
// --- Fin Service IDs ---

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
            // console.log('Test Database connection authenticated for Booking tests.');
            await db.Role.findOrCreate({ where: { name: CLIENT_ROLE_NAME }, defaults: { name: CLIENT_ROLE_NAME } });
            await db.Role.findOrCreate({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME }, defaults: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
            // console.log('Required roles checked/created for Booking tests.');
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
            const clientInst = await User.findByPk(clientUser.id);
            const ownerInst = await User.findByPk(ownerUser.id);
            const otherOwnerInst = await User.findByPk(otherOwnerUser.id);
            if (!clientInst || !ownerInst || !otherOwnerInst) throw new Error("User instances not found in beforeEach");
            await clientInst.addRole(clientRole);
            await ownerInst.addRole(clientRole); await ownerInst.addRole(adminRole);
            await otherOwnerInst.addRole(clientRole); await otherOwnerInst.addRole(adminRole);

            // Recréer établissements
            ownedEstablishment = await db.Establishment.create({ name: "Booking Studio", siret: "66600066660066", siren: "666000666", owner_id: ownerUser.id, is_validated: true, address_line1: 'a', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
            otherEstablishment = await db.Establishment.create({ name: "Other Booking Studio", siret: "77700077770077", siren: "777000777", owner_id: otherOwnerUser.id, is_validated: true, address_line1: 'b', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
            unvalidatedEstablishment = await db.Establishment.create({ name: "Unvalidated Booking Studio", siret: "88800088880088", siren: "888000888", owner_id: ownerUser.id, is_validated: false, address_line1: 'd', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });

            // Recréer services (avec la nouvelle propriété auto_confirm_bookings)
            const svc1 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "AutoConfirm 24h Deadline", duration_minutes: 60, price: 50, currency: "EUR", is_active: true, cancellation_deadline_minutes: 1440, auto_confirm_bookings: true });
            const svc_inactive = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Inactive Bookable", duration_minutes: 30, price: 30, currency: "EUR", is_active: false, auto_confirm_bookings: true });
            const svc_unvalidated = await db.Service.create({ establishment_id: unvalidatedEstablishment.id, name: "Unvalidated Service Book", duration_minutes: 90, price: 70, currency: "EUR", is_active: true, auto_confirm_bookings: true });
            const svc_no_deadline = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "AutoConfirm No Deadline", duration_minutes: 60, price: 50, currency: "EUR", is_active: true, cancellation_deadline_minutes: null, auto_confirm_bookings: true });
            const svc_60m_deadline = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "AutoConfirm 60m Deadline", duration_minutes: 60, price: 50, currency: "EUR", is_active: true, cancellation_deadline_minutes: 60, auto_confirm_bookings: true });
            const svc_manual_confirm = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Manual Confirm Service", duration_minutes: 45, price: 40, currency: "EUR", is_active: true, auto_confirm_bookings: false });

            // Assigner les IDs globaux
            serviceId_auto_confirm_24h_deadline = svc1.id;
            inactiveServiceId = svc_inactive.id;
            unvalidatedEstablishmentServiceId = svc_unvalidated.id;
            serviceId_auto_confirm_no_deadline = svc_no_deadline.id;
            serviceId_auto_confirm_60m_deadline = svc_60m_deadline.id;
            serviceId_manual_confirm = svc_manual_confirm.id;

            // Créer règle de dispo pour le jour de test
            const dayOfWeek = new Date(targetDateStr).getUTCDay();
            await createRule(ownedEstablishment.id, dayOfWeek, '09:00:00', '17:00:00');
            await createRule(otherEstablishment.id, dayOfWeek, '10:00:00', '18:00:00');

            // Authentifier
            clientAgent = supertest.agent(app);
            ownerAgent = supertest.agent(app);
            otherOwnerAgent = supertest.agent(app);
            clientAccessToken = (await loginTestUser(clientAgent, { email: clientUser.email, password: 'p' })).accessToken;
            ownerAccessToken = (await loginTestUser(ownerAgent, { email: ownerUser.email, password: 'p' })).accessToken;
            otherOwnerAccessToken = (await loginTestUser(otherOwnerAgent, { email: otherOwnerUser.email, password: 'p' })).accessToken;

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
        let validBookingDataAutoConfirm: CreateBookingDto;
        let validBookingDataManualConfirm: CreateBookingDto;

        beforeEach(() => {
            if (!slotOk) throw new Error("slotOk not defined in beforeEach");
            validBookingDataAutoConfirm = { serviceId: serviceId_auto_confirm_24h_deadline, startDatetime: slotOk, userNotes: "Auto" };
            validBookingDataManualConfirm = { serviceId: serviceId_manual_confirm, startDatetime: slotOk, userNotes: "Manual" };
        });

        it('should create a booking with CONFIRMED status for service with autoConfirm:true (201)', async () => {
            const response = await clientAgent
                .post('/api/bookings')
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send(validBookingDataAutoConfirm);
            expect(response.status).toBe(201);
            expect(response.body.id).toBeDefined();
            expect(response.body.status).toBe(BookingStatus.CONFIRMED);
        });

        it('should create a booking with PENDING_CONFIRMATION status for service with autoConfirm:false (201)', async () => {
            const response = await clientAgent
                .post('/api/bookings')
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send(validBookingDataManualConfirm);
            expect(response.status).toBe(201); // Correction: Vérifier le succès de la création même si 409 avant
            expect(response.body.id).toBeDefined();
            expect(response.body.status).toBe(BookingStatus.PENDING_CONFIRMATION);
        });

        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).post('/api/bookings').send(validBookingDataAutoConfirm);
            expect(response.status).toBe(401);
        });

        it('should return 409 if the selected slot is already booked', async () => {
            // Create the first booking successfully
            await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send(validBookingDataAutoConfirm);
            // Attempt to create the second booking for the same slot
            const response = await otherOwnerAgent.post('/api/bookings').set('Authorization', `Bearer ${otherOwnerAccessToken}`).send({...validBookingDataAutoConfirm, userNotes: "Second booking attempt"});
            expect(response.status).toBe(409);
        });

        it('should return 409 if the slot conflicts with an existing booking (test avec slotConflict)', async () => {
            // Setup: Create a booking that overlaps with the slotConflict time
            validBookingDataAutoConfirm.startDatetime = slotConflict; // Target 11:00
            const startConflictBooking = new Date(slotConflict);
            startConflictBooking.setUTCMinutes(startConflictBooking.getUTCMinutes() - 30); // Existing booking starts at 10:30 for 60 mins (overlaps 11:00)
            await createTestBooking(serviceId_auto_confirm_24h_deadline, otherOwnerUser.id, ownedEstablishment.id, startConflictBooking.toISOString(), 60);

            // Action: Try to book at 11:00
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send(validBookingDataAutoConfirm);
            expect(response.status).toBe(409);
        });

        it('should return 409 if the selected slot is unavailable due to a closing override', async () => {
            // Setup: Override makes 10:00 unavailable
            await createOverride(ownedEstablishment.id, `${targetDateStr}T09:30:00.000Z`, `${targetDateStr}T10:30:00.000Z`, false);
            // Action: Try to book at 10:00
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send(validBookingDataAutoConfirm);
            expect(response.status).toBe(409);
        });

        it('should return 404 if the service ID does not exist', async () => {
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send({ ...validBookingDataAutoConfirm, serviceId: 999999 });
            expect(response.status).toBe(404);
        });

        it('should return 404 if the service is inactive', async () => {
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send({ ...validBookingDataAutoConfirm, serviceId: inactiveServiceId });
            expect(response.status).toBe(404);
        });

        it('should return 404 if the service belongs to a non-validated establishment', async () => {
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send({ ...validBookingDataAutoConfirm, serviceId: unvalidatedEstablishmentServiceId });
            expect(response.status).toBe(404);
        });

        it('should return 400 if the selected slot is in the past', async () => {
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send({ ...validBookingDataAutoConfirm, startDatetime: slotPast });
            expect(response.status).toBe(400);
        });

        it('should return 400 if request body is invalid (Zod)', async () => {
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send({ startDatetime: slotOk }); // Missing serviceId
            expect(response.status).toBe(400);
        });

        it('should return 400 if startDatetime format is invalid', async () => {
            const response = await clientAgent.post('/api/bookings').set('Authorization', `Bearer ${clientAccessToken}`).send({ ...validBookingDataAutoConfirm, startDatetime: 'invalid-date' });
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
            bookingClientOwned = await createTestBooking(serviceId_auto_confirm_24h_deadline, clientUser.id, ownedEstablishment.id, `${targetDateStr}T14:00:00.000Z`, 60);
            bookingOwnerOwned = await createTestBooking(serviceId_auto_confirm_24h_deadline, ownerUser.id, ownedEstablishment.id, `${targetDateStr}T15:00:00.000Z`, 60);
            const otherSvc = await db.Service.create({ establishment_id: otherEstablishment.id, name: "Other Svc", duration_minutes: 60, price: 50, currency: "EUR", is_active: true, auto_confirm_bookings: true });
            bookingClientOther = await createTestBooking(otherSvc.id, clientUser.id, otherEstablishment.id, `${targetDateStr}T10:00:00.000Z`, 60);
        });

        it('should return the bookings belonging to the authenticated client', async () => {
            const response = await clientAgent.get('/api/users/me/bookings').set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(2);
            expect(response.body.pagination.totalItems).toBe(2);
        });

        it('should return 401 if client is not authenticated when fetching their bookings', async () => {
            const response = await supertest(app).get('/api/users/me/bookings');
            expect(response.status).toBe(401);
        });

        it('should return bookings for the specified owned establishment', async () => {
            const route = `/api/users/me/establishments/${ownedEstablishment.id}/bookings`;
            const response = await ownerAgent.get(route).set('Authorization', `Bearer ${ownerAccessToken}`);
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
            const response = await clientAgent.get(route).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403);
        });

        it('should return 404 if admin tries to access bookings of establishment they dont own', async () => {
            const route = `/api/users/me/establishments/${otherEstablishment.id}/bookings`;
            const response = await ownerAgent.get(route).set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });

        it('should return 404 if establishment ID does not exist', async () => {
            const route = `/api/users/me/establishments/999999/bookings`;
            const response = await ownerAgent.get(route).set('Authorization', `Bearer ${ownerAccessToken}`);
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
            const bkCl = await createTestBooking(serviceId_auto_confirm_24h_deadline, clientUser.id, ownedEstablishment.id, `${targetDateStr}T14:00:00.000Z`, 60);
            const bkOw = await createTestBooking(serviceId_auto_confirm_24h_deadline, ownerUser.id, ownedEstablishment.id, `${targetDateStr}T15:00:00.000Z`, 60);
            const otherSvc = await db.Service.create({ establishment_id: otherEstablishment.id, name: "Other Svc Get", duration_minutes: 60, price: 50, currency: "EUR", is_active: true, auto_confirm_bookings: true });
            const bkOther = await createTestBooking(otherSvc.id, clientUser.id, otherEstablishment.id, `${targetDateStr}T10:00:00.000Z`, 60);
            bookingIdClient = bkCl.id;
            bookingIdOwner = bkOw.id;
            bookingIdOtherEstablishment = bkOther.id;
        });

        it('should return booking details if requested by the client owner (200)', async () => {
            const response = await clientAgent.get(`/api/bookings/${bookingIdClient}`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(bookingIdClient);
        });

        it('should return booking details if requested by the establishment admin (200)', async () => {
            const response = await ownerAgent.get(`/api/bookings/${bookingIdClient}`).set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(bookingIdClient);
        });

        it('should return 404 if client tries to access another user\'s booking', async () => {
            const response = await clientAgent.get(`/api/bookings/${bookingIdOwner}`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(404);
        });

        it('should return 404 if admin tries to access a booking from another establishment', async () => {
            const response = await ownerAgent.get(`/api/bookings/${bookingIdOtherEstablishment}`).set('Authorization', `Bearer ${ownerAccessToken}`);
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
        let bookingToCancelFarDeadline: Booking;
        let bookingToCancelAfterDeadline: Booking;
        let bookingToCancelBeforeDeadline: Booking;
        let bookingWithNoDeadline: Booking;
        let bookingPendingConfirm: Booking;
        let bookingCancelledByAdmin: Booking;
        let bookingCompleted: Booking;
        let bookingNoShow: Booking;
        let bookingCancelledByUser: Booking;
        let bookingNotOwnedByClient: Booking;

        beforeEach(async () => {
            const now = new Date();
            const startTimeFar = new Date(now.getTime() + 48 * 60 * 60 * 1000);
            const startTimeNear30 = new Date(now.getTime() + 30 * 60 * 1000);
            const startTimeNear90 = new Date(now.getTime() + 90 * 60 * 1000);

            bookingToCancelFarDeadline = await createTestBooking(serviceId_auto_confirm_24h_deadline, clientUser.id, ownedEstablishment.id, startTimeFar.toISOString(), 60, BookingStatus.CONFIRMED);
            bookingToCancelAfterDeadline = await createTestBooking(serviceId_auto_confirm_60m_deadline, clientUser.id, ownedEstablishment.id, startTimeNear30.toISOString(), 60, BookingStatus.CONFIRMED);
            bookingToCancelBeforeDeadline = await createTestBooking(serviceId_auto_confirm_60m_deadline, clientUser.id, ownedEstablishment.id, startTimeNear90.toISOString(), 60, BookingStatus.CONFIRMED);
            bookingWithNoDeadline = await createTestBooking(serviceId_auto_confirm_no_deadline, clientUser.id, ownedEstablishment.id, startTimeNear30.toISOString(), 60, BookingStatus.CONFIRMED);
            bookingPendingConfirm = await createTestBooking(serviceId_manual_confirm, clientUser.id, ownedEstablishment.id, startTimeFar.toISOString(), 45, BookingStatus.PENDING_CONFIRMATION);
            bookingCancelledByAdmin = await createTestBooking(serviceId_auto_confirm_24h_deadline, clientUser.id, ownedEstablishment.id, startTimeFar.toISOString(), 60, BookingStatus.CANCELLED_BY_ADMIN);
            bookingCompleted = await createTestBooking(serviceId_auto_confirm_24h_deadline, clientUser.id, ownedEstablishment.id, startTimeFar.toISOString(), 60, BookingStatus.COMPLETED);
            bookingNoShow = await createTestBooking(serviceId_auto_confirm_24h_deadline, clientUser.id, ownedEstablishment.id, startTimeFar.toISOString(), 60, BookingStatus.NO_SHOW);
            bookingCancelledByUser = await createTestBooking(serviceId_auto_confirm_24h_deadline, clientUser.id, ownedEstablishment.id, startTimeFar.toISOString(), 60, BookingStatus.CANCELLED_BY_USER);
            bookingNotOwnedByClient = await createTestBooking(serviceId_auto_confirm_24h_deadline, ownerUser.id, ownedEstablishment.id, startTimeFar.toISOString(), 60, BookingStatus.CONFIRMED);
        });

        it('should cancel the CONFIRMED booking successfully if well before the deadline (24h deadline) (200)', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingToCancelFarDeadline.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CANCELLED_BY_USER);
            const dbBooking = await db.Booking.findByPk(bookingToCancelFarDeadline.id);
            expect(dbBooking?.status).toBe(BookingStatus.CANCELLED_BY_USER);
        });

        it('should return 403 if cancellation deadline has passed (60min deadline, 30min left)', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingToCancelAfterDeadline.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403);
            const dbBooking = await db.Booking.findByPk(bookingToCancelAfterDeadline.id);
            expect(dbBooking?.status).toBe(BookingStatus.CONFIRMED);
        });

        it('should cancel successfully if just before the deadline (60min deadline, 90min left)', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingToCancelBeforeDeadline.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CANCELLED_BY_USER);
        });

        it('should cancel successfully if service has no cancellation deadline (null)', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingWithNoDeadline.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CANCELLED_BY_USER);
        });

        it('should cancel successfully a PENDING_CONFIRMATION booking (well before deadline)', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingPendingConfirm.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CANCELLED_BY_USER);
            const dbBooking = await db.Booking.findByPk(bookingPendingConfirm.id);
            expect(dbBooking?.status).toBe(BookingStatus.CANCELLED_BY_USER);
        });

        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).patch(`/api/bookings/${bookingToCancelFarDeadline.id}/cancel`);
            expect(response.status).toBe(401);
        });

        it('should return 403 if user tries to cancel another user\'s booking', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingNotOwnedByClient.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403);
        });

        it('should return 400 if booking is already CANCELLED_BY_ADMIN', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingCancelledByAdmin.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot cancel a booking that is already/i);
        });

        it('should return 400 if booking is already COMPLETED', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingCompleted.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(400);
        });

        it('should return 400 if booking is already NO_SHOW', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingNoShow.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(400);
        });

        it('should return 400 if booking is already CANCELLED_BY_USER', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingCancelledByUser.id}/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(400);
        });

        it('should return 404 if booking ID does not exist', async () => {
            const response = await clientAgent.patch(`/api/bookings/99999/cancel`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour PATCH /api/bookings/:bookingId (MAJ Statut Admin)
    // =========================================================================
    describe('PATCH /api/bookings/:bookingId (Admin Status Update)', () => {
        let bookingPending: Booking;
        let bookingConfirmed: Booking;
        let bookingCompleted: Booking;
        let bookingCancelledByUser: Booking;
        let bookingCancelledByAdmin: Booking;
        let bookingNoShow: Booking;
        let bookingOtherAdminEstablishment: Booking;

        beforeEach(async () => {
            const futureDate = new Date(); futureDate.setUTCDate(futureDate.getUTCDate() + 2); futureDate.setUTCHours(10,0,0,0);
            const pastDate = new Date(); pastDate.setUTCDate(pastDate.getUTCDate() - 1); pastDate.setUTCHours(10,0,0,0);

            bookingPending = await createTestBooking(serviceId_manual_confirm, clientUser.id, ownedEstablishment.id, futureDate.toISOString(), 45, BookingStatus.PENDING_CONFIRMATION);
            bookingConfirmed = await createTestBooking(serviceId_auto_confirm_60m_deadline, clientUser.id, ownedEstablishment.id, pastDate.toISOString(), 60, BookingStatus.CONFIRMED);
            bookingCompleted = await createTestBooking(serviceId_auto_confirm_60m_deadline, clientUser.id, ownedEstablishment.id, pastDate.toISOString(), 60, BookingStatus.COMPLETED);
            bookingCancelledByUser = await createTestBooking(serviceId_auto_confirm_60m_deadline, clientUser.id, ownedEstablishment.id, futureDate.toISOString(), 60, BookingStatus.CANCELLED_BY_USER);
            bookingCancelledByAdmin = await createTestBooking(serviceId_auto_confirm_60m_deadline, clientUser.id, ownedEstablishment.id, futureDate.toISOString(), 60, BookingStatus.CANCELLED_BY_ADMIN);
            bookingNoShow = await createTestBooking(serviceId_auto_confirm_60m_deadline, clientUser.id, ownedEstablishment.id, pastDate.toISOString(), 60, BookingStatus.NO_SHOW);

            const otherSvc = await db.Service.create({ establishment_id: otherEstablishment.id, name: "Other Svc Admin", duration_minutes: 60, price: 50, currency: "EUR", is_active: true, auto_confirm_bookings: true });
            bookingOtherAdminEstablishment = await createTestBooking(otherSvc.id, clientUser.id, otherEstablishment.id, futureDate.toISOString(), 60);
        });

        // --- Valid Transitions ---
        it('should update status successfully by admin (PENDING_CONFIRMATION -> CONFIRMED) (200)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingPending.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CONFIRMED });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CONFIRMED);
        });

        it('should update status successfully by admin (PENDING_CONFIRMATION -> CANCELLED_BY_ESTABLISHMENT) (200)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingPending.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CANCELLED_BY_ESTABLISHMENT });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CANCELLED_BY_ESTABLISHMENT);
        });

        it('should update status successfully by admin (CONFIRMED -> COMPLETED) (200)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.COMPLETED);
        });
        it('should update status successfully by admin (CONFIRMED -> NO_SHOW) (200)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.NO_SHOW });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.NO_SHOW);
        });
        it('should update status successfully by admin (CONFIRMED -> CANCELLED_BY_ESTABLISHMENT) (200)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CANCELLED_BY_ESTABLISHMENT });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.CANCELLED_BY_ESTABLISHMENT);
        });

        it('should update status successfully by admin (NO_SHOW -> COMPLETED) (200)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingNoShow.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(BookingStatus.COMPLETED);
        });

        // --- Updating Notes ---
        it('should update establishment notes ONLY without changing status (200)', async () => {
            const initialStatus = bookingConfirmed.status;
            const notes = "Specific instruction for staff.";
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ establishmentNotes: notes });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(initialStatus);
            expect(response.body.establishment_notes).toBe(notes);
            const dbBooking = await db.Booking.findByPk(bookingConfirmed.id);
            expect(dbBooking?.establishment_notes).toBe(notes);
            expect(dbBooking?.status).toBe(initialStatus);
        });

        it('should update establishment notes when status is FINAL (e.g., COMPLETED) (200)', async () => {
            const initialStatus = bookingCompleted.status;
            const notes = "Post-service follow-up needed.";
            const response = await ownerAgent.patch(`/api/bookings/${bookingCompleted.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ establishmentNotes: notes });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(initialStatus);
            expect(response.body.establishment_notes).toBe(notes);
            const dbBooking = await db.Booking.findByPk(bookingCompleted.id);
            expect(dbBooking?.establishment_notes).toBe(notes);
            expect(dbBooking?.status).toBe(initialStatus);
        });

        it('should update establishment notes when status is FINAL (e.g., CANCELLED_BY_ADMIN) (200)', async () => {
            const initialStatus = bookingCancelledByAdmin.status;
            const notes = "Reason for admin cancellation documented.";
            const response = await ownerAgent.patch(`/api/bookings/${bookingCancelledByAdmin.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ establishmentNotes: notes });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(initialStatus);
            expect(response.body.establishment_notes).toBe(notes);
        });

        // --- Invalid Transitions / Final State Updates ---
        it('should return 400 if admin tries to update status of a booking already CANCELLED_BY_USER', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingCancelledByUser.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CONFIRMED });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot update status of a booking that is already CANCELLED_BY_USER/i);
            const dbBooking = await db.Booking.findByPk(bookingCancelledByUser.id);
            expect(dbBooking?.status).toBe(BookingStatus.CANCELLED_BY_USER);
        });

        it('should return 400 if admin tries to update status of a booking already CANCELLED_BY_ADMIN', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingCancelledByAdmin.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CONFIRMED });
            expect(response.status).toBe(400);
        });

        it('should return 400 if admin tries to update status of a booking already COMPLETED', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingCompleted.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CONFIRMED });
            expect(response.status).toBe(400);
        });

        it('should return 400 if admin tries to update status of a booking already NO_SHOW (except to COMPLETED)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingNoShow.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CONFIRMED });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot transition booking status from NO_SHOW to CONFIRMED/i);
        });

        it('should return 400 if admin tries invalid transition (CONFIRMED -> PENDING_CONFIRMATION)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.PENDING_CONFIRMATION });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot transition booking status from CONFIRMED to PENDING_CONFIRMATION/i);
        });

        it('should return 400 if admin tries invalid transition (CONFIRMED -> CANCELLED_BY_USER)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.CANCELLED_BY_USER });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot transition booking status from CONFIRMED to CANCELLED_BY_USER/i);
        });

        it('should return 400 if admin tries invalid transition (PENDING_CONFIRMATION -> NO_SHOW)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingPending.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.NO_SHOW });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot transition booking status from PENDING_CONFIRMATION to NO_SHOW/i);
        });

        // --- Permission / General Error Tests ---
        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).patch(`/api/bookings/${bookingConfirmed.id}`).send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(401);
        });

        it('should return 403 if user is not an establishment admin', async () => {
            const response = await clientAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${clientAccessToken}`).send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(403);
        });

        it('should return 403 if admin tries to update booking from another establishment', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingOtherAdminEstablishment.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(403);
        });

        it('should return 404 if booking ID does not exist', async () => {
            const response = await ownerAgent.patch(`/api/bookings/99999`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: BookingStatus.COMPLETED });
            expect(response.status).toBe(404);
        });

        it('should return 400 if provided status is invalid (Zod)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ status: 'INVALID_ENUM_VALUE' });
            expect(response.status).toBe(400);
        });

        it('should return 400 if payload is empty (no status or notes)', async () => {
            const response = await ownerAgent.patch(`/api/bookings/${bookingConfirmed.id}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({});
            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Validation failed"); // Assert current behavior
            // TODO: Improve global error handler to return specific Zod refine messages like "At least status or establishmentNotes must be provided for update."
        });
    });
});