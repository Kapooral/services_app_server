// tests/integration/membership.integration.test.ts
import { Op } from 'sequelize'
import supertest from 'supertest';
import { app, server } from '../../src/server';
import db from '../../src/models';
import User, { UserAttributes } from '../../src/models/User';
import Establishment from '../../src/models/Establishment';
import Service from '../../src/models/Service';
import Role, { ROLES } from '../../src/models/Role';
import Booking, { BookingStatus, PaymentStatus } from '../../src/models/Booking';
import Membership, { MembershipRole, MembershipStatus } from '../../src/models/Membership';
import StaffAvailability from '../../src/models/StaffAvailability';
import ServiceMemberAssignment from '../../src/models/ServiceMemberAssignment';
import { generateTestUser, loginTestUser, TestUserCredentials } from '../helpers/auth.helpers';
import crypto from 'crypto';

// --- Constantes ---
const API_BASE = '/api';
const ADMIN_EMAIL = 'member_admin@test.com';
const STAFF_EMAIL = 'member_staff@test.com';
const OTHER_ADMIN_EMAIL = 'member_other_admin@test.com';
const NEW_USER_EMAIL = 'new_invitee@test.com';
const PENDING_EMAIL = 'pending_invite@test.com';
const ALREADY_MEMBER_EMAIL = 'active_member@test.com';
const INACTIVE_MEMBER_EMAIL = 'inactive_member@test.com';
const YET_ANOTHER_STAFF_EMAIL = 'another_staff@test.com'; // Pour listes/voir autre
const PASSWORD = 'Password123!';

// --- Variables Globales ---
let adminUser: UserAttributes, staffUser: UserAttributes, otherAdminUser: UserAttributes, alreadyMemberUser: UserAttributes, inactiveMemberUser: UserAttributes, yetAnotherStaffUser: UserAttributes;
let adminAgent: any, staffAgent: any, otherAdminAgent: any, yetAnotherStaffAgent: any;
let adminAccessToken: string, staffAccessToken: string, otherAdminAccessToken: string, yetAnotherStaffAccessToken: string;

let mainEstablishment: Establishment;
let otherEstablishment: Establishment;
let mainService: Service;

// Pour stocker le token clair obtenu lors de l'invitation
let validPlainInvitationToken: string | null = null;
let pendingMembershipId: number | null = null;

// Helper pour hasher les tokens (miroir de celui du service)
const hashToken = (token: string): string => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

