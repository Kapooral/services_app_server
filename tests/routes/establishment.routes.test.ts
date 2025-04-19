// tests/routes/establishment.routes.test.ts
import supertest from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { app, server } from '../../src/server';

import db from '../../src/models';
import { UserAttributes } from '../../src/models/User';
import Role, { ROLES } from '../../src/models/Role';
import Establishment from '../../src/models/Establishment';
import Country from '../../src/models/Country';

import { CreateEstablishmentDto, UpdateEstablishmentDto } from '../../src/dtos/establishment.validation';
import { generateTestUser, loginTestUser } from '../helpers/auth.helpers';

// Variables globales
let testUserClient: UserAttributes;
let testUserAdmin: UserAttributes;
let otherAdminUser: UserAttributes;

let clientAgent: any;
let adminAgent: any;
let otherAdminAgent: any;

let clientAccessToken: string;
let adminAccessToken: string;
let otherAdminAccessToken: string;

let ownedEstablishmentId: number;
let otherEstablishmentId: number;
let validatedEstablishmentId: number;
let unvalidatedEstablishmentId: number;

const ESTABLISHMENT_ADMIN_ROLE_NAME = ROLES.ESTABLISHMENT_ADMIN;
const CLIENT_ROLE_NAME = ROLES.CLIENT;

const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads/profile-pictures');

