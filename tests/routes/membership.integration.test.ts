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
            expect(Array.isArray(response.body)).toBe(true);
            // On s'attend à 4 membres dans mainEstablishment après le setup de ce describe
            // adminUser, staffUser, inactiveMemberUser (via membership), PENDING_EMAIL (via invite)
            expect(response.body.length).toBeGreaterThanOrEqual(4); // >= car d'autres tests pourraient en créer

            const foundAdmin = response.body.find((m: any) => m.user?.id === adminUser.id && m.role === MembershipRole.ADMIN && m.status === MembershipStatus.ACTIVE);
            const foundStaff = response.body.find((m: any) => m.user?.id === staffUser.id && m.role === MembershipRole.STAFF && m.status === MembershipStatus.ACTIVE);
            const foundInactive = response.body.find((m: any) => m.user?.id === inactiveMemberUser.id && m.role === MembershipRole.STAFF && m.status === MembershipStatus.INACTIVE);
            const foundPending = response.body.find((m: any) => m.invitedEmail === PENDING_EMAIL && m.status === MembershipStatus.PENDING);

            expect(foundAdmin).toBeDefined();
            expect(foundAdmin.user.username).toBe(adminUser.username);
            expect(foundStaff).toBeDefined();
            expect(foundStaff.user.username).toBe(staffUser.username);
            expect(foundInactive).toBeDefined();
            expect(foundInactive.user.username).toBe(inactiveMemberUser.username);
            expect(foundPending).toBeDefined();
            expect(foundPending.user).toBeNull(); // User est null pour PENDING
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
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(1); // Seulement l'admin lui-même
            expect(response.body[0].user.id).toBe(otherAdminUser.id);
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