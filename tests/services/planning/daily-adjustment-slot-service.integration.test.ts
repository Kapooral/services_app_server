// tests/services/planning/daily-adjustment-slot-service.integration.test.ts

import { execSync } from 'child_process';
import { Sequelize } from 'sequelize';
import bcrypt from 'bcrypt';
import db from '../../../src/models';
import { DailyAdjustmentSlotService } from '../../../src/services/daily-adjustment-slot.service';
import { DasConflictError } from '../../../src/errors/planning.errors';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import { MembershipRole, MembershipStatus } from '../../../src/models';
import { SlotType } from '../../../src/types/planning.enums';
import { CreateDailyAdjustmentSlotDto } from '../../../src/dtos/planning/daily-adjustment-slot.validation';

// --- Configuration et Déclaration ---
let service: DailyAdjustmentSlotService;
let sequelize: Sequelize;
let testUserAdmin: any;
let testEstablishment: any;

const mockCacheService: jest.Mocked<ICacheService> = {
    get: jest.fn(), set: jest.fn(), delete: jest.fn(),
    flushAll: jest.fn(), deleteByPattern: jest.fn(),
};

describe('DailyAdjustmentSlotService - Integration Tests', () => {

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') { throw new Error('Tests d\'intégration à lancer en environnement de test.'); }
        sequelize = db.sequelize;
        execSync('npm run migrate:undo:all:test', { stdio: 'ignore' });
        execSync('npm run migrate:test', { stdio: 'ignore' });
        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.User.destroy({ where: {} });
        const hashedPassword = await bcrypt.hash('password123', 10);
        testUserAdmin = await db.User.create({
            username: 'admin_das_integ', email: 'admin_das_integ@test.com',
            password: hashedPassword, email_masked: 'masked-das@test.com',
        });
        testEstablishment = await db.Establishment.create({
            name: "DAS Test Studio", siret: "33344455566677",
            siren: "333444555", owner_id: testUserAdmin.id,
            is_validated: true, address_line1: 'a3', city: 'c3',
            postal_code: 'p3', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
        });
        service = new DailyAdjustmentSlotService(db.DailyAdjustmentSlot, db.Membership, db.RecurringPlanningModel, sequelize, mockCacheService);
    });

    afterAll(async () => {
        if (sequelize) { await sequelize.close(); }
    });

    afterEach(async () => {
        await db.DailyAdjustmentSlot.destroy({ where: {} });
        await db.Membership.destroy({ where: {} });
        await db.User.destroy({ where: { id: { [db.Sequelize.Op.ne]: testUserAdmin.id } } });
    });

    const createTestMember = async (email: string) => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        const user = await db.User.create({ username: email.split('@')[0], email: email, password: hashedPassword, email_masked: `masked-${email}`, });
        return await db.Membership.create({ userId: user.id, establishmentId: testEstablishment.id, role: MembershipRole.STAFF, status: MembershipStatus.ACTIVE });
    };

    it('should create a valid Daily Adjustment Slot in the database', async () => {
        const member = await createTestMember('member-das-1@test.com');
        const dto: CreateDailyAdjustmentSlotDto = {
            membershipId: member.id,
            establishmentId: testEstablishment.id,
            slotDate: '2024-11-20',
            startTime: '09:00:00',
            endTime: '17:00:00',
            slotType: SlotType.SICK_LEAVE_CERTIFIED,
            isManualOverride: true,
        };

        const createdDas = await service.createDas(dto, testEstablishment.id);
        const foundInDb = await db.DailyAdjustmentSlot.findByPk(createdDas.id);
        expect(foundInDb).not.toBeNull();
        expect(foundInDb?.slotType).toBe(SlotType.SICK_LEAVE_CERTIFIED);
    });

    it('should prevent creating an overlapping DAS and rollback the transaction', async () => {
        const member = await createTestMember('member-das-2@test.com');
        const date = '2024-11-21';

        await service.createDas({
            membershipId: member.id, establishmentId: testEstablishment.id,
            slotDate: date, startTime: '09:00:00', endTime: '11:00:00',
            slotType: SlotType.EFFECTIVE_WORK,
            isManualOverride: true,
        }, testEstablishment.id);

        await expect(service.createDas({
            membershipId: member.id, establishmentId: testEstablishment.id,
            slotDate: date, startTime: '10:00:00', endTime: '12:00:00',
            slotType: SlotType.TRAINING_EXTERNAL,
            isManualOverride: true,
        }, testEstablishment.id)).rejects.toThrow(DasConflictError);

        const count = await db.DailyAdjustmentSlot.count({ where: { membershipId: member.id, slotDate: date } });
        expect(count).toBe(1);
    });

    it('should update an existing DAS correctly in the database', async () => {
        const member = await createTestMember('member-das-3@test.com');
        const dto: CreateDailyAdjustmentSlotDto = {
            membershipId: member.id, establishmentId: testEstablishment.id,
            slotDate: '2024-11-22', startTime: '14:00:00', endTime: '15:00:00',
            slotType: SlotType.MANUAL_BREAK,
            isManualOverride: true,
        };
        const initialDas = await service.createDas(dto, testEstablishment.id);

        const updateDto = { endTime: '16:30:00' };
        await service.updateDas(initialDas.id, updateDto, testEstablishment.id);

        const updatedInDb = await db.DailyAdjustmentSlot.findByPk(initialDas.id);
        expect(updatedInDb).not.toBeNull();
        expect(updatedInDb?.endTime).toBe('16:30:00');
    });
});