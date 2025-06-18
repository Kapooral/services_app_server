// tests/services/planning/daily-schedule-service.unit.test.ts

import { DailyScheduleService, CalculatedSlot } from '../../../src/services/daily-schedule.service';
import { MembershipNotFoundError } from '../../../src/errors/membership.errors';
import { TimezoneConfigurationError } from '../../../src/errors/planning.errors';
import { BreakType, DefaultBlockType, SlotType } from '../../../src/types/planning.enums';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';

// --- Mocks et Factory de Données ---
let rpmAssignmentModelMock: { findAll: jest.Mock };
let dasModelMock: { findAll: jest.Mock };
let membershipModelMock: { findByPk: jest.Mock };
let cacheServiceMock: jest.Mocked<ICacheService>;
let service: DailyScheduleService;

// Factory pour centraliser la création de données de test et faciliter les surcharges
const mockDataFactory = {
    membership: (overrides: any = {}) => ({
        id: 1,
        establishmentId: 10,
        establishment: { id: 10, timezone: 'Europe/Paris', ...overrides.establishment },
        ...overrides,
    }),
    rpm: (overrides: any = {}) => ({
        id: 100, name: 'Standard Day', referenceDate: '2024-01-01',
        globalStartTime: '09:00:00', globalEndTime: '17:00:00',
        rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', defaultBlockType: DefaultBlockType.WORK,
        breaks: [{ id: 'break-1', startTime: '12:00:00', endTime: '13:00:00', breakType: BreakType.MEAL }],
        ...overrides
    }),
    rpmAssignment: (rpm: any) => ({
        id: 1000,
        recurringPlanningModel: rpm,
    }),
    das: (overrides: any = {}) => ({
        id: 2000, slotDate: '2024-10-24', startTime: '14:00:00', endTime: '15:00:00',
        slotType: SlotType.EFFECTIVE_WORK, description: 'Manual Task',
        ...overrides
    }),
};