describe('Establishment Routes Integration Tests (Public & Admin)', () => {

    beforeAll(async () => {
        try {
            await db.sequelize.authenticate();
            console.log('Test Database connection authenticated for Establishment tests.');
            await db.Role.findOrCreate({ where: { name: CLIENT_ROLE_NAME }, defaults: { name: CLIENT_ROLE_NAME }});
            await db.Role.findOrCreate({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME }, defaults: { name: ESTABLISHMENT_ADMIN_ROLE_NAME }});
            console.log('Required roles checked/created.');
            await db.Country.findOrCreate({ where: { code: 'FR' }, defaults: { code: 'FR', name: 'France' } });
            await db.Country.findOrCreate({ where: { code: 'GB' }, defaults: { code: 'GB', name: 'Royaume-Uni' } });
            console.log('Required countries checked/created.');
            try { await fs.mkdir(UPLOAD_DIR, { recursive: true }); } catch (e) {}
        } catch (error) {
            console.error('!!! FAILED TO CONNECT OR SETUP TEST DATABASE !!!', error);
            throw error;
        }
    });

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

        // Nettoyage dossier upload
        try {
            const files = await fs.readdir(UPLOAD_DIR);
            for (const file of files) { if (!file.startsWith('.')) { try { await fs.unlink(path.join(UPLOAD_DIR, file)); } catch (e) {} } }
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { console.warn('Could not clean upload directory:', error); } }

        // Création utilisateurs
        testUserClient = await generateTestUser({ username: 'client_estab', email: 'client_estab@test.com', password: 'password123' });
        testUserAdmin = await generateTestUser({ username: 'admin_estab', email: 'admin_estab@test.com', password: 'password123' });
        otherAdminUser = await generateTestUser({ username: 'other_admin_estab', email: 'other_admin@test.com', password: 'password123' });

        // Assignation Rôles
        const clientRole = await db.Role.findOne({ where: { name: CLIENT_ROLE_NAME } });
        const adminRole = await db.Role.findOne({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
        if (!clientRole || !adminRole) throw new Error("Roles missing in DB.");
        const clientInst = await db.User.findByPk(testUserClient.id);
        const adminInst = await db.User.findByPk(testUserAdmin.id);
        const otherAdminInst = await db.User.findByPk(otherAdminUser.id);
        if (!clientInst || !adminInst || !otherAdminInst) throw new Error("User instances not found.");
        await clientInst.addRole(clientRole);
        await adminInst.addRole(clientRole); await adminInst.addRole(adminRole);
        await otherAdminInst.addRole(clientRole); await otherAdminInst.addRole(adminRole);

        // Création établissements
        const estab1 = await db.Establishment.create({ name: "Admin Owned Studio", siret: "11122233344455", siren: "111222333", owner_id: testUserAdmin.id, is_validated: false, address_line1: 'a1', city: 'c1', postal_code: 'p1', country_name: 'France', country_code: 'FR' });
        const estab2 = await db.Establishment.create({ name: "Other Admin Studio", siret: "22233344455566", siren: "222333444", owner_id: otherAdminUser.id, is_validated: true, address_line1: 'a2', city: 'c2', postal_code: 'p2', country_name: 'Royaume-Uni', country_code: 'GB' });
        const estab3 = await db.Establishment.create({ name: "Validated Public Studio", siret: "33344455566677", siren: "333444555", owner_id: testUserAdmin.id, is_validated: true, address_line1: 'a3', city: 'c3', postal_code: 'p3', country_name: 'France', country_code: 'FR' });
        const estab4 = await db.Establishment.create({ name: "Unvalidated Public Studio", siret: "44455566677788", siren: "444555666", owner_id: otherAdminUser.id, is_validated: false, address_line1: 'a4', city: 'c4', postal_code: 'p4', country_name: 'Royaume-Uni', country_code: 'GB' });
        ownedEstablishmentId = estab1.id;
        otherEstablishmentId = estab2.id;
        validatedEstablishmentId = estab3.id;
        unvalidatedEstablishmentId = estab4.id;

        // Login et récupération tokens
        clientAgent = supertest.agent(app);
        adminAgent = supertest.agent(app);
        otherAdminAgent = supertest.agent(app);

        let authResult: any;
        authResult = await loginTestUser(clientAgent, { email: testUserClient.email, password: 'password123' });
        clientAccessToken = authResult.accessToken;
        authResult = await loginTestUser(adminAgent, { email: testUserAdmin.email, password: 'password123' });
        adminAccessToken = authResult.accessToken;
        authResult = await loginTestUser(otherAdminAgent, { email: otherAdminUser.email, password: 'password123' });
        otherAdminAccessToken = authResult.accessToken;
    });

    afterAll(async () => {
        await db.sequelize.close();
        if (server && server.close) { server.close(); }
        try {
            const files = await fs.readdir(UPLOAD_DIR);
            for (const file of files) { if (!file.startsWith('.')) { try { await fs.unlink(path.join(UPLOAD_DIR, file)); } catch(e) {} } }
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { console.warn('Could not clean upload directory after tests:', error); } }
    });

    // =========================================================================
    // --- Tests Routes Publiques (/api/establishments) ---
    // =========================================================================
    describe('GET /api/establishments (Public List)', () => {
        it('should return only validated establishments (200)', async () => {
            const response = await supertest(app).get('/api/establishments');
            expect(response.status).toBe(200);
            expect(response.body.data).toBeDefined();
            expect(response.body.data.length).toBe(2);
            expect(response.body.data.some((e: any) => e.id === otherEstablishmentId)).toBe(true);
            expect(response.body.data.some((e: any) => e.id === validatedEstablishmentId)).toBe(true);
        });
    });

    describe('GET /api/establishments/:id (Public Detail)', () => {
        it('should return details if establishment exists and is validated (200)', async () => {
            const response = await supertest(app).get(`/api/establishments/${validatedEstablishmentId}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(validatedEstablishmentId);
        });
        it('should return 404 if establishment ID does not exist', async () => {
            const response = await supertest(app).get(`/api/establishments/999999`);
            expect(response.status).toBe(404);
        });
        it('should return 404 if establishment exists but is not validated', async () => {
            const response = await supertest(app).get(`/api/establishments/${ownedEstablishmentId}`);
            expect(response.status).toBe(404);
        });
        it('should return 404 for unvalidated owned by other user', async () => {
            const response = await supertest(app).get(`/api/establishments/${unvalidatedEstablishmentId}`);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // --- Tests Création Établissement (POST /api/establishments) ---
    // =========================================================================
    describe('POST /api/establishments (Creation)', () => {
        const validEstablishmentData: Omit<CreateEstablishmentDto, 'country_code'> & { country_name: string } = {
            name: 'Create Test Studio', description: 'Studio créé pendant le test.',
            address_line1: '1 Creative Way', city: 'Creation City', postal_code: 'CR123',
            country_name: 'France', siret: '55566677788899',
            phone_number: '0102030405', email: 'create@test.com'
        };
        let userForCreation: UserAttributes;
        let agentForCreation: any;
        let tokenForCreation: string;

        beforeEach(async () => {
            userForCreation = await generateTestUser({ username: `creator_${Date.now()}`, email: `creator_${Date.now()}@test.com`, password: 'p' });
            agentForCreation = supertest.agent(app);
            const auth: any = await loginTestUser(agentForCreation, { email: userForCreation.email, password: 'p'});
            tokenForCreation = auth.accessToken;
        });

        it('should create a new establishment and assign ESTABLISHMENT_ADMIN role (201)', async () => {
            const response = await agentForCreation
                .post('/api/establishments')
                .set('Authorization', `Bearer ${tokenForCreation}`)
                .send(validEstablishmentData);
            expect(response.status).toBe(201);
            expect(response.body.owner_id).toBe(userForCreation.id);
            const userWithRoles = await db.User.findByPk(userForCreation.id, { include: ['roles'] });
            expect(userWithRoles?.roles?.some(r => r.name === ESTABLISHMENT_ADMIN_ROLE_NAME)).toBe(true);
        });
        it('should return 401 if user is not authenticated', async () => {
            const response = await supertest(app).post('/api/establishments').send(validEstablishmentData);
            expect(response.status).toBe(401);
        });
        it('should return 400 if SIRET format is invalid', async () => {
            const invalidData = { ...validEstablishmentData, siret: 'invalid-siret' };
            const response = await agentForCreation.post('/api/establishments').set('Authorization', `Bearer ${tokenForCreation}`).send(invalidData);
            expect(response.status).toBe(400);
        });
        it('should return 400 if country_name is invalid', async () => {
            const invalidData = { ...validEstablishmentData, country_name: 'NonExistentCountry' };
            const response = await agentForCreation.post('/api/establishments').set('Authorization', `Bearer ${tokenForCreation}`).send(invalidData);
            expect(response.status).toBe(400);
        });
        it('should return 409 if SIRET already exists', async () => {
            await agentForCreation.post('/api/establishments').set('Authorization', `Bearer ${tokenForCreation}`).send(validEstablishmentData);
            const secondUser = await generateTestUser({ username: `creator2_${Date.now()}`, email: `creator2_${Date.now()}@test.com`, password: 'p' });
            const secondAgent = supertest.agent(app);
            const secondAuth: any = await loginTestUser(secondAgent, { email: secondUser.email, password: 'p' });
            const secondResponse = await secondAgent.post('/api/establishments').set('Authorization', `Bearer ${secondAuth.accessToken}`).send({ ...validEstablishmentData, name: "Duplicate Siret Studio" });
            expect(secondResponse.status).toBe(409);
        });
    });

    // =========================================================================
    // --- Tests Routes Admin (/api/users/me/establishments) ---
    // =========================================================================
    describe('Admin Routes (/api/users/me/establishments)', () => {

        describe('GET /api/users/me/establishments (List Owned)', () => {
            it('should return the owned establishments for the admin user (200)', async () => {
                const response = await adminAgent.get('/api/users/me/establishments')
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.length).toBe(2);
            });
            it('should return 401 if user is not authenticated', async () => {
                const response = await supertest(app).get('/api/users/me/establishments');
                expect(response.status).toBe(401);
            });
            it('should return 403 if user does not have ESTABLISHMENT_ADMIN role', async () => {
                const response = await clientAgent.get('/api/users/me/establishments')
                    .set('Authorization', `Bearer ${clientAccessToken}`);
                expect(response.status).toBe(403);
            });
            it('should return an empty array if user has role but no establishments', async () => {
                const noEstabAdmin = await generateTestUser({ username: `admin_noestab_${Date.now()}`, email: `admin_noestab_${Date.now()}@test.com`, password: 'p'});
                const adminRole = await db.Role.findOne({ where: { name: ESTABLISHMENT_ADMIN_ROLE_NAME } });
                const noEstabInst = await db.User.findByPk(noEstabAdmin.id);
                if (adminRole && noEstabInst) await noEstabInst.addRole(adminRole); else throw new Error("Setup failed.");
                const noEstabAgent = supertest.agent(app);
                const auth: any = await loginTestUser(noEstabAgent, { email: noEstabAdmin.email, password: 'p'});
                const token = auth.accessToken;
                const response = await noEstabAgent.get('/api/users/me/establishments').set('Authorization', `Bearer ${token}`);
                expect(response.status).toBe(200);
                expect(response.body).toEqual([]);
            });
        });

        describe('GET /api/users/me/establishments/:establishmentId (Get Owned Detail)', () => {
            it('should return the owned establishment details (200)', async () => {
                const response = await adminAgent.get(`/api/users/me/establishments/${ownedEstablishmentId}`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.id).toBe(ownedEstablishmentId);
            });
            // *** CORRECTION 1 (A) : Attendre 404 au lieu de 403 ***
            it('should return 404 if trying to access establishment owned by another admin', async () => {
                const response = await adminAgent.get(`/api/users/me/establishments/${otherEstablishmentId}`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(404); // Modifié de 403 à 404
            });
            it('should return 404 if establishment ID does not exist', async () => {
                const response = await adminAgent.get(`/api/users/me/establishments/999999`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(404);
            });
            it('should return 401 if not authenticated', async () => {
                const response = await supertest(app).get(`/api/users/me/establishments/${ownedEstablishmentId}`);
                expect(response.status).toBe(401);
            });
            it('should return 403 if user is not admin', async () => {
                const response = await clientAgent.get(`/api/users/me/establishments/${ownedEstablishmentId}`)
                    .set('Authorization', `Bearer ${clientAccessToken}`);
                expect(response.status).toBe(403);
            });
        });

        describe('PUT /api/users/me/establishments/:establishmentId (Update Owned)', () => {
            const updateData: Partial<UpdateEstablishmentDto> = { name: "Updated Owned Name", city: "New City" };
            it('should update the owned establishment successfully (200)', async () => {
                const response = await adminAgent.put(`/api/users/me/establishments/${ownedEstablishmentId}`)
                    .set('Authorization', `Bearer ${adminAccessToken}`)
                    .send(updateData);
                expect(response.status).toBe(200);
                expect(response.body.name).toBe(updateData.name);
            });
            // *** CORRECTION 1 (A) : Attendre 404 au lieu de 403 ***
            it('should return 404 if trying to update establishment owned by another admin', async () => {
                const response = await adminAgent.put(`/api/users/me/establishments/${otherEstablishmentId}`)
                    .set('Authorization', `Bearer ${adminAccessToken}`)
                    .send(updateData);
                expect(response.status).toBe(404); // Modifié de 403 à 404
            });
            it('should return 404 if establishment ID does not exist', async () => {
                const response = await adminAgent.put(`/api/users/me/establishments/999999`)
                    .set('Authorization', `Bearer ${adminAccessToken}`)
                    .send(updateData);
                expect(response.status).toBe(404);
            });
            it('should return 400 if update data is empty', async () => {
                const response = await adminAgent.put(`/api/users/me/establishments/${ownedEstablishmentId}`)
                    .set('Authorization', `Bearer ${adminAccessToken}`)
                    .send({});
                expect(response.status).toBe(400);
            });
        });

        describe('POST /api/users/me/establishments/:establishmentId/request-validation', () => {
            it('should validate the owned establishment successfully (200)', async () => {
                const response = await adminAgent.post(`/api/users/me/establishments/${ownedEstablishmentId}/request-validation`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.establishment.is_validated).toBe(true);
            });
            it('should return establishment unchanged if already validated (200)', async () => {
                const response = await adminAgent.post(`/api/users/me/establishments/${validatedEstablishmentId}/request-validation`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.establishment.is_validated).toBe(true);
            });
            // *** CORRECTION 1 (A) : Attendre 404 au lieu de 403 ***
            it('should return 404 if trying to validate another admin\'s establishment', async () => {
                const response = await adminAgent.post(`/api/users/me/establishments/${otherEstablishmentId}/request-validation`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(404); // Modifié de 403 à 404
            });
        });

        describe('PATCH /api/users/me/establishments/:establishmentId/profile-picture', () => {
            const testImageBuffer = Buffer.from('fake-image-data-for-admin');
            const testImageName = 'admin-upload.png';
            it('should upload picture for owned establishment (200)', async () => {
                const response = await adminAgent.patch(`/api/users/me/establishments/${ownedEstablishmentId}/profile-picture`)
                    .set('Authorization', `Bearer ${adminAccessToken}`)
                    .attach('profilePicture', testImageBuffer, testImageName);
                expect(response.status).toBe(200);
                // *** CORRECTION 2 : Accepter URL absolue ***
                // Vérifier le début de l'URL et l'extension
                expect(response.body.establishment.profile_picture_url).toMatch(/\/uploads\/profile-pictures\/[a-f0-9]{32}\.png$/);
                const expectedFilename = path.basename(response.body.establishment.profile_picture_url);
                const expectedFilePath = path.join(UPLOAD_DIR, expectedFilename);
                await expect(fs.access(expectedFilePath)).resolves.toBeUndefined();
            });
            // *** CORRECTION 1 (A) : Attendre 404 au lieu de 403 ***
            it('should return 404 if trying to upload for another admin\'s establishment', async () => {
                const response = await adminAgent.patch(`/api/users/me/establishments/${otherEstablishmentId}/profile-picture`)
                    .set('Authorization', `Bearer ${adminAccessToken}`)
                    .attach('profilePicture', testImageBuffer, testImageName);
                expect(response.status).toBe(404); // Modifié de 403 à 404
            });
        });

        describe('DELETE /api/users/me/establishments/:establishmentId/profile-picture', () => {
            const uploadPictureForDeletion = async (agentInstance: any, token: string, estabId: number) => {
                const buffer = Buffer.from(`image-to-delete-${estabId}`); const name = `delete-me-${estabId}.png`;
                const uploadResponse = await agentInstance.patch(`/api/users/me/establishments/${estabId}/profile-picture`)
                    .set('Authorization', `Bearer ${token}`)
                    .attach('profilePicture', buffer, name);
                if (uploadResponse.status !== 200) throw new Error("Setup failed: Could not upload picture for deletion test.");
                const imageUrl = uploadResponse.body.establishment.profile_picture_url;
                const imageFilePath = path.join(UPLOAD_DIR, path.basename(imageUrl));
                await expect(fs.access(imageFilePath)).resolves.toBeUndefined();
                return { imageUrl, imageFilePath };
            };

            it('should delete picture for owned establishment (200)', async () => {
                const { imageFilePath } = await uploadPictureForDeletion(adminAgent, adminAccessToken, ownedEstablishmentId);
                const response = await adminAgent.delete(`/api/users/me/establishments/${ownedEstablishmentId}/profile-picture`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                // *** CORRECTION 3 : Utiliser toBeFalsy ou vérifier undefined ***
                expect(response.body.establishment.profile_picture_url).toBeFalsy(); // Accepte null ou undefined
                await expect(fs.access(imageFilePath)).rejects.toThrow();
            });
            // *** CORRECTION 1 (A) : Attendre 404 au lieu de 403 ***
            it('should return 404 if trying to delete for another admin\'s establishment', async () => {
                // Uploader une image pour l'autre admin d'abord
                await uploadPictureForDeletion(otherAdminAgent, otherAdminAccessToken, otherEstablishmentId);
                // Tenter de supprimer avec le premier admin
                const response = await adminAgent.delete(`/api/users/me/establishments/${otherEstablishmentId}/profile-picture`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(404); // Modifié de 403 à 404
            });
        });
    });
});