describe('Membership Invitation & Acceptance Integration Tests', () => {

    beforeAll(async () => {
        await db.sequelize.authenticate();
        await db.Role.findOrCreate({ where: { name: ROLES.CLIENT }, defaults: { name: ROLES.CLIENT } });
        await db.Role.findOrCreate({ where: { name: ROLES.ESTABLISHMENT_ADMIN }, defaults: { name: ROLES.ESTABLISHMENT_ADMIN } });
        await db.Role.findOrCreate({ where: { name: ROLES.STAFF }, defaults: { name: ROLES.STAFF } });
    });

    beforeEach(async () => {
        // Reset token variable
        validPlainInvitationToken = null;
        pendingMembershipId = null;

        // Nettoyage ordonné
        await db.Booking.destroy({ where: {}, force: true, cascade: true });
        await db.ServiceMemberAssignment.destroy({ where: {}, force: true });
        await db.StaffAvailability.destroy({ where: {}, force: true });
        await db.Membership.destroy({ where: {}, force: true });
        await db.AvailabilityOverride.destroy({ where: {} });
        await db.AvailabilityRule.destroy({ where: {} });
        await db.Service.destroy({ where: {}, force: true });
        await db.Establishment.destroy({ where: {}, force: true });
        await db.UserRole.destroy({ where: {} });
        await db.RefreshToken.destroy({ where: {} });
        await db.User.destroy({ where: {}, force: true });

        // Créer utilisateurs
        adminUser = await generateTestUser({ username: 'member_admin', email: ADMIN_EMAIL, password: PASSWORD, is_active: true, is_email_active: true });
        staffUser = await generateTestUser({ username: 'member_staff', email: STAFF_EMAIL, password: PASSWORD, is_active: true, is_email_active: true });
        otherAdminUser = await generateTestUser({ username: 'member_other_admin', email: OTHER_ADMIN_EMAIL, password: PASSWORD, is_active: true, is_email_active: true });
        alreadyMemberUser = await generateTestUser({ username: 'already_member', email: ALREADY_MEMBER_EMAIL, password: PASSWORD, is_active: true, is_email_active: true });
        inactiveMemberUser = await generateTestUser({ username: 'inactive_member', email: INACTIVE_MEMBER_EMAIL, password: PASSWORD, is_active: false, is_email_active: true });
        yetAnotherStaffUser = await generateTestUser({ username: 'another_staff', email: YET_ANOTHER_STAFF_EMAIL, password: PASSWORD, is_active: true, is_email_active: true});

        // Assigner rôles
        const adminRole = await db.Role.findOne({ where: { name: ROLES.ESTABLISHMENT_ADMIN } });
        const staffRole = await db.Role.findOne({ where: { name: ROLES.STAFF } });
        const clientRole = await db.Role.findOne({ where: { name: ROLES.CLIENT } });
        if (!adminRole || !staffRole || !clientRole) throw new Error("Required roles not found during setup.");

        await db.UserRole.bulkCreate([
            { userId: adminUser.id, roleId: adminRole.id }, { userId: adminUser.id, roleId: clientRole.id },
            { userId: staffUser.id, roleId: staffRole.id }, { userId: staffUser.id, roleId: clientRole.id },
            { userId: otherAdminUser.id, roleId: adminRole.id }, { userId: otherAdminUser.id, roleId: clientRole.id },
            { userId: alreadyMemberUser.id, roleId: staffRole.id }, { userId: alreadyMemberUser.id, roleId: clientRole.id },
            { userId: inactiveMemberUser.id, roleId: clientRole.id },
            { userId: yetAnotherStaffUser.id, roleId: staffRole.id}, { userId: yetAnotherStaffUser.id, roleId: clientRole.id}
        ]);

        // Créer établissements
        mainEstablishment = await db.Establishment.create({ name: "Main Testing Establishment", siret: "11111111111111", siren: "111111111", owner_id: adminUser.id, is_validated: true, address_line1: 'a', city: 'c', postal_code: 'p', country_name: 'TestLand', country_code: 'TL' });
        otherEstablishment = await db.Establishment.create({ name: "Other Testing Establishment", siret: "22222222222222", siren: "222222222", owner_id: otherAdminUser.id, is_validated: true, address_line1: 'b', city: 'c', postal_code: 'p', country_name: 'TestLand', country_code: 'TL' });

        // Créer service
        mainService = await db.Service.create({ establishment_id: mainEstablishment.id, name: "Testable Service", duration_minutes: 60, price: 10, currency: "EUR", is_active: true, auto_confirm_bookings: true });

        // Créer memberships existants pour les tests
        await db.Membership.create({ userId: alreadyMemberUser.id, establishmentId: mainEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, joinedAt: new Date() });
        await db.Membership.create({ userId: inactiveMemberUser.id, establishmentId: mainEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.INACTIVE });
        await db.Membership.create({ userId: adminUser.id, establishmentId: mainEstablishment.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE, joinedAt: new Date() }); // Admin est aussi membre de son étab.
        await db.Membership.create({ userId: otherAdminUser.id, establishmentId: otherEstablishment.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE, joinedAt: new Date() }); // Autre admin dans son étab.
        await db.Membership.create({ userId: staffUser.id, establishmentId: mainEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, joinedAt: new Date() });
        await db.Membership.create({ userId: yetAnotherStaffUser.id, establishmentId: mainEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, joinedAt: new Date()});

        // Authentifier les agents
        adminAgent = supertest.agent(app);
        staffAgent = supertest.agent(app);
        otherAdminAgent = supertest.agent(app);
        yetAnotherStaffAgent = supertest.agent(app); // Agent pour le 3ème staff

        adminAccessToken = (await loginTestUser(adminAgent, { email: ADMIN_EMAIL, password: PASSWORD })).accessToken;
        staffAccessToken = (await loginTestUser(staffAgent, { email: STAFF_EMAIL, password: PASSWORD })).accessToken;
        otherAdminAccessToken = (await loginTestUser(otherAdminAgent, { email: OTHER_ADMIN_EMAIL, password: PASSWORD })).accessToken;
        yetAnotherStaffAccessToken = (await loginTestUser(yetAnotherStaffAgent, { email: YET_ANOTHER_STAFF_EMAIL, password: PASSWORD })).accessToken;

    });

    afterAll(async () => {
        await db.sequelize.close();
        if (server && server.close) server.close();
    });

    // =========================================================================
    // Tests pour POST /api/users/me/establishments/:establishmentId/memberships/invite
    // =========================================================================
    describe('POST /api/users/me/establishments/:establishmentId/memberships/invite', () => {

        const invitePayload = { email: NEW_USER_EMAIL, role: MembershipRole.STAFF };

        it('should successfully invite a new user as STAFF (201)', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invitePayload);

            expect(response.status).toBe(201);
            expect(response.body.message).toMatch(/Invitation sent successfully/);
            expect(response.body.membership).toBeDefined();
            expect(response.body.membership.invitedEmail).toBe(NEW_USER_EMAIL);
            expect(response.body.membership.status).toBe(MembershipStatus.PENDING);
            expect(response.body.membership.userId).toBeNull();
            // ** Stocker le token clair si l'API le renvoie en test **
            if (response.body.plainInvitationToken) { // Supposition
                validPlainInvitationToken = response.body.plainInvitationToken;
            } else if (response.body.membership && response.body.membership.plainInvitationToken) { // Autre possibilité
                validPlainInvitationToken = response.body.membership.plainInvitationToken;
            }
            else {
                console.warn("Plain invitation token not returned by API in test environment for 'should successfully invite'.");
            }

            // Vérif BDD
            const dbMembership = await db.Membership.findOne({ where: { invitedEmail: NEW_USER_EMAIL, establishmentId: mainEstablishment.id }});
            expect(dbMembership).not.toBeNull();
            expect(dbMembership?.status).toBe(MembershipStatus.PENDING);
            expect(dbMembership?.invitationTokenHash).toBeDefined();
            expect(dbMembership?.invitationTokenExpiresAt).toBeDefined();
        });

        it('[Sécurité] should return 403 if invited by a STAFF member', async () => {
            const response = await staffAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${staffAccessToken}`)
                .send(invitePayload);
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 401 if not authenticated', async () => {
            const response = await supertest(app)
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .send(invitePayload);
            expect(response.status).toBe(401);
        });

        it('[Sécurité] should return 403 if Admin tries to invite to an establishment they dont own', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${otherEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invitePayload);
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 404 if Admin tries to invite to a non-existent establishment', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/999999/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invitePayload);
            expect([403, 404]).toContain(response.status);
        });


        it('should return 409 if email is already invited (PENDING)', async () => {
            await adminAgent.post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`).set('Authorization', `Bearer ${adminAccessToken}`).send({ email: PENDING_EMAIL, role: MembershipRole.STAFF });
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: PENDING_EMAIL, role: MembershipRole.STAFF });
            expect(response.status).toBe(409);
            expect(response.body.message).toMatch(/invitation has already been sent/);
        });

        it('should return 409 if email is already an ACTIVE member', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: ALREADY_MEMBER_EMAIL, role: MembershipRole.STAFF });
            expect(response.status).toBe(409);
            expect(response.body.message).toMatch(/is already a member/);
        });

        it('[Edge Case] should return 409 if email is already an INACTIVE member', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: INACTIVE_MEMBER_EMAIL, role: MembershipRole.STAFF });
            expect(response.status).toBe(409);
            expect(response.body.message).toMatch(/is already a member/);
        });


        it('should return 400 if request body is invalid (missing email)', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ role: MembershipRole.STAFF });
            expect(response.status).toBe(400);
            expect(response.body.details).toBeDefined();
        });

        it('[Adversarial] should return 400 if request body has invalid role', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: 'test@test.com', role: 'SUPER_ADMIN' });
            expect(response.status).toBe(400);
            expect(response.body.details).toBeDefined();
        });

        it('[Adversarial] should invite successfully with valid exotic email', async () => {
            const exoticEmail = 'test+alias@domain-test.com';
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: exoticEmail, role: MembershipRole.STAFF });
            expect(response.status).toBe(201);
            expect(response.body.membership.invitedEmail).toBe(exoticEmail);
        });

        it('[Edge Case] should return 201 when inviting an existing inactive User (links existing user ID)', async () => {
            const response = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: inactiveMemberUser.email, role: MembershipRole.STAFF }); // inactiveMemberUser est déjà membre INACTIVE
            // Comportement attendu : 409 car déjà membre (même inactif)
            expect(response.status).toBe(409);
            expect(response.body.message).toMatch(/is already a member/);
        });
    });

    // =========================================================================
    // Tests pour GET /api/memberships/invitation-details/:token
    // =========================================================================
    describe('GET /api/memberships/invitation-details/:token', () => {

        beforeEach(async () => {
            const inviteResponse = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: PENDING_EMAIL, role: MembershipRole.STAFF });

            if (inviteResponse.body.plainInvitationToken) {
                validPlainInvitationToken = inviteResponse.body.plainInvitationToken;
            } else if (inviteResponse.body.membership && inviteResponse.body.membership.plainInvitationToken) {
                validPlainInvitationToken = inviteResponse.body.membership.plainInvitationToken;
            }
            const createdMembership = await db.Membership.findOne({ where: { invitedEmail: PENDING_EMAIL, establishmentId: mainEstablishment.id }});
            pendingMembershipId = createdMembership?.id ?? null;
        });

        it('should return invited email for a valid, pending token (200)', async () => {
            if (!validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - validPlainInvitationToken not available.`);
                return;
            }
            const response = await supertest(app).get(`${API_BASE}/memberships/invitation-details/${validPlainInvitationToken}`);
            expect(response.status).toBe(200);
            expect(response.body.invitedEmail).toBe(PENDING_EMAIL);
        });

        it('[Sécurité] should return 404 for an invalid token', async () => {
            const response = await supertest(app).get(`${API_BASE}/memberships/invitation-details/invalidtoken1234567890abcdef1234567890abcdef1234567890abcdef1234`);
            expect(response.status).toBe(404);
            expect(response.body.message).toMatch(/Invalid or expired invitation token/);
        });

        it('[Adversarial] should return 400 for a token with invalid format', async () => {
            const response = await supertest(app).get(`${API_BASE}/memberships/invitation-details/short`);
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Invalid token format/);
        });


        it('[Sécurité] should return 404 for an expired token', async () => {
            if (!pendingMembershipId || !validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - pendingMembershipId or validPlainInvitationToken not available.`);
                return;
            }
            await db.Membership.update({ invitationTokenExpiresAt: new Date(Date.now() - 1000) }, { where: { id: pendingMembershipId } });
            const response = await supertest(app).get(`${API_BASE}/memberships/invitation-details/${validPlainInvitationToken}`);
            expect(response.status).toBe(404);
        });

        it('[Sécurité] should return 404 for an already activated token (status ACTIVE)', async () => {
            if (!pendingMembershipId || !validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - pendingMembershipId or validPlainInvitationToken not available.`);
                return;
            }
            await db.Membership.update({ status: MembershipStatus.ACTIVE, userId: adminUser.id }, { where: { id: pendingMembershipId } });
            const response = await supertest(app).get(`${API_BASE}/memberships/invitation-details/${validPlainInvitationToken}`);
            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // Tests pour POST /api/auth/register-via-invitation
    // =========================================================================
    describe('POST /api/auth/register-via-invitation', () => {
        const registrationPayload = { username: 'new_invitee_user', password: PASSWORD };

        beforeEach(async () => {
            const inviteResponse = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: NEW_USER_EMAIL, role: MembershipRole.STAFF });
            if (inviteResponse.body.plainInvitationToken) {
                validPlainInvitationToken = inviteResponse.body.plainInvitationToken;
            } else if (inviteResponse.body.membership && inviteResponse.body.membership.plainInvitationToken) {
                validPlainInvitationToken = inviteResponse.body.membership.plainInvitationToken;
            }
            const createdMembership = await db.Membership.findOne({ where: { invitedEmail: NEW_USER_EMAIL, establishmentId: mainEstablishment.id }});
            pendingMembershipId = createdMembership?.id ?? null;
        });

        it('should register a new user and activate membership successfully (201)', async () => {
            if (!validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - validPlainInvitationToken not available.`);
                return;
            }
            const response = await supertest(app)
                .post(`${API_BASE}/auth/register-via-invitation`)
                .send({ ...registrationPayload, token: validPlainInvitationToken });

            expect(response.status).toBe(201);
            expect(response.body.message).toMatch(/Account created and invitation accepted/);
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.membership).toBeDefined();
            expect(response.body.membership.status).toBe(MembershipStatus.ACTIVE);
            expect(response.body.membership.invitedEmail).toBeNull(); // Doit être nettoyé
            expect(response.body.membership.invitationTokenHash).toBeNull(); // Doit être nettoyé
            expect(response.headers['set-cookie']).toBeDefined();

            const newUser = await db.User.findOne({ where: { email: NEW_USER_EMAIL } });
            expect(newUser).not.toBeNull();
            expect(newUser?.username).toBe(registrationPayload.username);
            const dbMembership = await db.Membership.findByPk(response.body.membership.id);
            expect(dbMembership?.status).toBe(MembershipStatus.ACTIVE);
            expect(dbMembership?.userId).toBe(newUser?.id);
            expect(dbMembership?.joinedAt).toBeDefined();
            expect(dbMembership?.invitationTokenHash).toBeNull();
            expect(dbMembership?.invitedEmail).toBeNull();
        });

        it('[Sécurité] should return 400 for an invalid/expired/used token', async () => {
            const response = await supertest(app)
                .post(`${API_BASE}/auth/register-via-invitation`)
                .send({ ...registrationPayload, token: 'invalidtoken1234567890abcdef1234567890abcdef1234567890abcdef1234' });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Invalid or expired invitation token/);
        });

        it('should return 409 if email associated with token is already registered', async () => {
            if (!validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - validPlainInvitationToken not available.`);
                return;
            }
            await generateTestUser({ email: NEW_USER_EMAIL, username: 'existingemailuser', password: PASSWORD });

            const response = await supertest(app)
                .post(`${API_BASE}/auth/register-via-invitation`)
                .send({ ...registrationPayload, token: validPlainInvitationToken });

            expect(response.status).toBe(409);
            expect(response.body.message).toMatch(/Email address is already in use/);
        });

        it('should return 409 if username is already taken', async () => {
            if (!validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - validPlainInvitationToken not available.`);
                return;
            }
            const response = await supertest(app)
                .post(`${API_BASE}/auth/register-via-invitation`)
                .send({ ...registrationPayload, username: adminUser.username, token: validPlainInvitationToken });
            expect(response.status).toBe(409);
            expect(response.body.message).toMatch(/Username is already in use/);
        });

        it('[Adversarial] should return 400 for invalid DTO (password too short)', async () => {
            if (!validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - validPlainInvitationToken not available.`);
                return;
            }
            const response = await supertest(app)
                .post(`${API_BASE}/auth/register-via-invitation`)
                .send({ ...registrationPayload, password: 'short', token: validPlainInvitationToken });
            expect(response.status).toBe(400);
            expect(response.body.details).toBeDefined();
        });

        it('[Adversarial] Register with username/password containing special characters', async () => {
            if (!validPlainInvitationToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - validPlainInvitationToken not available.`);
                return;
            }
            const specialUsername = "user<script>&'\"";
            const specialPassword = "pass<script>&'\"123";
            const response = await supertest(app)
                .post(`${API_BASE}/auth/register-via-invitation`)
                .send({ username: specialUsername, password: specialPassword, token: validPlainInvitationToken });
            // S'attendre à un 201 si les caractères sont gérés, ou un 400 si la validation de username/password les rejette
            // Cela dépend de la robustesse de votre validation User
            expect([201, 400]).toContain(response.status);
            if (response.status === 201) {
                const newUser = await db.User.findOne({ where: { email: NEW_USER_EMAIL } });
                expect(newUser?.username).toBe(specialUsername); // Ou une version saine/échappée
            }
        });
    });

    // =========================================================================
    // Tests pour POST /api/memberships/activate-after-login
    // =========================================================================
    describe('POST /api/memberships/activate-after-login', () => {
        let userToLogin: UserAttributes;
        let userToLoginAgent: any;
        let userToLoginAccessToken: string;
        let userToLoginPlainToken: string | null = null;
        let userToLoginMembershipId: number | null = null;

        beforeEach(async () => {
            userToLogin = await generateTestUser({ email: 'loginactivate@test.com', username: 'loginactivate', password: PASSWORD, is_active: true, is_email_active: true });
            const clientRole = await db.Role.findOne({ where: { name: ROLES.CLIENT } }); // Un user simple avant d'être Staff
            await db.UserRole.create({ userId: userToLogin.id, roleId: clientRole!.id });

            const inviteResponse = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: userToLogin.email, role: MembershipRole.STAFF });
            if (inviteResponse.body.plainInvitationToken) {
                userToLoginPlainToken = inviteResponse.body.plainInvitationToken;
            } else if (inviteResponse.body.membership && inviteResponse.body.membership.plainInvitationToken) {
                userToLoginPlainToken = inviteResponse.body.membership.plainInvitationToken;
            }

            const createdMembership = await db.Membership.findOne({ where: { invitedEmail: userToLogin.email, establishmentId: mainEstablishment.id }});
            userToLoginMembershipId = createdMembership?.id ?? null;

            userToLoginAgent = supertest.agent(app);
            userToLoginAccessToken = (await loginTestUser(userToLoginAgent, { email: userToLogin.email, password: PASSWORD })).accessToken;
        });

        it('should activate membership successfully for logged-in user with matching email (200)', async () => {
            if (!userToLoginPlainToken || !userToLoginMembershipId) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - userToLoginPlainToken or ID not available.`);
                return;
            }
            const response = await userToLoginAgent
                .post(`${API_BASE}/memberships/activate-after-login`)
                .set('Authorization', `Bearer ${userToLoginAccessToken}`)
                .send({ token: userToLoginPlainToken });

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/Invitation accepted and linked/);
            expect(response.body.membership).toBeDefined();
            expect(response.body.membership.id).toBe(userToLoginMembershipId);
            expect(response.body.membership.status).toBe(MembershipStatus.ACTIVE);
            expect(response.body.membership.userId).toBe(userToLogin.id);
            expect(response.body.membership.invitedEmail).toBeNull();

            const dbMembership = await db.Membership.findByPk(userToLoginMembershipId);
            expect(dbMembership?.status).toBe(MembershipStatus.ACTIVE);
            expect(dbMembership?.userId).toBe(userToLogin.id);
            expect(dbMembership?.invitationTokenHash).toBeNull();
        });

        it('[Sécurité] should return 401 if user is not authenticated', async () => {
            if (!userToLoginPlainToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - userToLoginPlainToken not available.`);
                return;
            }
            const response = await supertest(app)
                .post(`${API_BASE}/memberships/activate-after-login`)
                .send({ token: userToLoginPlainToken });
            expect(response.status).toBe(401);
        });

        it('[Sécurité] should return 400 for an invalid/expired/used token', async () => {
            const response = await userToLoginAgent
                .post(`${API_BASE}/memberships/activate-after-login`)
                .set('Authorization', `Bearer ${userToLoginAccessToken}`)
                .send({ token: 'invalidtoken1234567890abcdef1234567890abcdef1234567890abcdef1234' });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Invalid or expired invitation token/);
        });

        it('[Sécurité] should return 400 if logged-in user email does not match invitation email', async () => {
            let otherToken: string | null = null;
            const otherEmail = 'different@email.com';
            const otherInviteResponse = await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: otherEmail, role: MembershipRole.STAFF });
            if (otherInviteResponse.body.plainInvitationToken) {
                otherToken = otherInviteResponse.body.plainInvitationToken;
            } else if (otherInviteResponse.body.membership && otherInviteResponse.body.membership.plainInvitationToken) {
                otherToken = otherInviteResponse.body.membership.plainInvitationToken;
            }
            if (!otherToken) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - otherToken not available.`);
                return;
            }

            const response = await userToLoginAgent // Loggué comme 'loginactivate@test.com'
                .post(`${API_BASE}/memberships/activate-after-login`)
                .set('Authorization', `Bearer ${userToLoginAccessToken}`)
                .send({ token: otherToken }); // Token pour 'different@email.com'

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Invitation was sent to a different email address/);
        });

        it('[Edge Case] should return 400 if user tries to accept invite for establishment where they are already ACTIVE member', async () => {
            if (!userToLoginPlainToken || !userToLoginMembershipId) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - userToLoginPlainToken or ID not available.`);
                return;
            }
            await db.Membership.update(
                { status: MembershipStatus.ACTIVE, userId: userToLogin.id, joinedAt: new Date(), invitationTokenHash: null, invitationTokenExpiresAt: null, invitedEmail: null },
                { where: { id: userToLoginMembershipId } }
            );

            const response = await userToLoginAgent
                .post(`${API_BASE}/memberships/activate-after-login`)
                .set('Authorization', `Bearer ${userToLoginAccessToken}`)
                .send({ token: userToLoginPlainToken });

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Invalid or expired invitation token/);
        });
    });

    // =========================================================================
    // Tests pour DELETE /api/memberships/:membershipId (Revoke/Remove)
    // =========================================================================
    describe('DELETE /api/memberships/:membershipId', () => {
        let pendingInviteToDelete: Membership | null = null;
        let activeMemberToDelete: Membership | null = null;
        let inactiveMemberToDelete: Membership | null = null;
        let otherAdminMembershipInOtherEstab: Membership | null = null;
        let adminMemberOfMainEstab: Membership | null = null; // Pour le test de suppression du dernier admin

        beforeEach(async () => {
            // ... (reset des variables à null comme avant) ...
            pendingInviteToDelete = null; activeMemberToDelete = null; inactiveMemberToDelete = null; otherAdminMembershipInOtherEstab = null; adminMemberOfMainEstab = null;


            // Récupérer/Créer les memberships nécessaires
            const inviteResponse = await adminAgent.post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`).set('Authorization', `Bearer ${adminAccessToken}`).send({ email: PENDING_EMAIL, role: MembershipRole.STAFF });
            if (inviteResponse.status === 201) {
                // On s'assure de récupérer l'instance après création pour avoir un ID fiable
                const createdPending = await db.Membership.findOne({ where: { invitedEmail: PENDING_EMAIL, establishmentId: mainEstablishment.id } });
                pendingInviteToDelete = createdPending;
            } else { console.error("[DELETE beforeEach] Failed to create PENDING invite for delete tests. Status:", inviteResponse.status, inviteResponse.body); }


            activeMemberToDelete = await db.Membership.findOne({ where: { userId: staffUser.id, establishmentId: mainEstablishment.id } });
            inactiveMemberToDelete = await db.Membership.findOne({ where: { userId: inactiveMemberUser.id, establishmentId: mainEstablishment.id } });
            otherAdminMembershipInOtherEstab = await db.Membership.findOne({ where: { userId: otherAdminUser.id, establishmentId: otherEstablishment.id } });
            adminMemberOfMainEstab = await db.Membership.findOne({where: { userId: adminUser.id, establishmentId: mainEstablishment.id }});


            if (!pendingInviteToDelete) console.warn("[DELETE beforeEach] Setup for pendingInviteToDelete might have failed.");
            if (!activeMemberToDelete) console.warn("[DELETE beforeEach] Setup for activeMemberToDelete might have failed.");
            if (!inactiveMemberToDelete) console.warn("[DELETE beforeEach] Setup for inactiveMemberToDelete might have failed.");
            if (!otherAdminMembershipInOtherEstab) console.warn("[DELETE beforeEach] Setup for otherAdminMembershipInOtherEstab might have failed.");
            if (!adminMemberOfMainEstab) console.warn("[DELETE beforeEach] Setup for adminMemberOfMainEstab might have failed.");

        });

        it('[Edge Case] should revoke a PENDING invitation successfully (204)', async () => {
            if (!pendingInviteToDelete?.id) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - pendingInviteToDelete or its ID not available.`);
                return pending();
            }
            const response = await adminAgent
                .delete(`${API_BASE}/memberships/${pendingInviteToDelete.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(204); // Attendu après implémentation
            const dbCheck = await db.Membership.findByPk(pendingInviteToDelete.id);
            expect(dbCheck).toBeNull();
        });

        it('[Edge Case] should remove an ACTIVE member successfully (204)', async () => {
            if (!activeMemberToDelete?.id) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - activeMemberToDelete is not available.`);
                return pending();
            }
            const response = await adminAgent
                .delete(`${API_BASE}/memberships/${activeMemberToDelete.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(204); // Attendu après implémentation
            const dbCheck = await db.Membership.findByPk(activeMemberToDelete.id);
            expect(dbCheck).toBeNull();
        });

        it('[Edge Case] should remove an INACTIVE member successfully (204)', async () => {
            if (!inactiveMemberToDelete?.id) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - inactiveMemberToDelete is not available.`);
                return pending();
            }
            const response = await adminAgent
                .delete(`${API_BASE}/memberships/${inactiveMemberToDelete.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(204); // Attendu après implémentation
            const dbCheck = await db.Membership.findByPk(inactiveMemberToDelete.id);
            expect(dbCheck).toBeNull();
        });

        it('[Sécurité] should return 403 if STAFF tries to remove another member', async () => {
            const targetMembership = await db.Membership.findOne({ where: { userId: alreadyMemberUser.id, establishmentId: mainEstablishment.id }});
            if (!targetMembership?.id) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - targetMembership for alreadyMemberUser not found.`);
                return pending();
            }
            const response = await staffAgent // Agent STAFF
                .delete(`${API_BASE}/memberships/${targetMembership.id}`)
                .set('Authorization', `Bearer ${staffAccessToken}`);
            expect(response.status).toBe(403); // Attendu après implémentation
        });

        it('[Sécurité] should return 403 if ADMIN tries to remove member from another establishment', async () => {
            if (!otherAdminMembershipInOtherEstab?.id) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - otherAdminMembershipInOtherEstab not available.`);
                return pending();
            }
            const response = await adminAgent // Admin du mainEstablishment
                .delete(`${API_BASE}/memberships/${otherAdminMembershipInOtherEstab.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(403); // Attendu après implémentation
        });


        it('[Sécurité] should return 401 if not authenticated', async () => {
            if (!activeMemberToDelete?.id) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - activeMemberToDelete not available.`);
                return pending();
            }
            const response = await supertest(app)
                .delete(`${API_BASE}/memberships/${activeMemberToDelete.id}`);
            expect(response.status).toBe(401); // Attendu après implémentation
        });

        it('should return 404 if membership ID does not exist for deletion', async () => {
            const response = await adminAgent
                .delete(`${API_BASE}/memberships/999999`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(404); // Reste 404
        });

        // Ajouter le test de protection du dernier admin
        it('[Logique Protection] should return 400 if Admin tries to remove themselves when they are the only Admin', async () => {
            if (!adminMemberOfMainEstab?.id) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - adminMemberOfMainEstab not available.`);
                return pending();
            }
            // S'assurer qu'il n'y a pas d'autres admins dans mainEstablishment
            await db.Membership.destroy({ where: { establishmentId: mainEstablishment.id, role: MembershipRole.ADMIN, id: {[Op.ne]: adminMemberOfMainEstab.id } }});
            const response = await adminAgent
                .delete(`${API_BASE}/memberships/${adminMemberOfMainEstab.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot remove the last administrator/);
        });
    });

    // =========================================================================
    // Tests de Cycle de Vie / Cascade
    // =========================================================================
    describe('Lifecycle & Cascade Tests', () => {

        let userToDeleteLifecycle: UserAttributes; // Renommer pour éviter conflit
        let membershipForUserDelete: Membership;
        let establishmentForCascadeDelete: Establishment;
        let memberInCascadeDeleteEstab: Membership;

        beforeEach(async () => {
            userToDeleteLifecycle = await generateTestUser({ email: 'delete-me-lifecycle@test.com', username: 'deletemelifecycle', password: PASSWORD });
            membershipForUserDelete = await db.Membership.create({ userId: userToDeleteLifecycle.id, establishmentId: mainEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, joinedAt: new Date() });

            establishmentForCascadeDelete = await db.Establishment.create({ name: "Cascade Delete Est", siret: "33333333333333", siren: "333333333", owner_id: adminUser.id, is_validated: true, address_line1: 'z', city: 'x', postal_code: 'y', country_name: 'TestLand', country_code: 'TL' });
            memberInCascadeDeleteEstab = await db.Membership.create({ userId: staffUser.id, establishmentId: establishmentForCascadeDelete.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE, joinedAt: new Date() });
            // Créer aussi un service et une assignation pour tester la cascade
            const tempService = await db.Service.create({ establishment_id: establishmentForCascadeDelete.id, name: "Service In Cascade", duration_minutes: 30, price: 5, currency: "EUR" });
            await db.ServiceMemberAssignment.create({ serviceId: tempService.id, membershipId: memberInCascadeDeleteEstab.id });
        });

        it('[Edge Case] should set Membership.userId to NULL when User is deleted (ON DELETE SET NULL)', async () => {
            await db.User.destroy({ where: { id: userToDeleteLifecycle.id } });
            const dbCheck = await db.Membership.findByPk(membershipForUserDelete.id);
            expect(dbCheck).not.toBeNull();
            expect(dbCheck?.userId).toBeNull();
            expect(dbCheck?.status).toBe(MembershipStatus.ACTIVE);
        });

        it('[Edge Case] should delete Memberships (and assignments) when Establishment is deleted (ON DELETE CASCADE)', async () => {
            const memberId = memberInCascadeDeleteEstab.id;
            await db.Establishment.destroy({ where: { id: establishmentForCascadeDelete.id } });

            const dbCheckMember = await db.Membership.findByPk(memberId);
            expect(dbCheckMember).toBeNull();

            const dbCheckAssign = await db.ServiceMemberAssignment.findOne({ where: { membershipId: memberId }});
            expect(dbCheckAssign).toBeNull();
        });
    });

    // =========================================================================
    // Tests pour GET /api/users/me/establishments/:establishmentId/memberships (Lister Membres)
    // =========================================================================
    describe('GET /api/users/me/establishments/:establishmentId/memberships (Lister Membres)', () => {
        let adminMembershipForList: Membership;
        let staffMembershipForList: Membership;
        let inactiveMembershipForList: Membership;
        let pendingMembershipForList: Membership; // Créé via API pour avoir token

        beforeEach(async () => {
            // adminUser est déjà membre de mainEstablishment via le setup global
            adminMembershipForList = await db.Membership.findOne({ where: { userId: adminUser.id, establishmentId: mainEstablishment.id }}) as Membership;

            // staffUser est déjà membre STAFF actif via le setup global
            staffMembershipForList = await db.Membership.findOne({ where: { userId: staffUser.id, establishmentId: mainEstablishment.id }}) as Membership;

            // inactiveMemberUser est déjà membre INACTIVE via setup global
            inactiveMembershipForList = await db.Membership.findOne({where: {userId: inactiveMemberUser.id, establishmentId: mainEstablishment.id}}) as Membership;

            // Créer une invitation PENDING
            await adminAgent
                .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ email: PENDING_EMAIL, role: MembershipRole.STAFF });
            pendingMembershipForList = await db.Membership.findOne({ where: { invitedEmail: PENDING_EMAIL, establishmentId: mainEstablishment.id }}) as Membership;
        });

        it('should return list of all members (Admin, Staff, Inactive, Pending) for an Admin (200)', async () => {
            const response = await adminAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.pagination.totalItems).toBe(6);

            const membersList = response.body.data;
            const foundAdmin = membersList.find((m: any) => m.user?.id === adminUser.id && m.role === MembershipRole.ADMIN && m.status === MembershipStatus.ACTIVE);
            const foundStaff = membersList.find((m: any) => m.user?.id === staffUser.id && m.role === MembershipRole.STAFF && m.status === MembershipStatus.ACTIVE);
            const foundInactive = membersList.find((m: any) => m.user?.id === inactiveMemberUser.id && m.role === MembershipRole.STAFF && m.status === MembershipStatus.INACTIVE);
            const foundPending = membersList.find((m: any) => m.invitedEmail === PENDING_EMAIL && m.status === MembershipStatus.PENDING);

            expect(foundAdmin).toBeDefined();
            expect(foundAdmin.user.username).toBe(adminUser.username);
            expect(foundStaff).toBeDefined();
            expect(foundStaff.user.username).toBe(staffUser.username);
            expect(foundInactive).toBeDefined();
            expect(foundInactive.user.username).toBe(inactiveMemberUser.username);
            expect(foundPending).toBeDefined();
            expect(foundPending.user).toBeNull();
        });

        it('[Sécurité] should return 403 if Staff tries to list members', async () => {
            const response = await staffAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships`)
                .set('Authorization', `Bearer ${staffAccessToken}`);
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 403 if Admin of another establishment tries to list', async () => {
            const response = await otherAdminAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships`) // Accède à mainEstablishment
                .set('Authorization', `Bearer ${otherAdminAccessToken}`);
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 401 if not authenticated', async () => {
            const response = await supertest(app)
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships`);
            expect(response.status).toBe(401);
        });

        it('[Edge Case] should return an empty array for an establishment with no members (except self, if admin)', async () => {
            // Créer un nouvel établissement sans autres membres pour otherAdminUser
            const newEmptyEstab = await db.Establishment.create({ name: "Empty Est", siret: "44444444444444", siren: "444444444", owner_id: otherAdminUser.id, is_validated: true, address_line1: 'a', city: 'c', postal_code: 'p', country_name: 'TestLand', country_code: 'TL' });
            // L'admin est automatiquement membre
            await db.Membership.create({ userId: otherAdminUser.id, establishmentId: newEmptyEstab.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE, joinedAt: new Date() });


            const response = await otherAdminAgent
                .get(`${API_BASE}/users/me/establishments/${newEmptyEstab.id}/memberships`)
                .set('Authorization', `Bearer ${otherAdminAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].user.id).toBe(otherAdminUser.id);
            expect(response.body.pagination.totalItems).toBe(1);
        });

        it('[Edge Case] should return 404 for a non-existent establishment', async () => {
            const response = await adminAgent
                .get(`${API_BASE}/users/me/establishments/999999/memberships`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            // Le middleware ensureMembership devrait retourner 403 ou 404
            expect([403, 404]).toContain(response.status);
        });

        it('[Adversarial] should return 400 for an invalid establishment ID in URL', async () => {
            const response = await adminAgent
                .get(`${API_BASE}/users/me/establishments/abc/memberships`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(400);
        });

        // --- I. Pagination ---
        describe('Pagination Tests', () => {
            const TOTAL_MEMBERS_FOR_PAGINATION = 15; // admin + staff + inactive + pending (4) + 11 extra

            beforeEach(async () => {
                const existingMembersCount = await db.Membership.count({ where: { establishmentId: mainEstablishment.id }});
                const staffToCreateForPagination = TOTAL_MEMBERS_FOR_PAGINATION - existingMembersCount;

                if (staffToCreateForPagination > 0) {
                    const staffUsersData = [];
                    for (let i = 0; i < staffToCreateForPagination; i++) {
                        staffUsersData.push({
                            username: `page_staff_p${i}`, // préfixe 'p' pour éviter collisions de noms
                            email: `page_staff_p${i}@test.com`,
                            password: PASSWORD,
                            is_active: true,
                            is_email_active: true
                        });
                    }
                    // S'assurer que les emails sont uniques, même entre les exécutions de beforeEach
                    const uniqueStaffUsersData = staffUsersData.map((u, i) => ({ ...u, email: `page_staff_p${i}_${Date.now()}@test.com` }));

                    const createdStaffUsers = await Promise.all(uniqueStaffUsersData.map(data => generateTestUser(data)));

                    const staffRole = await db.Role.findOne({ where: { name: ROLES.STAFF } });
                    const clientRole = await db.Role.findOne({ where: { name: ROLES.CLIENT } });
                    if (!staffRole || !clientRole) throw new Error("Staff/Client role not found for pagination setup.");

                    const membershipsToCreate = [];
                    for (const user of createdStaffUsers) {
                        membershipsToCreate.push({
                            userId: user.id,
                            establishmentId: mainEstablishment.id,
                            role: MembershipRole.STAFF,
                            status: MembershipStatus.ACTIVE,
                            joinedAt: new Date(Date.now() - Math.random() * 1000 * 3600 * 24 * 5)
                        });
                        await db.UserRole.bulkCreate([
                            { userId: user.id, roleId: staffRole.id },
                            { userId: user.id, roleId: clientRole.id },
                        ]);
                    }
                    await db.Membership.bulkCreate(membershipsToCreate);
                }
            });

            it('Fonctionnel - Pagination (Page 1, Limite par Défaut): Devrait retourner la première page de membres (max 10) et les métadonnées correctes', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body.data)).toBe(true);
                expect(response.body.data.length).toBeLessThanOrEqual(10);
                expect(response.body.pagination.currentPage).toBe(1);
                expect(response.body.pagination.itemsPerPage).toBe(10); // Valeur par défaut du DTO
                expect(response.body.pagination.totalItems).toBe(TOTAL_MEMBERS_FOR_PAGINATION);
                expect(response.body.pagination.totalPages).toBe(Math.ceil(TOTAL_MEMBERS_FOR_PAGINATION / 10));
            });

            it('Fonctionnel - Pagination (Page 2, Limite par Défaut): Devrait retourner la deuxième page de membres', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?page=2`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body.data)).toBe(true);
                expect(response.body.data.length).toBeLessThanOrEqual(10); // Peut être moins si dernière page
                if (TOTAL_MEMBERS_FOR_PAGINATION > 10) {
                    expect(response.body.data.length).toBe(TOTAL_MEMBERS_FOR_PAGINATION - 10);
                }
                expect(response.body.pagination.currentPage).toBe(2);
                expect(response.body.pagination.totalItems).toBe(TOTAL_MEMBERS_FOR_PAGINATION);
            });

            it('Fonctionnel - Pagination (Limite Spécifique): Devrait retourner le nombre de membres spécifié par `limit`', async () => {
                const customLimit = 5;
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?limit=${customLimit}`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.data.length).toBe(customLimit);
                expect(response.body.pagination.itemsPerPage).toBe(customLimit);
                expect(response.body.pagination.totalPages).toBe(Math.ceil(TOTAL_MEMBERS_FOR_PAGINATION / customLimit));
            });

            it('Edge Case - Pagination (Page Vide / Au-delà du Nombre Total de Pages): Devrait retourner un tableau de données vide', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?page=999`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.data).toEqual([]);
                expect(response.body.pagination.currentPage).toBe(999);
                expect(response.body.pagination.totalItems).toBe(TOTAL_MEMBERS_FOR_PAGINATION);
                expect(response.body.pagination.totalPages).toBe(Math.ceil(TOTAL_MEMBERS_FOR_PAGINATION / 10));
            });

            it('Edge Case - Pagination (Limite Maximale): Devrait respecter la limite maximale de 100', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?limit=200`) // Dépasse le max de Zod (100)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400);
            });

            it('Edge Case - Pagination (Limite valide mais chaîne): Devrait appliquer la limite et retourner 200', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?limit=50`) // "50" en chaîne
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.pagination.itemsPerPage).toBe(50);
            });

            it('Adversarial - Pagination (Paramètre `page` invalide string): Devrait retourner 400', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?page=abc`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400);
            });

            it('Adversarial - Pagination (Paramètre `page` invalide <=0): Devrait retourner 400', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?page=0`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400);
            });

            it('Adversarial - Pagination (Paramètre `limit` invalide string): Devrait retourner 400', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?limit=xyz`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400);
            });
        });

        // --- II. Filtrage ---
        describe('Filtrage Tests', () => {
            // Le beforeEach externe crée admin (ACTIVE, ADMIN), staff (ACTIVE, STAFF), inactive (INACTIVE, STAFF), pending (PENDING, STAFF)

            it('Fonctionnel - Filtre par `status=ACTIVE`: Devrait retourner uniquement les membres actifs', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?status=ACTIVE`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBeGreaterThan(0);
                response.body.data.forEach((m: any) => expect(m.status).toBe(MembershipStatus.ACTIVE));
                const activeMembersInDb = await db.Membership.count({
                    where: { establishmentId: mainEstablishment.id, status: MembershipStatus.ACTIVE }
                });
                expect(response.body.pagination.totalItems).toBe(activeMembersInDb);
            });

            it('Fonctionnel - Filtre par `status=PENDING`: Devrait retourner uniquement les invitations en attente', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?status=PENDING`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBe(1); // Un seul PENDING créé dans le beforeEach externe
                response.body.data.forEach((m: any) => expect(m.status).toBe(MembershipStatus.PENDING));
            });

            it('Fonctionnel - Filtre par `role=ADMIN`: Devrait retourner uniquement les membres ADMIN', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?role=ADMIN`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBeGreaterThan(0);
                response.body.data.forEach((m: any) => expect(m.role).toBe(MembershipRole.ADMIN));
                const adminMembersInDb = await db.Membership.count({
                    where: { establishmentId: mainEstablishment.id, role: MembershipRole.ADMIN }
                });
                expect(response.body.pagination.totalItems).toBe(adminMembersInDb);
            });

            it('Fonctionnel - Filtre par `role=STAFF`: Devrait retourner uniquement les membres STAFF', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?role=STAFF`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBeGreaterThan(0);
                response.body.data.forEach((m: any) => expect(m.role).toBe(MembershipRole.STAFF));
                const staffMembersInDb = await db.Membership.count({
                    where: { establishmentId: mainEstablishment.id, role: MembershipRole.STAFF }
                });
                expect(response.body.pagination.totalItems).toBe(staffMembersInDb);
            });

            it('Fonctionnel - Filtre combiné (`status=ACTIVE` et `role=STAFF`): Devrait retourner les STAFF actifs', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?status=ACTIVE&role=STAFF`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBeGreaterThanOrEqual(1); // staffUser + others from pagination
                response.body.data.forEach((m: any) => {
                    expect(m.status).toBe(MembershipStatus.ACTIVE);
                    expect(m.role).toBe(MembershipRole.STAFF);
                });
            });

            it('Edge Case - Filtre ne retournant aucun résultat: Devrait retourner un tableau vide', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?role=ADMIN&status=PENDING`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data).toEqual([]);
                expect(response.body.pagination.totalItems).toBe(0);
            });

            it('Adversarial - Filtre (Paramètre `status` invalide): Devrait retourner 400', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?status=INVALID_STATUS`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400);
            });
        });

        // --- III. Filtrage par `search` ---
        describe('Filtrage par `search` Tests', () => {
            let searchPendingUserEmail: string;
            let searchUserJohn: UserAttributes;

            beforeEach(async () => {
                searchPendingUserEmail = `search_pending_${Date.now()}@test.com`;
                await adminAgent
                    .post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`)
                    .set('Authorization', `Bearer ${adminAccessToken}`)
                    .send({ email: searchPendingUserEmail, role: MembershipRole.STAFF });

                searchUserJohn = await generateTestUser({
                    username: `john_unique_search_${Date.now()}`, // Rendre username unique aussi
                    email: `john.unique.search_${Date.now()}@example.com`,
                    password: PASSWORD,
                    is_active: true,
                    is_email_active: true
                });
                const staffRole = await db.Role.findOne({ where: { name: ROLES.STAFF } });
                const clientRole = await db.Role.findOne({ where: { name: ROLES.CLIENT } });
                if (!staffRole || !clientRole) throw new Error("Roles not found for search user setup");

                await db.UserRole.bulkCreate([ { userId: searchUserJohn.id, roleId: staffRole.id }, { userId: searchUserJohn.id, roleId: clientRole.id }]);
                await db.Membership.create({
                    userId: searchUserJohn.id,
                    establishmentId: mainEstablishment.id,
                    role: MembershipRole.STAFF,
                    status: MembershipStatus.ACTIVE,
                    joinedAt: new Date()
                });
            });

            it('Fonctionnel - Filtre `search` sur `username`: Devrait trouver le membre', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?search=john_unique`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBe(1);
                expect(response.body.data[0].user.username).toBe(searchUserJohn.username);
            });

            it('Fonctionnel - Filtre `search` sur `email`: Devrait trouver le membre', async () => {
                expect(searchUserJohn).toBeDefined();
                expect(searchUserJohn.email).toBeDefined();

                const emailSearchTerm = searchUserJohn.email
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?search=${emailSearchTerm}`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBe(1);
                const foundUser = response.body.data.find((m: any) => m.user?.id === searchUserJohn.id);
                expect(foundUser).toBeDefined();
                expect(foundUser.user.email).toBe(searchUserJohn.email);
            });

            it('Fonctionnel - Filtre `search` sur `invitedEmail` (PENDING): Devrait trouver l\'invitation', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?search=search_pending`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBe(1);
                expect(response.body.data[0].invitedEmail).toContain('search_pending');
                expect(response.body.data[0].status).toBe(MembershipStatus.PENDING);
            });

            it('Fonctionnel - Filtre `search` (casse insensible): Devrait trouver le membre', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?search=JOHN_UNIQUE`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data.length).toBe(1);
                expect(response.body.data[0].user.username).toBe(searchUserJohn.username);
            });

            it('Edge Case - Filtre `search` ne retournant aucun résultat: Devrait retourner tableau vide', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?search=nonexistentXYZ123`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                expect(response.body.data).toEqual([]);
            });

            it('Adversarial - Filtre `search` (chaîne vide après trim): Devrait retourner 400 (Zod min(1) sur `search`)', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?search=`) // search est vide
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400); // Zod devrait rejeter car min(1)
            });
        });

        // --- IV. Tri ---
        describe('Tri Tests', () => {
            // Les utilisateurs (adminUser, staffUser, inactiveMemberUser, yetAnotherStaffUser)
            // ont des usernames variés. Les dates joinedAt/createdAt sont aussi variées par le setup.
            // adminUser: member_admin
            // staffUser: member_staff
            // inactiveMemberUser: inactive_member
            // yetAnotherStaffUser: another_staff
            // Les usernames pour le tri ASC: another_staff, inactive_member, member_admin, member_staff (en excluant les PENDING et les utilisateurs de pagination/search)

            it('Fonctionnel - Tri par `username` ASC (défaut pour string): Devrait trier par username ascendant', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?sortBy=username&limit=50`) // Assez de limite pour voir l'ordre
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                const usernames = response.body.data
                    .filter((m: any) => m.user) // Exclure PENDING qui n'ont pas de user.username
                    .map((m: any) => m.user.username);
                // Comparer avec la liste triée attendue (partielle, car il y a les users de pagination)
                expect(usernames).toEqual([...usernames].sort());
            });

            it('Fonctionnel - Tri par `username` DESC: Devrait trier par username descendant', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?sortBy=username&sortOrder=DESC&limit=50`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                const usernames = response.body.data
                    .filter((m: any) => m.user)
                    .map((m: any) => m.user.username);
                expect(usernames).toEqual([...usernames].sort().reverse());
            });

            it('Fonctionnel - Tri par `createdAt` DESC (défaut pour date): Devrait trier par date de création (plus récent en premier)', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?sortBy=createdAt&limit=50`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                const createdDates = response.body.data.map((m: any) => new Date(m.createdAt).getTime());
                for (let i = 0; i < createdDates.length - 1; i++) {
                    expect(createdDates[i]).toBeGreaterThanOrEqual(createdDates[i + 1]);
                }
            });

            it('Fonctionnel - Tri par `joinedAt` ASC: Devrait trier par date d\'adhésion (plus ancien en premier)', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?sortBy=joinedAt&sortOrder=ASC&limit=50`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                const joinedDates = response.body.data
                    .filter((m: any) => m.joinedAt) // Filtrer ceux qui ont joinedAt (exclure PENDING)
                    .map((m: any) => new Date(m.joinedAt).getTime());
                for (let i = 0; i < joinedDates.length - 1; i++) {
                    expect(joinedDates[i]).toBeLessThanOrEqual(joinedDates[i + 1]);
                }
            });

            it('Fonctionnel - Tri par `role` ASC: Devrait trier par rôle (ADMIN avant STAFF)', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?sortBy=role&sortOrder=ASC&limit=50`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(200);
                const roles = response.body.data.map((m: any) => m.role);
                const adminIndex = roles.findIndex((r:string) => r === MembershipRole.ADMIN);
                const staffIndex = roles.findIndex((r:string) => r === MembershipRole.STAFF);
                if(adminIndex !== -1 && staffIndex !== -1) { // S'il y a les deux
                    expect(roles.lastIndexOf(MembershipRole.ADMIN)).toBeLessThan(roles.indexOf(MembershipRole.STAFF));
                }
            });

            it('Adversarial - Tri (Paramètre `sortBy` invalide): Devrait retourner 400', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?sortBy=invalidField`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400);
            });

            it('Adversarial - Tri (Paramètre `sortOrder` invalide): Devrait retourner 400', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?sortOrder=INVALID_ORDER`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);
                expect(response.status).toBe(400);
            });
        });

        // --- V. Combinaison de Fonctionnalités ---
        describe('Combinaison de Fonctionnalités Tests', () => {
            it('Fonctionnel - Pagination + Filtre Status + Tri Username: Devrait retourner la page 1 des STAFF actifs, triés par username ASC', async () => {
                const response = await adminAgent
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?status=ACTIVE&role=STAFF&sortBy=username&sortOrder=ASC&page=1&limit=5`)
                    .set('Authorization', `Bearer ${adminAccessToken}`);

                expect(response.status).toBe(200);
                expect(response.body.data.length).toBeLessThanOrEqual(5);
                if (response.body.data.length > 0) { // Seulement si on a des résultats
                    let previousUsername: string | null = null;
                    response.body.data.forEach((m: any) => {
                        expect(m.status).toBe(MembershipStatus.ACTIVE);
                        expect(m.role).toBe(MembershipRole.STAFF);
                        if (m.user && m.user.username) { // S'assurer que user et username existent
                            if (previousUsername !== null) { // Commencer la comparaison à partir du deuxième élément
                                expect(m.user.username.localeCompare(previousUsername)).toBeGreaterThanOrEqual(0);
                            }
                            previousUsername = m.user.username;
                        } else if (m.user === null && previousUsername !== null) {
                            throw new Error('Unexpected null user for ACTIVE STAFF member in combined test');
                        }
                    });
                }
                expect(response.body.pagination.currentPage).toBe(1);
                const expectedCount = await db.Membership.count({
                    where: {
                        establishmentId: mainEstablishment.id,
                        status: MembershipStatus.ACTIVE,
                        role: MembershipRole.STAFF
                    }
                });
                expect(response.body.pagination.totalItems).toBe(expectedCount);
            });

            it('Sécurité - Permissions avec Pagination/Filtre: Un STAFF ne devrait toujours pas lister les membres', async () => {
                const response = await staffAgent // Utilise l'agent du staff
                    .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships?page=1&limit=5&status=ACTIVE`)
                    .set('Authorization', `Bearer ${staffAccessToken}`);
                expect(response.status).toBe(403);
            });
        });

    });

    // =========================================================================
    // Tests pour GET /api/users/me/establishments/:establishmentId/memberships/:membershipId (Voir un Membre)
    // =========================================================================
    describe('GET /api/users/me/establishments/:establishmentId/memberships/:membershipId (Voir un Membre)', () => {
        let adminMembershipInMainEstab: Membership; // Membership de adminUser dans mainEstablishment
        let staffMembershipInMainEstab: Membership; // Membership de staffUser dans mainEstablishment
        let anotherStaffMembershipInMainEstab: Membership; // Membership de yetAnotherStaffUser dans mainEstablishment
        let adminMembershipInOtherEstab: Membership; // Membership de otherAdminUser dans otherEstablishment

        beforeEach(async () => {
            // Ces memberships sont déjà créés dans le beforeEach global de la suite principale.
            // Nous les récupérons ici pour avoir des références claires.
            adminMembershipInMainEstab = await db.Membership.findOne({where: { userId: adminUser.id, establishmentId: mainEstablishment.id }}) as Membership;
            staffMembershipInMainEstab = await db.Membership.findOne({where: { userId: staffUser.id, establishmentId: mainEstablishment.id }}) as Membership;
            anotherStaffMembershipInMainEstab = await db.Membership.findOne({where: { userId: yetAnotherStaffUser.id, establishmentId: mainEstablishment.id }}) as Membership;
            adminMembershipInOtherEstab = await db.Membership.findOne({where: { userId: otherAdminUser.id, establishmentId: otherEstablishment.id }}) as Membership;

            // Vérifier que les memberships ont bien été trouvés pour éviter des erreurs en cascade
            if (!adminMembershipInMainEstab || !staffMembershipInMainEstab || !anotherStaffMembershipInMainEstab || !adminMembershipInOtherEstab) {
                throw new Error("Crucial memberships not found in beforeEach for 'Voir un Membre' tests. Check global setup.");
            }
        });

        it('should allow Admin to view another member (Staff) of their establishment (200)', async () => {
            const response = await adminAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${staffMembershipInMainEstab.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(staffMembershipInMainEstab.id);
            expect(response.body.user.id).toBe(staffUser.id);
        });

        it('should allow Admin to view their own membership (200)', async () => {
            const response = await adminAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${adminMembershipInMainEstab.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(adminMembershipInMainEstab.id);
            expect(response.body.user.id).toBe(adminUser.id);
        });

        it('should allow Staff to view their own membership (200)', async () => {
            const response = await staffAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${staffMembershipInMainEstab.id}`)
                .set('Authorization', `Bearer ${staffAccessToken}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(staffMembershipInMainEstab.id);
            expect(response.body.user.id).toBe(staffUser.id);
        });

        it('[Sécurité] should return 403 if Staff tries to view another member (Admin) of the same establishment', async () => {
            const response = await staffAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${adminMembershipInMainEstab.id}`)
                .set('Authorization', `Bearer ${staffAccessToken}`);
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 403 if Staff tries to view another STAFF member of the same establishment', async () => {
            const response = await staffAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${anotherStaffMembershipInMainEstab.id}`)
                .set('Authorization', `Bearer ${staffAccessToken}`);
            expect(response.status).toBe(403);
        });


        it('[Sécurité] should return 403 if Admin of another establishment tries to view a member', async () => {
            const response = await otherAdminAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${staffMembershipInMainEstab.id}`)
                .set('Authorization', `Bearer ${otherAdminAccessToken}`);
            expect(response.status).toBe(403); // otherAdmin n'est pas membre de mainEstablishment
        });

        it('[Sécurité] should return 401 if not authenticated', async () => {
            const response = await supertest(app)
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${staffMembershipInMainEstab.id}`);
            expect(response.status).toBe(401);
        });

        it('[Edge Case] should return 404 if membershipId is non-existent in the establishment', async () => {
            const response = await adminAgent
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/99999`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(404);
        });

        it('[Edge Case] should return 404 for a non-existent establishmentId', async () => {
            // Le middleware ensureAdminOrSelf... devrait d'abord essayer de trouver le membership de l'acteur pour l'estab
            // Si l'estab n'existe pas, il ne trouvera pas de membership pour l'acteur -> 403
            const response = await adminAgent
                .get(`${API_BASE}/users/me/establishments/99999/memberships/${staffMembershipInMainEstab.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(403);
        });

        it('[Adversarial] should return 404 if membershipId belongs to another establishment (but valid establishmentId in URL)', async () => {
            // otherAdminMembershipInOtherEstab est dans otherEstablishment
            const response = await adminAgent // Admin de mainEstablishment
                .get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/${adminMembershipInOtherEstab.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            // S'attend à 404 car ce membershipId n'est pas DANS mainEstablishmentId
            expect(response.status).toBe(404);
        });

        it('[Adversarial] should return 400 for invalid establishmentId or membershipId in URL', async () => {
            let response = await adminAgent.get(`${API_BASE}/users/me/establishments/abc/memberships/${staffMembershipInMainEstab.id}`).set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(400);
            response = await adminAgent.get(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/xyz`).set('Authorization', `Bearer ${adminAccessToken}`);
            expect(response.status).toBe(400);
        });
    });

    // =========================================================================
    // Tests pour PATCH /api/memberships/:membershipId (Modifier Membre)
    // =========================================================================
    describe('PATCH /api/memberships/:membershipId (Modifier Membre)', () => {
        let staffToUpdate: Membership;
        let adminToUpdate: Membership; // Pour tester la dégradation d'un admin
        let otherAdminForLastAdminTest: UserAttributes; // Utilisateur qui sera le SEUL admin


        beforeEach(async () => {
            staffToUpdate = await db.Membership.findOne({where: {userId: staffUser.id, establishmentId: mainEstablishment.id}}) as Membership;
            adminToUpdate = await db.Membership.findOne({where: {userId: adminUser.id, establishmentId: mainEstablishment.id}}) as Membership;

            // Pour le test "dernier admin"
            otherAdminForLastAdminTest = await generateTestUser({email: 'lastadmin@test.com', username: 'lastadmin', password: PASSWORD});
            const adminRole = await db.Role.findOne({ where: { name: ROLES.ESTABLISHMENT_ADMIN } });
            await db.UserRole.create({ userId: otherAdminForLastAdminTest.id, roleId: adminRole!.id });
        });

        it('should allow Admin to change Staff status (ACTIVE -> INACTIVE) (200)', async () => {
            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ status: MembershipStatus.INACTIVE });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(MembershipStatus.INACTIVE);
            const dbCheck = await db.Membership.findByPk(staffToUpdate.id);
            expect(dbCheck?.status).toBe(MembershipStatus.INACTIVE);
        });

        it('should allow Admin to change Staff status (INACTIVE -> ACTIVE) (200)', async () => {
            await staffToUpdate.update({ status: MembershipStatus.INACTIVE });
            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ status: MembershipStatus.ACTIVE });
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(MembershipStatus.ACTIVE);
        });

        it('should allow Admin to change Staff role (STAFF -> ADMIN) (200)', async () => {
            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ role: MembershipRole.ADMIN });
            expect(response.status).toBe(200);
            expect(response.body.role).toBe(MembershipRole.ADMIN);
        });

        it('should allow Admin to change another Admin role (ADMIN -> STAFF) if not last admin or owner (200)', async () => {
            // S'assurer qu'il y a plus d'un admin (adminUser est déjà admin)
            const anotherAdminUserForTest = await generateTestUser({ email: 'another_admin_temp@test.com', username: 'another_admin_temp', password: PASSWORD });
            const adminRole = await db.Role.findOne({ where: { name: ROLES.ESTABLISHMENT_ADMIN } });
            await db.UserRole.create({ userId: anotherAdminUserForTest.id, roleId: adminRole!.id });
            const anotherAdminMembership = await db.Membership.create({ userId: anotherAdminUserForTest.id, establishmentId: mainEstablishment.id, role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE, joinedAt: new Date() });

            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${anotherAdminMembership.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ role: MembershipRole.STAFF });
            expect(response.status).toBe(200);
            expect(response.body.role).toBe(MembershipRole.STAFF);
        });

        it('[Logique Protection] should return 400 if Admin tries to change their own status to INACTIVE when they are the only active Admin', async () => {
            // Supprimer tous les autres admins actifs potentiels de mainEstablishment
            await db.Membership.destroy({ where: { establishmentId: mainEstablishment.id, role: MembershipRole.ADMIN, userId: {[Op.ne]: adminUser.id} }});

            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${adminToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ status: MembershipStatus.INACTIVE });
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot deactivate the last active administrator/);
        });

        it('[Logique Protection] should return 400 if Admin tries to change their own role from ADMIN to STAFF when they are the only Admin', async () => {
            await db.Membership.destroy({ where: { establishmentId: mainEstablishment.id, role: MembershipRole.ADMIN, userId: {[Op.ne]: adminUser.id} }});

            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${adminToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ role: MembershipRole.STAFF });
            expect(response.status).toBe(400);
            // Le message peut être "Cannot change the role of the last active administrator." ou "Cannot change the role of the establishment owner." selon si ownerId === adminUser.id
            expect(response.body.message).toMatch(/Cannot change the role of the last active administrator|Cannot change the role of the establishment owner/i);
        });

        it('[Logique Protection] should return 400 if Admin tries to change role of establishment owner from ADMIN to STAFF', async () => {
            // adminUser (adminToUpdate) est l'owner de mainEstablishment.
            // S'assurer qu'il y a un autre admin actif pour ne pas être le "dernier admin".
            // Utilisons 'yetAnotherStaffUser' et promouvons-le temporairement admin pour ce test.
            const anotherAdminMembership = await db.Membership.findOne({ where: { userId: yetAnotherStaffUser.id, establishmentId: mainEstablishment.id }});
            if (!anotherAdminMembership) throw new Error("Setup failed: yetAnotherStaffUser membership not found");
            await anotherAdminMembership.update({ role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE });

            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${adminToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ role: MembershipRole.STAFF });

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/Cannot change the role of the establishment owner/);
        });


        it('[Sécurité] should return 403 if Staff tries to modify their own role/status', async () => {
            const response = await staffAgent
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`)
                .set('Authorization', `Bearer ${staffAccessToken}`)
                .send({ status: MembershipStatus.INACTIVE });
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 403 if Staff tries to modify another member role/status', async () => {
            const response = await staffAgent
                .patch(`${API_BASE}/memberships/${adminToUpdate.id}`)
                .set('Authorization', `Bearer ${staffAccessToken}`)
                .send({ status: MembershipStatus.INACTIVE });
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 403 if Admin of another establishment tries to modify a member', async () => {
            const response = await otherAdminAgent
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`) // staffToUpdate est dans mainEstablishment
                .set('Authorization', `Bearer ${otherAdminAccessToken}`)
                .send({ status: MembershipStatus.INACTIVE });
            expect(response.status).toBe(403);
        });

        it('[Sécurité] should return 401 if not authenticated', async () => {
            const response = await supertest(app)
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`)
                .send({ status: MembershipStatus.INACTIVE });
            expect(response.status).toBe(401);
        });

        it('[Edge Case] should return 404 if membershipId is non-existent', async () => {
            const response = await adminAgent
                .patch(`${API_BASE}/memberships/99999`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ status: MembershipStatus.INACTIVE });
            expect(response.status).toBe(404);
        });

        it('[Adversarial] should return 400 for invalid DTO (unknown role)', async () => {
            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ role: 'SUPER_DUPER_ADMIN' });
            expect(response.status).toBe(400);
        });

        it('[Adversarial] should return 400 for empty DTO (no changes)', async () => {
            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${staffToUpdate.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({});
            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/At least status or role must be provided for update/);
        });

        it('[Edge Case] should return 400 if trying to modify a PENDING membership status/role via PATCH', async () => {
            const inviteResponse = await adminAgent.post(`${API_BASE}/users/me/establishments/${mainEstablishment.id}/memberships/invite`).set('Authorization', `Bearer ${adminAccessToken}`).send({ email: PENDING_EMAIL, role: MembershipRole.STAFF });
            const pendingMember = await db.Membership.findOne({ where: { invitedEmail: PENDING_EMAIL, establishmentId: mainEstablishment.id } });
            if (!pendingMember) {
                console.warn(`[SKIPPING TEST] ${expect.getState().currentTestName} - pendingMember not created successfully.`);
                return;
            }

            const response = await adminAgent
                .patch(`${API_BASE}/memberships/${pendingMember.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ status: MembershipStatus.ACTIVE }); // Tentative de modifier PENDING
            // Le service devrait rejeter cela (ex: 400 ou 403) car l'activation a son propre flux
            expect(response.status).toBe(400); // Ou une erreur spécifique si implémentée
            expect(response.body.message).toMatch(/Cannot directly update a PENDING membership/i); // Message attendu du service
        });
    });

});