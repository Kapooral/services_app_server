// tests/services/availability.unit.test.ts
import { Op } from 'sequelize';
import moment from 'moment-timezone';
import { RRule, Frequency } from 'rrule';
import { AvailabilityService, SLOT_CHECK_INTERVAL_MINUTES } from '../../src/services/availability.service'; // Importation de la classe réelle
import db from '../../src/models';
import { AppError } from '../../src/errors/app.errors';
import { ServiceNotFoundError } from '../../src/errors/service.errors';
import { EstablishmentNotFoundError } from '../../src/errors/establishment.errors';
import { BookingAttributes, BookingStatus } from '../../src/models/Booking';
import { TimeOffRequestStatus } from '../../src/models/TimeOffRequest';
import { StaffAvailabilityAttributes } from '../../src/models/StaffAvailability';

// Mock des dépendances (MODÈLES DB), PAS le service lui-même
jest.mock('../../src/models', () => ({
    Establishment: { findByPk: jest.fn() },
    Service: { findByPk: jest.fn() },
    AvailabilityRule: { findOne: jest.fn() },
    AvailabilityOverride: { findAll: jest.fn() },
    Booking: { findAll: jest.fn() },
    TimeOffRequest: { findOne: jest.fn() },
    StaffAvailability: { findAll: jest.fn() },
}));

const utcDate = (isoString: string): Date => new Date(isoString);
const parisTZ = 'Europe/Paris';
const utcTZ = 'UTC';

interface TimeInterval { start: Date; end: Date; }