describe('DailyScheduleService', () => {

    beforeEach(() => {
        rpmAssignmentModelMock = { findAll: jest.fn() };
        dasModelMock = { findAll: jest.fn() };
        membershipModelMock = { findByPk: jest.fn() };
        cacheServiceMock = { get: jest.fn(), set: jest.fn(), delete: jest.fn(), flushAll: jest.fn(), deleteByPattern: jest.fn() };

        service = new DailyScheduleService(rpmAssignmentModelMock as any, dasModelMock as any, membershipModelMock as any, cacheServiceMock);

        jest.clearAllMocks();
        // Mocks par défaut
        cacheServiceMock.get.mockResolvedValue(null);
        membershipModelMock.findByPk.mockResolvedValue(mockDataFactory.membership());
    });

    afterEach(() => {
        jest.useRealTimers(); // Restaurer la gestion réelle du temps après les tests qui la modifient
    });

    describe('Basic Scenarios (Happy Paths)', () => {
        it('should return a basic work-break-work schedule for a standard RPM', async () => {
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(mockDataFactory.rpm())]);
            dasModelMock.findAll.mockResolvedValue([]);
            const schedule = await service.getDailyScheduleForMember(1, '2024-10-25'); // Un vendredi

            expect(schedule).toHaveLength(3);
            expect(schedule.map(s => s.type)).toEqual(['WORK', 'MEAL', 'WORK']);
            expect(schedule[0]).toMatchObject({ startTime: '09:00:00', endTime: '12:00:00' });
            expect(schedule[1]).toMatchObject({ startTime: '12:00:00', endTime: '13:00:00' });
            expect(schedule[2]).toMatchObject({ startTime: '13:00:00', endTime: '17:00:00' });
        });

        it('should correctly insert a DAS, splitting the underlying RPM block', async () => {
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(mockDataFactory.rpm())]);
            dasModelMock.findAll.mockResolvedValue([mockDataFactory.das()]);
            const schedule = await service.getDailyScheduleForMember(1, '2024-10-24'); // Un jeudi

            expect(schedule).toHaveLength(5);
            expect(schedule.map(s => s.type)).toEqual(['WORK', 'MEAL', 'WORK', 'EFFECTIVE_WORK', 'WORK']);
            expect(schedule[3]).toMatchObject({ type: 'EFFECTIVE_WORK', startTime: '14:00:00', endTime: '15:00:00' });
            expect(schedule[4]).toMatchObject({ type: 'WORK', startTime: '15:00:00', endTime: '17:00:00' });
        });

        it('should return only DAS slots if no RPM assignment is active', async () => {
            rpmAssignmentModelMock.findAll.mockResolvedValue([]);
            dasModelMock.findAll.mockResolvedValue([mockDataFactory.das()]);
            const schedule = await service.getDailyScheduleForMember(1, '2024-10-24');

            expect(schedule).toHaveLength(1);
            expect(schedule[0].type).toBe(SlotType.EFFECTIVE_WORK);
        });

        it('should return an empty schedule when the RRULE does not apply to the requested date', async () => {
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(mockDataFactory.rpm())]);
            dasModelMock.findAll.mockResolvedValue([]);
            const schedule = await service.getDailyScheduleForMember(1, '2024-10-27'); // Un dimanche

            expect(schedule).toHaveLength(0);
        });

        it('should generate a correct schedule with multiple non-chevauchantes pauses', async () => {
            const rpmWithTwoBreaks = mockDataFactory.rpm({
                breaks: [
                    { id: 'b1', startTime: '10:30:00', endTime: '10:45:00', breakType: BreakType.SHORT_REST },
                    { id: 'b2', startTime: '12:30:00', endTime: '13:15:00', breakType: BreakType.MEAL },
                ]
            });
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(rpmWithTwoBreaks)]);
            dasModelMock.findAll.mockResolvedValue([]);
            const schedule = await service.getDailyScheduleForMember(1, '2024-10-25');

            expect(schedule).toHaveLength(5); // WORK - BREAK - WORK - BREAK - WORK
            expect(schedule.map(s => s.type)).toEqual(['WORK', 'SHORT_REST', 'WORK', 'MEAL', 'WORK']);
        });
    });

    describe('Cache Logic', () => {
        it('should return the schedule from cache if available', async () => {
            const cachedData = [{ type: 'TRAINING_EXTERNAL' }] as any;
            cacheServiceMock.get.mockResolvedValue(cachedData);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-24');

            expect(schedule).toBe(cachedData);
            expect(rpmAssignmentModelMock.findAll).not.toHaveBeenCalled();
            expect(dasModelMock.findAll).not.toHaveBeenCalled();
        });

        it('should correctly set data in cache after a successful calculation', async () => {
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(mockDataFactory.rpm())]);
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-25');

            expect(cacheServiceMock.set).toHaveBeenCalledTimes(1);
            const expectedCacheKey = 'schedule:estId10:membId1:date2024-10-25';
            expect(cacheServiceMock.set).toHaveBeenCalledWith(expectedCacheKey, schedule, 900);
        });

        describe('Cache Invalidation Logic (Cross-Service)', () => {
            /**
             * NOTE ARCHITECTURALE : Les tests ci-dessous sont conceptuels. L'invalidation du cache
             * ne sera pas déclenchée directement par `getDailyScheduleForMember`. Elle sera déclenchée
             * par d'autres services (ex: `RecurringPlanningModelService`) via un système d'événements
             * comme proposé en Phase 3. Ces tests valident que nous pouvons générer la bonne clé de cache
             * qui sera utilisée par les autres services pour l'invalidation.
             */
            it('should have a predictable cache key format for invalidation', () => {
                // @ts-ignore - Accès à une méthode privée pour les besoins du test
                const key = service.scheduleCacheKey(10, 1, '2024-10-25');
                expect(key).toBe('schedule:estId10:membId1:date2024-10-25');
                // Dans le test du service de RPM, on vérifierait :
                // expect(cacheService.delete).toHaveBeenCalledWith('schedule:estId10:membId1:date*');
            });
        });
    });

    describe('Edge Cases: Time, Timezones, and DST', () => {

        it('should handle a day of transition to Daylight Saving Time (Spring Forward)', async () => {
            jest.useFakeTimers().setSystemTime(new Date('2024-03-31T10:00:00.000Z')); // DST day in Paris
            const rpm = mockDataFactory.rpm({
                globalStartTime: '01:00:00', globalEndTime: '04:00:00',
                rruleString: 'FREQ=WEEKLY;BYDAY=SU',
                breaks: []
            });
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(rpm)]);
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-03-31');

            // Le créneau semble durer 3h, mais à cause du saut de 02h à 03h, il dure 2h.
            // Notre service doit retourner les heures locales correctes, la lib de date gère le reste.
            expect(schedule).toHaveLength(1);
            expect(schedule[0]).toMatchObject({ startTime: '01:00:00', endTime: '04:00:00' });
        });

        it('should handle a day of transition from Daylight Saving Time (Fall Back)', async () => {
            jest.useFakeTimers().setSystemTime(new Date('2024-10-27T10:00:00.000Z')); // DST end day in Paris
            const rpm = mockDataFactory.rpm({
                globalStartTime: '01:00:00', globalEndTime: '04:00:00',
                rruleString: 'FREQ=WEEKLY;BYDAY=SU',
                breaks: []
            });
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(rpm)]);
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-27');

            // Le créneau semble durer 3h, mais à cause du retour de 03h à 02h, il dure 4h.
            expect(schedule).toHaveLength(1);
            expect(schedule[0]).toMatchObject({ startTime: '01:00:00', endTime: '04:00:00' });
        });

        it('should function predictably in a timezone without DST', async () => {
            membershipModelMock.findByPk.mockResolvedValue(mockDataFactory.membership({ establishment: { timezone: 'Asia/Tokyo' } }));
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(mockDataFactory.rpm())]);
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-25');
            expect(schedule.length).toBeGreaterThan(0); // S'assurer qu'un planning est généré
            expect(schedule.map(s => s.type)).toEqual(['WORK', 'MEAL', 'WORK']);
        });
    });

    describe('Edge Cases: Complex Interval & Overlap Logic', () => {
        beforeEach(() => {
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(mockDataFactory.rpm())]);
        });

        it('should handle a DAS that perfectly covers an RPM break', async () => {
            const das = mockDataFactory.das({ startTime: '12:00:00', endTime: '13:00:00', slotType: SlotType.TRAINING_EXTERNAL });
            dasModelMock.findAll.mockResolvedValue([das]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-24');

            expect(schedule.map(s => s.type)).toEqual(['WORK', 'TRAINING_EXTERNAL', 'WORK']);
            expect(schedule[1]).toMatchObject({ startTime: '12:00:00', endTime: '13:00:00' });
        });

        it('should handle a DAS fully contained within an RPM break', async () => {
            const das = mockDataFactory.das({ startTime: '12:15:00', endTime: '12:45:00', slotType: SlotType.TRAINING_EXTERNAL });
            dasModelMock.findAll.mockResolvedValue([das]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-24');

            // La pause est fragmentée par le DAS
            expect(schedule.map(s => s.type)).toEqual(['WORK', 'MEAL', 'TRAINING_EXTERNAL', 'MEAL', 'WORK']);
            expect(schedule.map(s => s.startTime)).toEqual(['09:00:00', '12:00:00', '12:15:00', '12:45:00', '13:00:00']);
        });

        it('should handle a DAS overlapping a break and a work block', async () => {
            const das = mockDataFactory.das({ startTime: '11:30:00', endTime: '12:30:00', slotType: SlotType.TRAINING_EXTERNAL });
            dasModelMock.findAll.mockResolvedValue([das]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-24');

            expect(schedule.map(s => s.type)).toEqual(['WORK', 'TRAINING_EXTERNAL', 'MEAL', 'WORK']);
            expect(schedule.map(s => s.startTime)).toEqual(['09:00:00', '11:30:00', '12:30:00', '13:00:00']);
            expect(schedule.map(s => s.endTime)).toEqual(['11:30:00', '12:30:00', '13:00:00', '17:00:00']);
        });

        it('should correctly calculate the FIRST day of an overnight shift with a break', async () => {
            const overnightRpm = mockDataFactory.rpm({
                rruleString: 'FREQ=WEEKLY;BYDAY=WE,TH', // Mercredi et Jeudi
                globalStartTime: '22:00:00', globalEndTime: '06:00:00',
                breaks: [{ id: 'b-night', startTime: '23:30:00', endTime: '00:30:00', breakType: 'MEAL' }]
            });
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(overnightRpm)]);
            dasModelMock.findAll.mockResolvedValue([]);

            // Action : On teste le Jeudi 24/10. On s'attend à voir la fin du créneau du Mercredi ET le début de celui du Jeudi.
            const scheduleDay1 = await service.getDailyScheduleForMember(1, '2024-10-24');

            // Le planning complet pour le 24 contient la fin du créneau du 23 ET le début du créneau du 24.
            expect(scheduleDay1.map(s => s.type)).toEqual(['MEAL', 'WORK', 'WORK', 'MEAL']);

            // Fin du créneau de la veille (23/10)
            expect(scheduleDay1[0]).toMatchObject({ type: 'MEAL', startTime: '00:00:00', endTime: '00:30:00' });
            expect(scheduleDay1[1]).toMatchObject({ type: 'WORK', startTime: '00:30:00', endTime: '06:00:00' });

            // Début du créneau du jour (24/10)
            expect(scheduleDay1[2]).toMatchObject({ type: 'WORK', startTime: '22:00:00', endTime: '23:30:00' });
            expect(scheduleDay1[3]).toMatchObject({ type: 'MEAL', startTime: '23:30:00', endTime: '23:59:59' });
        });

        it('should correctly calculate the SECOND day of an overnight shift with a break', async () => {
            const overnightRpm = mockDataFactory.rpm({
                rruleString: 'FREQ=WEEKLY;BYDAY=TH', // Seulement le Jeudi
                globalStartTime: '22:00:00', globalEndTime: '06:00:00',
                breaks: [{ id: 'b-night', startTime: '23:30:00', endTime: '00:30:00', breakType: 'MEAL' }]
            });
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(overnightRpm)]);
            dasModelMock.findAll.mockResolvedValue([]);

            // Action : On teste le Vendredi 25/10. On ne s'attend qu'à voir la fin du créneau du Jeudi.
            const scheduleDay2 = await service.getDailyScheduleForMember(1, '2024-10-25');

            expect(scheduleDay2.map(s => s.type)).toEqual(['MEAL', 'WORK']);
            expect(scheduleDay2[0]).toMatchObject({ startTime: '00:00:00', endTime: '00:30:00' });
            expect(scheduleDay2[1]).toMatchObject({ startTime: '00:30:00', endTime: '06:00:00' });
        });
    });

    describe('Edge Cases: Multiple RPM Assignments', () => {
        it('should merge slots from two non-overlapping RPM assignments on the same day', async () => {
            const morningRpm = mockDataFactory.rpm({ globalStartTime: '09:00:00', globalEndTime: '12:00:00', breaks: [] });
            const afternoonRpm = mockDataFactory.rpm({ id: 101, globalStartTime: '14:00:00', globalEndTime: '17:00:00', breaks: [] });
            rpmAssignmentModelMock.findAll.mockResolvedValue([
                mockDataFactory.rpmAssignment(morningRpm),
                mockDataFactory.rpmAssignment(afternoonRpm),
            ]);
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-25');

            expect(schedule).toHaveLength(2);
            expect(schedule[0]).toMatchObject({ startTime: '09:00:00', endTime: '12:00:00' });
            expect(schedule[1]).toMatchObject({ startTime: '14:00:00', endTime: '17:00:00' });
        });

        it('should correctly merge slots from two overlapping RPM assignments', async () => {
            const baseRpm = mockDataFactory.rpm({ globalStartTime: '09:00:00', globalEndTime: '14:00:00', breaks: [] });
            const overlapRpm = mockDataFactory.rpm({ id: 101, globalStartTime: '12:00:00', globalEndTime: '17:00:00', breaks: [] });
            rpmAssignmentModelMock.findAll.mockResolvedValue([
                mockDataFactory.rpmAssignment(baseRpm),
                mockDataFactory.rpmAssignment(overlapRpm),
            ]);
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-25');

            // L'implémentation actuelle fusionne les blocs de même type.
            expect(schedule).toHaveLength(1);
            expect(schedule[0]).toMatchObject({ startTime: '09:00:00', endTime: '17:00:00' });
        });
    });

    describe('Adversarial Cases & Error Handling', () => {
        it('should throw MembershipNotFoundError if member does not exist', async () => {
            membershipModelMock.findByPk.mockResolvedValue(null);
            await expect(service.getDailyScheduleForMember(999, '2024-10-24')).rejects.toThrow(MembershipNotFoundError);
        });

        it('should throw TimezoneConfigurationError if establishment has no timezone', async () => {
            membershipModelMock.findByPk.mockResolvedValue(mockDataFactory.membership({ establishment: { timezone: null } }));
            await expect(service.getDailyScheduleForMember(1, '2024-10-24')).rejects.toThrow(TimezoneConfigurationError);
        });

        it('should not throw if rruleString is malformed and return an empty schedule', async () => {
            const corruptedRpm = mockDataFactory.rpm({ rruleString: 'THIS IS NOT A VALID RRULE' });
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(corruptedRpm)]);
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, '2024-10-24');
            expect(schedule).toHaveLength(0);
        });

        it('should handle an RRULE with a COUNT that excludes the requested date', async () => {
            // Règle: tous les jours, mais seulement pour 2 jours à partir du 2024-10-24.
            const rruleWithCount = 'FREQ=DAILY;COUNT=2';
            const rpm = mockDataFactory.rpm({ rruleString: rruleWithCount, referenceDate: '2024-10-24' });
            rpmAssignmentModelMock.findAll.mockResolvedValue([mockDataFactory.rpmAssignment(rpm)]);
            dasModelMock.findAll.mockResolvedValue([]);

            // Le 26/10 est le 3ème jour, il devrait être exclu.
            const schedule = await service.getDailyScheduleForMember(1, '2024-10-26');
            expect(schedule).toHaveLength(0);
        });
    });
});