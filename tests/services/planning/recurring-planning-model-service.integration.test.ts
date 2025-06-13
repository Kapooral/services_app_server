// tests/services/planning/RecurringPlanningModelService.integration.test.ts

import { Sequelize, Transaction } from 'sequelize';
import db from '../../../src/models';
import { RecurringPlanningModelService } from '../../../src/services/recurring-planning-model.service';
import { RpmNameConflictError } from '../../../src/errors/planning.errors';
import { CreateRecurringPlanningModelDto } from '../../../src/dtos/planning/recurring-planning-model.validation';
import { DefaultBlockType, BreakType } from '../../../src/types/planning.enums';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
import RecurringPlanningModel from '../../../src/models/RecurringPlanningModel';
import { generateTestUser } from '../../helpers/auth.helpers';

// --- Configuration et Déclaration ---
let service: RecurringPlanningModelService;
let sequelize: Sequelize;
let testUserAdmin: any;
let testEstablishment: any;

const mockCacheService: jest.Mocked<ICacheService> = {
    get: jest.fn(), set: jest.fn(), delete: jest.fn(),
    flushAll: jest.fn(),
    deleteByPattern: jest.fn(),
};

describe('RecurringPlanningModelService - Integration Tests', () => {

    beforeAll(async () => {
        if (process.env.NODE_ENV !== 'test') { throw new Error('Tests d\'intégration à lancer en environnement de test.'); }

        sequelize = db.sequelize;

        console.log('Syncing database for tests...');
        await db.Booking.destroy({ where: {}, force: true });
        await db.AvailabilityOverride.destroy({ where: {} });
        await db.AvailabilityRule.destroy({ where: {} });
        await db.Service.destroy({ where: {} });
        await db.UserRole.destroy({ where: {} });
        await db.Establishment.destroy({ where: {} });
        await db.RefreshToken.destroy({ where: {} });
        await db.User.destroy({ where: {} });
        console.log('Database synced.');

        try {
            testUserAdmin = await generateTestUser({ username: 'admin_estab', email: 'admin_estab@test.com', password: 'password123' });
            testEstablishment = await db.Establishment.create({
                name: "Validated Public Studio", siret: "33344455566677",
                siren: "333444555", owner_id: testUserAdmin.id,
                is_validated: true, address_line1: 'a3', city: 'c3',
                postal_code: 'p3', country_name: 'France', country_code: 'FR', timezone: 'Europe/Paris',
            });
        } catch (error) { console.error('Failed to seed test data:', error); throw error; }

        service = new RecurringPlanningModelService(
            db.RecurringPlanningModel,
            db.RecurringPlanningModelMemberAssignment,
            sequelize,
            mockCacheService
        );
    });

    afterAll(async () => {
        await sequelize.close();
    });

    it('should create an RPM and persist it correctly in the database', async () => {
        const dto: CreateRecurringPlanningModelDto = {
            name: 'Morning Shift', referenceDate: '2024-01-01',
            globalStartTime: '08:00:00', globalEndTime: '12:00:00',
            rruleString: 'FREQ=WEEKLY;BYDAY=MO', defaultBlockType: DefaultBlockType.WORK,
            breaks: [{ id: 'uuid-1', startTime: '10:00:00', endTime: '10:15:00', breakType: BreakType.SHORT_REST, description: 'Coffee' }],
        };

        const createdRpm = await service.createRpm(dto, testEstablishment.id);
        const foundInDb = await RecurringPlanningModel.findByPk(createdRpm.id);

        expect(foundInDb).not.toBeNull();
        expect(foundInDb?.name).toBe(dto.name);
    });

    it('should fail with RpmNameConflictError if a UNIQUE constraint on the name is violated', async () => {
        const establishmentId = testEstablishment.id;
        const dto: CreateRecurringPlanningModelDto = {
            name: 'Unique Model Name For Conflict Test', referenceDate: '2024-01-01',
            globalStartTime: '09:00:00', globalEndTime: '17:00:00',
            rruleString: 'FREQ=DAILY', defaultBlockType: DefaultBlockType.WORK,
            breaks: [],
        };

        // On crée le premier RPM directement.
        await service.createRpm(dto, establishmentId);

        // On s'attend à ce que le DEUXIÈME appel lève l'erreur métier, car le service
        // (maintenant corrigé) trouvera le premier enregistrement à l'intérieur de sa transaction.
        await expect(service.createRpm(dto, establishmentId))
            .rejects.toThrow(RpmNameConflictError);
    });
});