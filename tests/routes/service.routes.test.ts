// tests/routes/service.routes.test.ts
import supertest from 'supertest';
import { app, server } from '../../src/server';
import db from '../../src/models';
import { UserAttributes } from '../../src/models/User';
import Establishment from '../../src/models/Establishment';
import Service from '../../src/models/Service';
import Role, { ROLES } from '../../src/models/Role';
import { CreateServiceDto, UpdateServiceDto } from '../../src/dtos/service.validation';
// *** CORRECTION 1: Supprimer AuthResult ***
import { generateTestUser, loginTestUser } from '../helpers/auth.helpers';
import Booking, { BookingStatus, PaymentStatus } from '../../src/models/Booking'; // Importer Booking et Enums

// --- Variables globales ---
let clientUser: UserAttributes;
let ownerUser: UserAttributes;
let otherOwnerUser: UserAttributes;

// Laisser TypeScript inférer le type des agents
let clientAgent: any;
let ownerAgent: any;
let otherOwnerAgent: any;

let clientAccessToken: string;
let ownerAccessToken: string;
let otherOwnerAccessToken: string;

let ownedEstablishment: Establishment;
let otherEstablishment: Establishment;
let unvalidatedEstablishment: Establishment;

let ownedServiceId: number;
let inactiveOwnedServiceId: number;
let otherServiceId: number;

const ESTABLISHMENT_ADMIN_ROLE_NAME = ROLES.ESTABLISHMENT_ADMIN;
const CLIENT_ROLE_NAME = ROLES.CLIENT;

// *** CORRECTION 3: Ajouter createTestBooking helper ***
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