describe('AvailabilityService', () => {
    let availabilityService: AvailabilityService;

    const mockEstablishmentModel = db.Establishment as jest.Mocked<typeof db.Establishment>;
    const mockServiceModel = db.Service as jest.Mocked<typeof db.Service>;
    const mockAvailabilityRuleModel = db.AvailabilityRule as jest.Mocked<typeof db.AvailabilityRule>;
    const mockAvailabilityOverrideModel = db.AvailabilityOverride as jest.Mocked<typeof db.AvailabilityOverride>;
    const mockBookingModel = db.Booking as jest.Mocked<typeof db.Booking>;
    const mockTimeOffRequestModel = db.TimeOffRequest as jest.Mocked<typeof db.TimeOffRequest>;
    const mockStaffAvailabilityModel = db.StaffAvailability as jest.Mocked<typeof db.StaffAvailability>;


    beforeEach(() => {
        availabilityService = new AvailabilityService();
        jest.clearAllMocks(); // Efface les mocks des modèles DB
        jest.useRealTimers(); // S'assurer que les timers réels sont utilisés par défaut
    });

    afterEach(() => {
        jest.useRealTimers(); // Nettoyage final des timers
    });


    describe('getAvailableSlots', () => {
        const serviceId = 1;
        const establishmentId = 10;
        const mockServiceDefault = {
            id: serviceId,
            establishment_id: establishmentId,
            duration_minutes: 60,
            is_active: true,
            establishment: { id: establishmentId, is_validated: true, timezone: parisTZ },
        };

        let getEstablishmentOpenIntervalsUTCMock: jest.SpyInstance;

        beforeEach(() => {
            // @ts-ignore
            getEstablishmentOpenIntervalsUTCMock = jest.spyOn(AvailabilityService.prototype as any, 'getEstablishmentOpenIntervalsUTC');
        });

        it('Scénario 1.1: should return correct slots for a standard open day without overrides or bookings', async () => {
            mockServiceModel.findByPk.mockResolvedValue(mockServiceDefault as any); // duration_minutes: 60
            getEstablishmentOpenIntervalsUTCMock.mockResolvedValue([
                { start: moment.tz('2024-07-01 09:00', parisTZ).utc().toDate(), end: moment.tz('2024-07-01 17:00', parisTZ).utc().toDate() }
            ]);
            mockBookingModel.findAll.mockResolvedValue([]);

            const slots = await availabilityService.getAvailableSlots(serviceId, '2024-07-01');

            const expectedSlots: string[] = [];
            let currentSlotStart = moment.tz('2024-07-01 09:00', parisTZ);
            const openEnd = moment.tz('2024-07-01 17:00', parisTZ);
            const serviceDuration = mockServiceDefault.duration_minutes;

            while(currentSlotStart.clone().add(serviceDuration, 'minutes').isSameOrBefore(openEnd)) {
                expectedSlots.push(currentSlotStart.clone().utc().toISOString());
                currentSlotStart.add(SLOT_CHECK_INTERVAL_MINUTES, 'minutes'); // Le service itère par SLOT_CHECK_INTERVAL_MINUTES
            }
            expect(slots).toEqual(expectedSlots);
        });

        it('Scénario 1.2: should exclude booked slots', async () => {
            mockServiceModel.findByPk.mockResolvedValue(mockServiceDefault as any);
            getEstablishmentOpenIntervalsUTCMock.mockResolvedValue([
                { start: moment.tz('2024-07-01 09:00', parisTZ).utc().toDate(), end: moment.tz('2024-07-01 17:00', parisTZ).utc().toDate() }
            ]);
            mockBookingModel.findAll.mockResolvedValue([
                { start_datetime: moment.tz('2024-07-01 10:00', parisTZ).utc().toDate(), end_datetime: moment.tz('2024-07-01 11:00', parisTZ).utc().toDate() }
            ]as any);

            const slots = await availabilityService.getAvailableSlots(serviceId, '2024-07-01');
            expect(slots).not.toContain('2024-07-01T08:00:00.000Z');
            expect(slots).toContain('2024-07-01T07:00:00.000Z');
            expect(slots).toContain('2024-07-01T09:00:00.000Z');
        });

        it('Scénario 1.3: should respect unavailability overrides (mocked via getEstablishmentOpenIntervalsUTC)', async () => {
            mockServiceModel.findByPk.mockResolvedValue(mockServiceDefault as any);
            getEstablishmentOpenIntervalsUTCMock.mockResolvedValue([
                { start: moment.tz('2024-07-01 09:00', parisTZ).utc().toDate(), end: moment.tz('2024-07-01 12:00', parisTZ).utc().toDate() },
                { start: moment.tz('2024-07-01 13:00', parisTZ).utc().toDate(), end: moment.tz('2024-07-01 17:00', parisTZ).utc().toDate() }
            ]);
            mockBookingModel.findAll.mockResolvedValue([]);

            const slots = await availabilityService.getAvailableSlots(serviceId, '2024-07-01');
            expect(slots).not.toContain('2024-07-01T10:00:00.000Z');
            expect(slots).toContain('2024-07-01T09:00:00.000Z');
            expect(slots).toContain('2024-07-01T11:00:00.000Z');
        });

        it('Scénario 2.1: should return empty array if no opening rule for the day', async () => {
            mockServiceModel.findByPk.mockResolvedValue(mockServiceDefault as any);
            getEstablishmentOpenIntervalsUTCMock.mockResolvedValue([]);
            mockBookingModel.findAll.mockResolvedValue([]);

            const slots = await availabilityService.getAvailableSlots(serviceId, '2024-07-01');
            expect(slots).toEqual([]);
        });

        it('Scénario 2.2: should return empty array if service duration is larger than remaining open interval', async () => {
            mockServiceModel.findByPk.mockResolvedValue({ ...mockServiceDefault, duration_minutes: 60 } as any);
            getEstablishmentOpenIntervalsUTCMock.mockResolvedValue([
                { start: moment.tz('2024-07-01 09:00', parisTZ).utc().toDate(), end: moment.tz('2024-07-01 09:30', parisTZ).utc().toDate() }
            ]);
            mockBookingModel.findAll.mockResolvedValue([]);

            const slots = await availabilityService.getAvailableSlots(serviceId, '2024-07-01');
            expect(slots).toEqual([]);
        });

        it('Scénario 2.3: should exclude past slots for the current day', async () => {
            jest.useFakeTimers();
            const todayDateString = moment().tz(parisTZ).format('YYYY-MM-DD');

            const mockedNowParis = moment.tz(`${todayDateString}T11:30:00`, parisTZ);
            jest.setSystemTime(mockedNowParis.toDate());

            mockServiceModel.findByPk.mockResolvedValue(mockServiceDefault as any); // duration 60 min
            getEstablishmentOpenIntervalsUTCMock.mockResolvedValue([
                {
                    start: moment.tz(`${todayDateString} 09:00`, 'YYYY-MM-DD HH:mm', parisTZ).utc().toDate(),
                    end: moment.tz(`${todayDateString} 17:00`, 'YYYY-MM-DD HH:mm', parisTZ).utc().toDate()
                }
            ]);
            mockBookingModel.findAll.mockResolvedValue([]);

            const slots = await availabilityService.getAvailableSlots(serviceId, todayDateString);

            // CORRECTION DE L'ATTENTE POUR ÉCHEC 1
            // Si SLOT_CHECK_INTERVAL_MINUTES = 15 et now est 11:30:00 Paris (09:30:00 UTC si Paris = UTC+2)
            // La logique du service est `slotStartUTC < nowUTC`.
            // - Slot 11:15 Paris (09:15 UTC): 09:15 < 09:30 -> true. continue. slotStartUTC devient 09:15 + 15min = 09:30 UTC.
            // - Prochaine itération: slotStartUTC est 09:30 UTC. 09:30 < 09:30 -> false. Ce slot est ajouté.
            // Donc le premier slot attendu est 11:30 Paris.
            const expectedFirstSlotUTC = moment.tz(`${todayDateString} 11:30`, 'YYYY-MM-DD HH:mm', parisTZ).utc().toISOString();

            expect(slots.length).toBeGreaterThan(0);
            if (slots.length > 0) {
                expect(slots[0]).toBe(expectedFirstSlotUTC);
            }
            // Le slot de 11h00 Paris (09:00 UTC) devrait être exclu
            expect(slots).not.toContain(moment.tz(`${todayDateString} 11:00`, 'YYYY-MM-DD HH:mm', parisTZ).utc().toISOString());
            // Le slot de 11h15 Paris (09:15 UTC) devrait être exclu
            expect(slots).not.toContain(moment.tz(`${todayDateString} 11:15`, 'YYYY-MM-DD HH:mm', parisTZ).utc().toISOString());

            jest.useRealTimers();
        });

        it('Scénario 3.1: should throw ServiceNotFoundError if serviceId is non-existent', async () => {
            mockServiceModel.findByPk.mockResolvedValue(null);
            await expect(availabilityService.getAvailableSlots(999, '2024-07-01')).rejects.toThrow(ServiceNotFoundError);
        });

        it('Scénario 3.2: should throw EstablishmentNotFoundError if establishment is not validated', async () => {
            mockServiceModel.findByPk.mockResolvedValue({ ...mockServiceDefault, establishment: { ...mockServiceDefault.establishment, is_validated: false } } as any);
            await expect(availabilityService.getAvailableSlots(serviceId, '2024-07-01')).rejects.toThrow(new EstablishmentNotFoundError("Establishment is not validated."));
        });

        it('Scénario 3.3: should throw ServiceNotFoundError if service is inactive', async () => {
            mockServiceModel.findByPk.mockResolvedValue({ ...mockServiceDefault, is_active: false } as any);
            await expect(availabilityService.getAvailableSlots(serviceId, '2024-07-01')).rejects.toThrow(new ServiceNotFoundError("Service is inactive."));
        });

        it('Scénario 3.4: should throw AppError for invalid dateString', async () => {
            mockServiceModel.findByPk.mockResolvedValue(mockServiceDefault as any);
            await expect(availabilityService.getAvailableSlots(serviceId, 'INVALID-DATE')).rejects.toThrow(new AppError('InvalidDateFormat', 400, 'Invalid date string or timezone for establishment: INVALID-DATE, Europe/Paris'));
        });

        it('Scénario 3.5: should throw AppError if establishment timezone is not configured', async () => {
            mockServiceModel.findByPk.mockResolvedValue({ ...mockServiceDefault, establishment: { ...mockServiceDefault.establishment, timezone: null } } as any);
            await expect(availabilityService.getAvailableSlots(serviceId, '2024-07-01')).rejects.toThrow(new AppError('ConfigurationError', 500, `Establishment ID ${establishmentId} does not have a timezone configured.`));
        });
    });

    describe('isMemberAvailableForSlot', () => {
        const memberId = 1;
        const slotStart = utcDate('2024-07-08T10:00:00Z');
        const slotEnd = utcDate('2024-07-08T11:00:00Z');

        let getMemberNetWorkingPeriodsUTCMock: jest.SpyInstance;

        beforeEach(() => {
            // @ts-ignore
            getMemberNetWorkingPeriodsUTCMock = jest.spyOn(AvailabilityService.prototype as any, 'getMemberNetWorkingPeriodsUTC');
        });

        it('Scénario 1.1.1 (StaffAvailability): Member available (within net working period)', async () => {
            getMemberNetWorkingPeriodsUTCMock.mockResolvedValue([
                { start: utcDate('2024-07-08T09:00:00Z'), end: utcDate('2024-07-08T17:00:00Z') }
            ]);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockBookingModel.findAll.mockResolvedValue([]);

            const result = await availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, utcTZ);
            expect(result).toEqual({ available: true });
        });

        it('Scénario 1.1.2 (StaffAvailability): Member unavailable (outside net working period)', async () => {
            getMemberNetWorkingPeriodsUTCMock.mockResolvedValue([
                { start: utcDate('2024-07-08T12:00:00Z'), end: utcDate('2024-07-08T17:00:00Z') }
            ]);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockBookingModel.findAll.mockResolvedValue([]);

            const result = await availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, utcTZ);
            expect(result).toEqual({ available: false, reason: expect.stringContaining('not scheduled to work') });
        });

        it('Scénario 1.2.1 (TimeOffRequest): Member unavailable due to approved time off covering the slot', async () => {
            getMemberNetWorkingPeriodsUTCMock.mockResolvedValue([
                { start: utcDate('2024-07-08T09:00:00Z'), end: utcDate('2024-07-08T17:00:00Z') }
            ]);
            mockTimeOffRequestModel.findOne.mockResolvedValue({
                startDate: '2024-07-08', endDate: '2024-07-08', type: 'PAID_LEAVE', status: TimeOffRequestStatus.APPROVED
            } as any);
            mockBookingModel.findAll.mockResolvedValue([]);

            const result = await availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, utcTZ);
            expect(result).toEqual({ available: false, reason: expect.stringContaining('approved time off') });
        });

        it('Scénario 1.2.3 (TimeOffRequest): Pending/Rejected/Cancelled time off does NOT make member unavailable', async () => {
            getMemberNetWorkingPeriodsUTCMock.mockResolvedValue([
                { start: utcDate('2024-07-08T09:00:00Z'), end: utcDate('2024-07-08T17:00:00Z') }
            ]);
            mockTimeOffRequestModel.findOne.mockImplementation(async (options: any) => {
                if (options.where.status === TimeOffRequestStatus.APPROVED) return null;
                return null;
            });
            mockBookingModel.findAll.mockResolvedValue([]);

            const result = await availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, utcTZ);
            expect(result).toEqual({ available: true });
        });

        it('Scénario 1.3.1 (Booking): Member unavailable due to existing confirmed booking', async () => {
            getMemberNetWorkingPeriodsUTCMock.mockResolvedValue([
                { start: utcDate('2024-07-08T09:00:00Z'), end: utcDate('2024-07-08T17:00:00Z') }
            ]);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);

            interface MockedBookingForTest extends Partial<BookingAttributes> {
                get: jest.Mock<Partial<BookingAttributes>, []>;
            }
            const conflictingBookingData: Partial<BookingAttributes> = { id: 50, start_datetime: slotStart, end_datetime: slotEnd };
            const conflictingBookingMock: MockedBookingForTest = {
                ...conflictingBookingData,
                get: jest.fn(() => conflictingBookingData),
            };
            mockBookingModel.findAll.mockResolvedValue([conflictingBookingMock] as any);

            const result = await availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, utcTZ);
            expect(result.available).toBe(false);
            expect(result.reason).toMatch(/other booking\(s\)/);
            expect(result.conflictingBookings).toEqual([conflictingBookingData]);
        });

        it('Scénario 1.3.2 (Booking): Member available if conflicting booking is excluded', async () => {
            getMemberNetWorkingPeriodsUTCMock.mockResolvedValue([
                { start: utcDate('2024-07-08T09:00:00Z'), end: utcDate('2024-07-08T17:00:00Z') }
            ]);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            const bookingToExcludeId = 50;
            mockBookingModel.findAll.mockImplementation(async (options: any) => {
                if (options.where.id && options.where.id[Op.ne] === bookingToExcludeId) {
                    return [];
                }
                return [{ id: bookingToExcludeId, start_datetime: slotStart, end_datetime: slotEnd }] as any;
            });

            const result = await availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, utcTZ, bookingToExcludeId);
            expect(result).toEqual({ available: true });
        });

        it('Scénario 2.3 (Edge Case): Member unavailable if no working periods', async () => {
            getMemberNetWorkingPeriodsUTCMock.mockResolvedValue([]);
            mockTimeOffRequestModel.findOne.mockResolvedValue(null);
            mockBookingModel.findAll.mockResolvedValue([]);

            const result = await availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, utcTZ);
            expect(result).toEqual({ available: false, reason: expect.stringContaining('not scheduled to work') });
        });

        it('Scénario 3.1 (Adversarial): should throw AppError if establishmentTimezone is not provided', async () => {
            await expect(availabilityService.isMemberAvailableForSlot(memberId, slotStart, slotEnd, null as any))
                .rejects.toThrow(new AppError('ConfigurationError', 500, 'Establishment timezone is required for member availability check.'));
        });
    });

    describe('getMemberNetWorkingPeriodsUTC (private method - testing its core logic)', () => {
        const memberId = 1;
        const establishmentTimezoneForTest = parisTZ;
        const queryDateStringInEstTZ = '2024-07-01';
        const queryStartUTCForTest = moment.tz(queryDateStringInEstTZ, 'YYYY-MM-DD', establishmentTimezoneForTest).startOf('day').utc().toDate();
        const queryEndUTCForTest = moment.tz(queryDateStringInEstTZ, 'YYYY-MM-DD', establishmentTimezoneForTest).endOf('day').utc().toDate();

        beforeEach(() => {
            jest.restoreAllMocks();
        });

        it('Scenario: Règle simple isWorking=true', async () => {
            console.log('\n[TEST_DEBUG_SIMPLE_RULE] --- Start Debug Logs ---');
            console.log('[TEST_DEBUG_SIMPLE_RULE] availabilityService instance constructor name:', availabilityService.constructor.name);
            console.log('[TEST_DEBUG_SIMPLE_RULE] typeof availabilityService.getMemberNetWorkingPeriodsUTC (direct access):', typeof (availabilityService as any).getMemberNetWorkingPeriodsUTC);
            console.log('[TEST_DEBUG_SIMPLE_RULE] Is availabilityService.getMemberNetWorkingPeriodsUTC a Jest mock (direct access)?', jest.isMockFunction((availabilityService as any).getMemberNetWorkingPeriodsUTC));
            console.log('[TEST_DEBUG_SIMPLE_RULE] typeof AvailabilityService.prototype.getMemberNetWorkingPeriodsUTC:', typeof AvailabilityService.prototype['getMemberNetWorkingPeriodsUTC' as keyof AvailabilityService]);
            console.log('[TEST_DEBUG_SIMPLE_RULE] --- End Debug Logs ---\n');

            const simpleRRuleString = 'FREQ=WEEKLY;BYDAY=MO;DTSTART=20240701T090000';

            const mockStaffAvailabilities: StaffAvailabilityAttributes[] = [{
                id: 1, membershipId: memberId, rruleString: simpleRRuleString, durationMinutes: 120,
                isWorking: true,
                effectiveStartDate: new Date('2024-07-01T00:00:00.000Z'), // Date JS (UTC) pour le 1er juillet
                effectiveEndDate: null,
                description: 'Test rule - simple working period', createdAt: new Date(), updatedAt: new Date(),
            }];
            mockStaffAvailabilityModel.findAll.mockResolvedValue(mockStaffAvailabilities as any[]);
            console.log('[TEST_SIMPLE_RULE] mockStaffAvailabilityModel.findAll configured.');

            console.log(`[TEST_SIMPLE_RULE] Calling getMemberNetWorkingPeriodsUTC (via prototype.call) with relevant args...`);

            const periods = await (availabilityService as any).getMemberNetWorkingPeriodsUTC(
                memberId,
                queryStartUTCForTest, // Reste 2024-07-01 UTC pour la fenêtre de requête
                queryEndUTCForTest,   // Reste 2024-07-01 UTC pour la fenêtre de requête
                establishmentTimezoneForTest
            );

            console.log('[TEST_SIMPLE_RULE] periods received:', periods);

            expect(periods).toHaveLength(1);
            if (Array.isArray(periods) && periods.length > 0) {
                // ATTENTE CORRIGÉE: DTSTART 20240101T090000 (Paris)
                // Le 1er juillet 2024 est un Lundi.
                // Donc une occurrence le 2024-07-01 à 09:00 Paris.
                // Si Paris est UTC+2, cela correspond à 2024-07-01T07:00:00Z.
                const expectedStartUTC = moment.tz('2024-07-01T09:00:00', 'YYYY-MM-DDTHH:mm:ss', establishmentTimezoneForTest).utc().toDate();
                const expectedEndUTC = moment(expectedStartUTC).add(120, 'minutes').utc().toDate();

                expect(periods[0].start.toISOString()).toBe(expectedStartUTC.toISOString());
                expect(periods[0].end.toISOString()).toBe(expectedEndUTC.toISOString());
            }
            console.log('[TEST_SIMPLE_RULE] Test finished.');
        });

        it('Scenario: Combinaison de règles (pause)', async () => {
            console.log('[TEST_PAUSE_RULE] Starting test...');
            const establishmentTimezone = parisTZ;

            const staffAvailabilities: StaffAvailabilityAttributes[] = [
                {
                    id: 2, membershipId: memberId,
                    rruleString: 'FREQ=DAILY;DTSTART=20240701T090000', durationMinutes: 8 * 60, isWorking: true,
                    effectiveStartDate: new Date('2024-07-01T00:00:00.000Z'), effectiveEndDate: null,
                    description: 'Full day work', createdAt: new Date(), updatedAt: new Date(),
                },
                {
                    id: 3, membershipId: memberId,
                    rruleString: 'FREQ=DAILY;DTSTART=20240701T120000', durationMinutes: 60, isWorking: false,
                    effectiveStartDate: new Date('2024-07-01T00:00:00.000Z'), effectiveEndDate: null,
                    description: 'Lunch break', createdAt: new Date(), updatedAt: new Date(),
                }
            ];
            mockStaffAvailabilityModel.findAll.mockResolvedValue(staffAvailabilities as any);
            console.log('[TEST_PAUSE_RULE] mockStaffAvailabilityModel.findAll configured.');

            // NOUVEL APPEL
            const periods = await (availabilityService as any).getMemberNetWorkingPeriodsUTC(memberId, queryStartUTCForTest, queryEndUTCForTest, establishmentTimezone);

            expect(periods).toHaveLength(2);
            if (Array.isArray(periods) && periods.length === 2) {
                // ATTENTES CORRIGÉES: Basées sur les DTSTART locaux Paris
                // Travail: 09:00-17:00 Paris. Pause: 12:00-13:00 Paris.
                // Net: [09:00-12:00 Paris UTC, 13:00-17:00 Paris UTC]
                const expectedStart1 = moment.tz('2024-07-01 09:00:00', 'YYYY-MM-DD HH:mm:ss', establishmentTimezone).utc().toDate();
                const expectedEnd1 = moment.tz('2024-07-01 12:00:00', 'YYYY-MM-DD HH:mm:ss', establishmentTimezone).utc().toDate();
                const expectedStart2 = moment.tz('2024-07-01 13:00:00', 'YYYY-MM-DD HH:mm:ss', establishmentTimezone).utc().toDate();
                const expectedEnd2 = moment.tz('2024-07-01 17:00:00', 'YYYY-MM-DD HH:mm:ss', establishmentTimezone).utc().toDate();

                periods.sort((a: TimeInterval, b: TimeInterval) => a.start.getTime() - b.start.getTime());
                expect(periods[0].start.toISOString()).toBe(expectedStart1.toISOString());
                expect(periods[0].end.toISOString()).toBe(expectedEnd1.toISOString());
                expect(periods[1].start.toISOString()).toBe(expectedStart2.toISOString());
                expect(periods[1].end.toISOString()).toBe(expectedEnd2.toISOString());
            }
            console.log('[TEST_PAUSE_RULE] Test finished.');
        });

        it('Scenario: Gestion rruleString invalide (sans freq)', async () => {
            console.log('[TEST_INVALID_RRULE] Starting test...');
            const staffRuleId = 99;
            const invalidRRuleString = 'DTSTART=20240701T090000Z'; // Pas de FREQ
            const staffAvailabilities: StaffAvailabilityAttributes[] = [{
                id: staffRuleId, membershipId: memberId,
                rruleString: invalidRRuleString,
                durationMinutes: 60, isWorking: true,
                effectiveStartDate: new Date('2024-07-01'), // Ou '2024-07-01T00:00:00.000Z' pour être clair
                effectiveEndDate: null,
                description: 'Invalid rule test', createdAt: new Date(), updatedAt: new Date()
            }];
            mockStaffAvailabilityModel.findAll.mockResolvedValue(staffAvailabilities as any);

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const periods = await (availabilityService as any).getMemberNetWorkingPeriodsUTC(memberId, queryStartUTCForTest, queryEndUTCForTest, utcTZ);

            // Note: Le queryStartUTCForTest est 2024-06-30T22:00:00.000Z (début du 1er Juillet à Paris)
            // Et effectiveStartDate est new Date('2024-07-01') qui est 2024-07-01T00:00:00.000Z si la machine est UTC
            // ou interprété localement. Il est préférable d'utiliser des strings ISO complètes ou des moments pour la clarté des effectiveDates.
            // Ici, on se concentre sur le message d'erreur.

            expect(periods).toHaveLength(0);

            // MODIFICATION ICI pour Test 3
            const expectedLogMessagePrefix = `[AVAIL_SVC_CLEAN_FREQ_ERROR] RRule options for StaffAvailability ID ${staffRuleId}: frequency (freq) is missing and cannot be inferred`;

            const wasCalledWithExpectedMessage = consoleErrorSpy.mock.calls.some(callArgs => {
                const logMessage = callArgs.find(arg => typeof arg === 'string' && arg.includes(expectedLogMessagePrefix)) as string;
                // Vérifier aussi que la originalRRuleString est dans le message, grâce au correctif du service
                return logMessage && logMessage.includes(`The rrule string was: "${invalidRRuleString}"`);
            });
            expect(wasCalledWithExpectedMessage).toBe(true);

            consoleErrorSpy.mockRestore();
            console.log('[TEST_INVALID_RRULE] Test finished.');
        });

        it('Scenario: Règle avec effectiveStartDate et effectiveEndDate', async () => {
            const staffAvailabilities: StaffAvailabilityAttributes[] = [{ // Changé Partial en StaffAvailabilityAttributes[]
                id: 4, membershipId: memberId,
                rruleString: 'FREQ=DAILY;DTSTART=20240701T090000', durationMinutes: 60, isWorking: true,
                effectiveStartDate: new Date('2024-07-10'),
                effectiveEndDate: new Date('2024-07-15'),
                description: 'Specific effective period', // CHAMP AJOUTÉ
                createdAt: new Date(), updatedAt: new Date(),
            }];
            mockStaffAvailabilityModel.findAll.mockResolvedValue(staffAvailabilities as any);
            const periods = await (availabilityService as any).getMemberNetWorkingPeriodsUTC(memberId, queryStartUTCForTest, queryEndUTCForTest, utcTZ);
            expect(periods).toHaveLength(0);
        });

    });
});