describe('Service Routes Integration Tests', () => {

    // --- Setup Initial ---
    beforeAll(async () => {
        try {
            await db.sequelize.authenticate();
            console.log('Test Database connection authenticated for Service tests.');
            await db.Role.findOrCreate({ where: { name: CLIENT_ROLE_NAME }, defaults: { name: CLIENT_ROLE_NAME } });
            await db.Role.findOrCreate({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME }, defaults: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
            console.log('Required roles checked/created for Service tests.');
        } catch (error) {
            console.error('!!! SERVICE TEST DATABASE SETUP FAILED (beforeAll) !!!', error);
            throw error;
        }
    });

    // --- Nettoyage et Setup avant chaque test ---
    beforeEach(async () => {
        // Nettoyage ordonné
        await db.Booking.destroy({ where: {}, force: true });
        await db.AvailabilityOverride.destroy({ where: {} });
        await db.AvailabilityRule.destroy({ where: {} });
        await db.Service.destroy({ where: {} });
        await db.UserRole.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.RefreshToken.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        // Créer utilisateurs
        clientUser = await generateTestUser({ username: 'client_svc', email: 'client_svc@test.com', password: 'p' });
        ownerUser = await generateTestUser({ username: 'owner_svc', email: 'owner_svc@test.com', password: 'p' });
        otherOwnerUser = await generateTestUser({ username: 'other_owner_svc', email: 'other_svc@test.com', password: 'p' });

        // Assigner rôles
        const clientRole = await db.Role.findOne({ where: { name: CLIENT_ROLE_NAME } });
        const adminRole = await db.Role.findOne({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
        if (!clientRole || !adminRole) throw new Error("Roles not found.");

        const clientInst = await db.User.findByPk(clientUser.id);
        const ownerInst = await db.User.findByPk(ownerUser.id);
        const otherOwnerInst = await db.User.findByPk(otherOwnerUser.id);
        if (!clientInst || !ownerInst || !otherOwnerInst) throw new Error("User instances not found");

        await clientInst.addRole(clientRole);
        await ownerInst.addRole(clientRole); await ownerInst.addRole(adminRole);
        await otherOwnerInst.addRole(clientRole); await otherOwnerInst.addRole(adminRole);

        // Créer établissements
        ownedEstablishment = await db.Establishment.create({ name: "Owned Service Studio", siret: "11100011100011", siren: "111000111", owner_id: ownerUser.id, is_validated: true, address_line1: 'a', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
        otherEstablishment = await db.Establishment.create({ name: "Other Service Studio", siret: "22200022200022", siren: "222000222", owner_id: otherOwnerUser.id, is_validated: true, address_line1: 'b', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });
        unvalidatedEstablishment = await db.Establishment.create({ name: "Unvalidated Service Studio", siret: "33300033300033", siren: "333000333", owner_id: ownerUser.id, is_validated: false, address_line1: 'd', city: 'c', postal_code: 'p', country_name: 'France', country_code:'FR' });

        // Créer quelques services pour les tests PUT/DELETE/GET
        const svc1 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Base Owned Service", duration_minutes: 30, price: 25, currency: "EUR", is_active: true });
        const svc2 = await db.Service.create({ establishment_id: ownedEstablishment.id, name: "Inactive Owned Service", duration_minutes: 120, price: 90, currency: "EUR", is_active: false });
        const svc3 = await db.Service.create({ establishment_id: otherEstablishment.id, name: "Other Owner Service", duration_minutes: 45, price: 40, currency: "EUR", is_active: true });
        ownedServiceId = svc1.id;
        inactiveOwnedServiceId = svc2.id;
        otherServiceId = svc3.id;

        // Authentifier
        clientAgent = supertest.agent(app);
        ownerAgent = supertest.agent(app);
        otherOwnerAgent = supertest.agent(app);

        // Utiliser 'any' pour le résultat de loginTestUser
        let authResult: any;
        authResult = await loginTestUser(clientAgent, { email: clientUser.email, password: 'p' });
        clientAccessToken = authResult.accessToken;
        authResult = await loginTestUser(ownerAgent, { email: ownerUser.email, password: 'p' });
        ownerAccessToken = authResult.accessToken;
        authResult = await loginTestUser(otherOwnerAgent, { email: otherOwnerUser.email, password: 'p' });
        otherOwnerAccessToken = authResult.accessToken;
    });

    // --- Fermeture ---
    afterAll(async () => {
        await db.sequelize.close();
        if (server && server.close) server.close();
    });

    // =========================================================================
    // Tests pour POST /api/users/me/establishments/:establishmentId/services
    // =========================================================================
    describe('POST /api/users/me/establishments/:establishmentId/services (Admin Creation)', () => {
        // *** CORRECTION 2: Ajouter les champs optionnels ou retirer le type explicite ***
        // Option A: Ajouter les champs optionnels avec leur valeur par défaut ou null
        const validServiceData: CreateServiceDto = {
            name: "Standard Recording Session",
            description: "High-quality audio recording.",
            duration_minutes: 60,
            price: 50.00,
            currency: "EUR",
            capacity: 2,
            is_active: true, // Ajouté (même si défaut)
            is_promoted: false, // Ajouté (même si défaut)
            discount_price: null, // Ajouté
            discount_start_date: null, // Ajouté
            discount_end_date: null // Ajouté
        };
        // Option B (si préférée): Retirer le type ': CreateServiceDto'
        // const validServiceData = { ... };

        let routePrefix: string;
        beforeEach(() => {
            routePrefix = `/api/users/me/establishments/${ownedEstablishment.id}`;
        });

        it('should create a new service for the specified owned establishment (201)', async () => {
            const response = await ownerAgent
                .post(`${routePrefix}/services`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send(validServiceData);

            expect(response.status).toBe(201);
            expect(response.body.name).toBe(validServiceData.name);
            expect(response.body.establishment_id).toBe(ownedEstablishment.id);
            expect(response.body.is_active).toBe(true);

            const dbService = await db.Service.findOne({ where: { name: validServiceData.name, establishment_id: ownedEstablishment.id } });
            expect(dbService).not.toBeNull();
        });

        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app)
                .post(`${routePrefix}/services`)
                .send(validServiceData);
            expect(response.status).toBe(401);
        });

        it('should return 403 if user does not have ESTABLISHMENT_ADMIN role', async () => {
            const response = await clientAgent
                .post(`${routePrefix}/services`)
                .set('Authorization', `Bearer ${clientAccessToken}`)
                .send(validServiceData);
            expect(response.status).toBe(403);
        });

        it('should return 404 if user tries to create service for an establishment they dont own', async () => {
            const routeOther = `/api/users/me/establishments/${otherEstablishment.id}/services`;
            const response = await ownerAgent
                .post(routeOther)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send(validServiceData);
            expect(response.status).toBe(404); // Modifié de 403 à 404
        });

        it('should return 400 if request body is invalid (Zod)', async () => {
            const invalidData = { ...validServiceData, duration_minutes: -60 };
            const response = await ownerAgent
                .post(`${routePrefix}/services`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send(invalidData);
            expect(response.status).toBe(400);
        });

        it('should return 404 if establishment ID in path does not exist', async () => {
            const routeNonExistent = `/api/users/me/establishments/999999/services`;
            const response = await ownerAgent
                .post(routeNonExistent)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send(validServiceData);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour GET /api/users/me/establishments/:establishmentId/services
    // =========================================================================
    describe('GET /api/users/me/establishments/:establishmentId/services (Admin List)', () => {
        let routePrefix: string;
        beforeEach(() => { routePrefix = `/api/users/me/establishments/${ownedEstablishment.id}`; });

        it('should return services belonging to the specified owned establishment (200)', async () => {
            const response = await ownerAgent
                .get(`${routePrefix}/services?page=1&limit=10`)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(2);
            expect(response.body.pagination).toBeDefined();
        });
        it('should return an empty list if no services exist for the owned establishment (200)', async () => {
            await db.Service.destroy({ where: { establishment_id: ownedEstablishment.id } });
            const responseEmpty = await ownerAgent
                .get(`${routePrefix}/services?page=1&limit=10`)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(responseEmpty.status).toBe(200);
            expect(responseEmpty.body.data).toEqual([]);
        });
        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).get(`${routePrefix}/services?page=1&limit=10`);
            expect(response.status).toBe(401);
        });
        it('should return 403 if user does not have ESTABLISHMENT_ADMIN role', async () => {
            const response = await clientAgent
                .get(`${routePrefix}/services?page=1&limit=10`)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403);
        });
        it('should return 404 if user tries to list services for an establishment they dont own', async () => {
            const routeOther = `/api/users/me/establishments/${otherEstablishment.id}/services`;
            const response = await ownerAgent
                .get(routeOther)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });
        it('should return 404 if establishment ID in path does not exist', async () => {
            const routeNonExistent = `/api/users/me/establishments/999999/services`;
            const response = await ownerAgent
                .get(routeNonExistent)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour GET /api/users/me/establishments/:establishmentId/services/:serviceId (Admin Detail)
    // =========================================================================
    describe('GET /api/users/me/establishments/:establishmentId/services/:serviceId (Admin Detail)', () => {
        let routeGetOwnedService: string;
        let routeGetOtherService: string;
        let routeGetOwnedServiceInOtherEstab: string;

        beforeEach(() => {
            // Construire les URLs pour les tests
            routeGetOwnedService = `/api/users/me/establishments/${ownedEstablishment.id}/services/${ownedServiceId}`;
            routeGetOtherService = `/api/users/me/establishments/${otherEstablishment.id}/services/${otherServiceId}`;
            // Scénario où le service appartient à l'autre mais on utilise l'ID de l'établissement possédé
            routeGetOwnedServiceInOtherEstab = `/api/users/me/establishments/${ownedEstablishment.id}/services/${otherServiceId}`;
        });

        it('should return the specific owned service details (200)', async () => {
            const response = await ownerAgent
                .get(routeGetOwnedService)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(ownedServiceId);
            expect(response.body.establishment_id).toBe(ownedEstablishment.id);
            expect(response.body.name).toBe("Base Owned Service"); // Vérifier une donnée spécifique
        });

        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).get(routeGetOwnedService);
            expect(response.status).toBe(401);
        });

        it('should return 403 if user does not have ESTABLISHMENT_ADMIN role', async () => {
            // Le client essaie d'accéder à un service via la route admin
            const response = await clientAgent
                .get(routeGetOwnedService)
                .set('Authorization', `Bearer ${clientAccessToken}`);
            // Bloqué par le requireRole sur /api/users/me/establishments
            expect(response.status).toBe(403);
        });

        it('should return 404 if user tries to access service via an establishment they dont own', async () => {
            // Owner essaie d'accéder via otherEstablishment.id (même si otherServiceId existe)
            const response = await ownerAgent
                .get(routeGetOtherService) // Utilise otherEstablishment.id et otherServiceId
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            // Bloqué par ensureOwnsEstablishment sur l'ID de l'établissement
            expect(response.status).toBe(404);
        });

        it('should return 404 if the service ID does not belong to the specified owned establishment', async () => {
            // Owner essaie d'accéder à otherServiceId via son propre establishmentId
            const response = await ownerAgent
                .get(routeGetOwnedServiceInOtherEstab)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            // Le service getSpecificOwnedService ne trouvera pas de service correspondant aux deux IDs
            expect(response.status).toBe(404);
        });


        it('should return 404 if service ID does not exist (within an owned establishment context)', async () => {
            const routeNonExistentService = `/api/users/me/establishments/${ownedEstablishment.id}/services/999999`;
            const response = await ownerAgent
                .get(routeNonExistentService)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });

        it('should return 404 if establishment ID does not exist', async () => {
            const routeNonExistentEstab = `/api/users/me/establishments/999999/services/${ownedServiceId}`;
            const response = await ownerAgent
                .get(routeNonExistentEstab)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            // Bloqué par ensureOwnsEstablishment
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour GET /api/establishments/:id/services (Public)
    // =========================================================================
    describe('GET /api/establishments/:id/services (Public)', () => {
        it('should return only active services for a validated establishment (200)', async () => {
            const response = await supertest(app)
                .get(`/api/establishments/${ownedEstablishment.id}/services`);
            expect(response.status).toBe(200);
            expect(response.body.length).toBe(1);
            expect(response.body[0].id).toBe(ownedServiceId);
        });
        it('should return 404 if establishment ID does not exist', async () => {
            const response = await supertest(app).get(`/api/establishments/999999/services`);
            expect(response.status).toBe(404);
        });
        it('should return 404 if establishment exists but is not validated', async () => {
            const response = await supertest(app).get(`/api/establishments/${unvalidatedEstablishment.id}/services`);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour PUT /api/services/:serviceId (Admin Update)
    // =========================================================================
    describe('PUT /api/services/:serviceId (Admin Update)', () => {
        const updateData: Partial<UpdateServiceDto> = { name: "Updated Directly", is_active: false };

        it('should update the service successfully if user owns it (200)', async () => {
            const response = await ownerAgent
                .put(`/api/services/${ownedServiceId}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send(updateData);
            expect(response.status).toBe(200);
            expect(response.body.name).toBe(updateData.name);
        });
        it('should return 403 if user tries to update service from another establishment', async () => {
            const response = await ownerAgent
                .put(`/api/services/${otherServiceId}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`)
                .send(updateData);
            expect(response.status).toBe(403);
        });
        it('should return 401 if not authenticated', async () => {
            const response = await supertest(app).put(`/api/services/${ownedServiceId}`).send(updateData);
            expect(response.status).toBe(401);
        });
        it('should return 403 if user is not admin', async () => {
            const response = await clientAgent.put(`/api/services/${ownedServiceId}`).set('Authorization', `Bearer ${clientAccessToken}`).send(updateData);
            expect(response.status).toBe(403);
        });
        it('should return 404 if service ID does not exist', async () => {
            const response = await ownerAgent.put('/api/services/999999').set('Authorization', `Bearer ${ownerAccessToken}`).send(updateData);
            expect(response.status).toBe(404);
        });
        it('should return 400 if body is invalid', async () => {
            const response = await ownerAgent.put(`/api/services/${ownedServiceId}`).set('Authorization', `Bearer ${ownerAccessToken}`).send({ price: -10 });
            expect(response.status).toBe(400);
        });
    });

    // =========================================================================
    // Tests pour DELETE /api/services/:serviceId (Admin Delete)
    // =========================================================================
    describe('DELETE /api/services/:serviceId (Admin Delete)', () => {
        it('should delete the service successfully if user owns it and no future bookings (204)', async () => {
            const response = await ownerAgent
                .delete(`/api/services/${ownedServiceId}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(204);
            const dbService = await db.Service.findByPk(ownedServiceId);
            expect(dbService).toBeNull();
        });
        it('should return 403 if user tries to delete service from another establishment', async () => {
            const response = await ownerAgent
                .delete(`/api/services/${otherServiceId}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(403);
        });
        it('should return 409 if service has future bookings', async () => {
            const futureDate = new Date(); futureDate.setDate(futureDate.getDate() + 7);
            // Utilisation du helper createTestBooking corrigé
            await createTestBooking(ownedServiceId, clientUser.id, ownedEstablishment.id, futureDate.toISOString(), 30, BookingStatus.CONFIRMED);
            const response = await ownerAgent
                .delete(`/api/services/${ownedServiceId}`)
                .set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(409);
            expect(response.body.name).toBe('ServiceDeletionConflict');
        });
        it('should return 401 if not authenticated', async () => {
            const response = await supertest(app).delete(`/api/services/${ownedServiceId}`);
            expect(response.status).toBe(401);
        });
        it('should return 403 if user is not admin', async () => {
            const response = await clientAgent.delete(`/api/services/${ownedServiceId}`).set('Authorization', `Bearer ${clientAccessToken}`);
            expect(response.status).toBe(403);
        });
        it('should return 404 if service ID does not exist', async () => {
            const response = await ownerAgent.delete('/api/services/999999').set('Authorization', `Bearer ${ownerAccessToken}`);
            expect(response.status).toBe(404);
        });
    });

});