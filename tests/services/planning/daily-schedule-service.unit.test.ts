import { DailyScheduleService, CalculatedSlot } from '../../../src/services/daily-schedule.service';
import { TimezoneConfigurationError } from '../../../src/errors/planning.errors';
import { MembershipNotFoundError } from '../../../src/errors/membership.errors';
import { BreakType, DefaultBlockType, SlotType } from '../../../src/types/planning.enums';
import { ICacheService } from '../../../src/services/cache/cache.service.interface';
// On n'importe plus les modèles pour les mocker, car nous créons des objets manuels.

// --- Déclaration des Mocks et du Service ---
let rpmAssignmentModelMock: { findOne: jest.Mock };
let dasModelMock: { findAll: jest.Mock };
let membershipModelMock: { findByPk: jest.Mock };
let cacheServiceMock: jest.Mocked<ICacheService>;
let service: DailyScheduleService;

// --- Helpers de Données de Mock ---
const createMockSequelizeInstance = (data: any) => ({
    ...data,
    get: jest.fn().mockReturnValue(data),
});

const mockBasicMembershipData = {
    id: 1,
    establishmentId: 10,
    establishment: { id: 10, timezone: 'Europe/Paris' },
};

const createMockRpm = (overrides: any = {}) => ({
    id: 100, name: 'Standard Day', referenceDate: '2024-01-01',
    globalStartTime: '09:00:00', globalEndTime: '17:00:00',
    rruleString: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    defaultBlockType: DefaultBlockType.WORK,
    breaks: [{ id: 'break-1', startTime: '12:00:00', endTime: '13:00:00', breakType: BreakType.MEAL, description: 'Lunch' }],
    ...overrides,
});

const createMockRpmAssignment = (rpm: any) => ({
    id: 1000, membershipId: 1, recurringPlanningModelId: rpm.id,
    assignmentStartDate: '2024-01-01', assignmentEndDate: null,
    recurringPlanningModel: rpm,
});

const createMockDas = (overrides: any = {}) => ({
    id: 2000, membershipId: 1, slotDate: '2024-10-24',
    startTime: '14:00:00', endTime: '15:00:00',
    slotType: SlotType.EFFECTIVE_WORK, description: 'Special task',
    isManualOverride: true, tasks: [], establishmentId: 10,
    ...overrides,
});


describe('DailyScheduleService', () => {

    beforeEach(() => {
        // Initialisation des objets de mock explicites
        rpmAssignmentModelMock = { findOne: jest.fn() };
        dasModelMock = { findAll: jest.fn() };
        membershipModelMock = { findByPk: jest.fn() };
        cacheServiceMock = {
            get: jest.fn(), set: jest.fn(), delete: jest.fn(), flushAll: jest.fn(), deleteByPattern: jest.fn()
        };

        // Injection des mocks dans le constructeur du service. C'est la méthode la plus fiable.
        service = new DailyScheduleService(
            rpmAssignmentModelMock as any,
            dasModelMock as any,
            membershipModelMock as any,
            cacheServiceMock
        );
    });

    it('should return a basic work-break-work schedule for a standard RPM', async () => {
        const targetDate = '2024-10-24';
        const mockRpm = createMockRpm();
        const mockAssignment = createMockRpmAssignment(mockRpm);

        cacheServiceMock.get.mockResolvedValue(null);
        membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
        dasModelMock.findAll.mockResolvedValue([]);

        // LA CORRECTION DÉFINITIVE : On configure le mock pour qu'il retourne notre objet,
        // garantissant que `activeAssignment` sera peuplé.
        rpmAssignmentModelMock.findOne.mockResolvedValue(createMockSequelizeInstance(mockAssignment));

        const schedule = await service.getDailyScheduleForMember(1, targetDate);

        expect(rpmAssignmentModelMock.findOne).toHaveBeenCalled(); // Vérification de l'appel
        expect(schedule).toHaveLength(3);
        expect(schedule.map(s => s.type)).toEqual([DefaultBlockType.WORK, BreakType.MEAL, DefaultBlockType.WORK]);
    });

    it('should correctly insert a DAS, splitting the underlying RPM block', async () => {
        const targetDate = '2024-10-24';
        const mockRpm = createMockRpm();
        const mockAssignment = createMockRpmAssignment(mockRpm);
        const mockDas = createMockDas({ slotType: SlotType.TRAINING_EXTERNAL });

        cacheServiceMock.get.mockResolvedValue(null);
        membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
        dasModelMock.findAll.mockResolvedValue([createMockSequelizeInstance(mockDas)]);

        // Correction appliquée ici aussi
        rpmAssignmentModelMock.findOne.mockResolvedValue(createMockSequelizeInstance(mockAssignment));

        const schedule = await service.getDailyScheduleForMember(1, targetDate);

        expect(schedule).toHaveLength(5);
        expect(schedule.map(s => s.type)).toEqual([DefaultBlockType.WORK, BreakType.MEAL, DefaultBlockType.WORK, SlotType.TRAINING_EXTERNAL, DefaultBlockType.WORK]);
    });

    it('should return only DAS slots if no RPM assignment is active', async () => {
        const targetDate = '2024-10-24';
        const mockDas = createMockDas();

        cacheServiceMock.get.mockResolvedValue(null);
        membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
        dasModelMock.findAll.mockResolvedValue([createMockSequelizeInstance(mockDas)]);

        // Ce test était déjà correct car il mockait explicitement un retour null
        rpmAssignmentModelMock.findOne.mockResolvedValue(null);

        const schedule = await service.getDailyScheduleForMember(1, targetDate);

        expect(schedule).toHaveLength(1);
        expect(schedule[0].source).toBe('DAS');
    });

    // Les autres tests qui n'impliquaient pas de RPM n'ont pas besoin de modification de mock
    // mais on les garde pour la complétude.

    it('should return the schedule from cache if available', async () => {
        const targetDate = '2024-10-24';
        const cachedSchedule: CalculatedSlot[] = [{ startTime: '10:00:00', endTime: '11:00:00', slotDate: targetDate, type: SlotType.TRAINING_EXTERNAL, source: 'DAS', sourceDasId: 999 }];

        membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
        cacheServiceMock.get.mockResolvedValue(cachedSchedule);

        const schedule = await service.getDailyScheduleForMember(1, targetDate);

        expect(schedule).toEqual(cachedSchedule);
        expect(rpmAssignmentModelMock.findOne).not.toHaveBeenCalled();
    });

    it('should return an empty schedule when the RRULE does not apply to the requested date', async () => {
        const targetDate = '2024-10-27'; // Un dimanche
        const mockRpm = createMockRpm();
        const mockAssignment = createMockRpmAssignment(mockRpm);

        cacheServiceMock.get.mockResolvedValue(null);
        membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
        dasModelMock.findAll.mockResolvedValue([]);
        rpmAssignmentModelMock.findOne.mockResolvedValue(createMockSequelizeInstance(mockAssignment));

        const schedule = await service.getDailyScheduleForMember(1, targetDate);

        expect(schedule).toHaveLength(0);
    });

    it('should throw TimezoneConfigurationError if the establishment has no timezone', async () => {
        const targetDate = '2024-10-24';
        const memberWithoutTimezone = { ...mockBasicMembershipData, establishment: { id: 10, timezone: null } };
        membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(memberWithoutTimezone));

        await expect(service.getDailyScheduleForMember(1, targetDate)).rejects.toThrow(TimezoneConfigurationError);
    });

    it('should throw MembershipNotFoundError if member does not exist', async () => {
        const targetDate = '2024-10-24';
        membershipModelMock.findByPk.mockResolvedValue(null);

        await expect(service.getDailyScheduleForMember(999, targetDate)).rejects.toThrow(MembershipNotFoundError);
    });

    describe('when handling corrupted or invalid stored data', () => {

        it('should not throw and should ignore the RPM envelope if its times are inverted', async () => {
            // SCÉNARIO: Les données en BDD ont globalStartTime > globalEndTime
            const targetDate = '2024-10-24';
            const corruptedRpm = createMockRpm({ globalStartTime: '17:00:00', globalEndTime: '09:00:00' });
            const mockAssignment = createMockRpmAssignment(corruptedRpm);
            const mockDas = createMockDas({ startTime: '13:00:00', endTime: '14:00:00' });

            cacheServiceMock.get.mockResolvedValue(null);
            membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
            rpmAssignmentModelMock.findOne.mockResolvedValue(createMockSequelizeInstance(mockAssignment));
            dasModelMock.findAll.mockResolvedValue([createMockSequelizeInstance(mockDas)]);

            // On s'attend à ce que le service ne plante pas et retourne uniquement les DAS
            const schedule = await service.getDailyScheduleForMember(1, targetDate);

            expect(schedule).toHaveLength(1);
            expect(schedule[0].source).toBe('DAS');
        });

        it('should ignore an invalid break and calculate the rest of the schedule', async () => {
            // SCÉNARIO: Une pause en BDD a startTime > endTime
            const targetDate = '2024-10-24';
            const corruptedRpm = createMockRpm({
                breaks: [
                    { id: 'invalid-break', startTime: '14:00:00', endTime: '13:00:00', breakType: BreakType.MEAL },
                    { id: 'valid-break', startTime: '10:00:00', endTime: '10:15:00', breakType: BreakType.SHORT_REST }
                ]
            });
            const mockAssignment = createMockRpmAssignment(corruptedRpm);

            cacheServiceMock.get.mockResolvedValue(null);
            membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
            rpmAssignmentModelMock.findOne.mockResolvedValue(createMockSequelizeInstance(mockAssignment));
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, targetDate);

            // Le service doit ignorer la pause invalide et ne générer que les blocs de la pause valide.
            // Résultat attendu: Travail (09:00-10:00), Pause Valide (10:00-10:15), Travail (10:15-17:00)
            expect(schedule).toHaveLength(3);
            expect(schedule[1].type).toBe(BreakType.SHORT_REST);
        });

        it('should ignore a break that is outside the main RPM envelope', async () => {
            // SCÉNARIO: Une pause est en dehors des heures de travail du RPM
            const targetDate = '2024-10-24';
            const corruptedRpm = createMockRpm({ // Enveloppe 09:00-17:00
                breaks: [
                    { id: 'outside-break', startTime: '08:00:00', endTime: '08:30:00', breakType: BreakType.MEAL }
                ]
            });
            const mockAssignment = createMockRpmAssignment(corruptedRpm);

            cacheServiceMock.get.mockResolvedValue(null);
            membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
            rpmAssignmentModelMock.findOne.mockResolvedValue(createMockSequelizeInstance(mockAssignment));
            dasModelMock.findAll.mockResolvedValue([]);

            const schedule = await service.getDailyScheduleForMember(1, targetDate);

            // La pause étant en dehors de l'enveloppe, elle ne devrait pas la découper.
            // On s'attend à un seul bloc de travail de 9h à 17h.
            expect(schedule).toHaveLength(1);
            expect(schedule[0].type).toBe(DefaultBlockType.WORK);
            expect(schedule[0].startTime).toBe('09:00:00');
            expect(schedule[0].endTime).toBe('17:00:00');
        });

        it('should not throw if rruleString is malformed and should return an empty RPM schedule', async () => {
            // SCÉNARIO: La rruleString en BDD est invalide.
            const targetDate = '2024-10-24';
            const corruptedRpm = createMockRpm({ rruleString: 'THIS IS NOT A VALID RRULE' });
            const mockAssignment = createMockRpmAssignment(corruptedRpm);

            cacheServiceMock.get.mockResolvedValue(null);
            membershipModelMock.findByPk.mockResolvedValue(createMockSequelizeInstance(mockBasicMembershipData));
            rpmAssignmentModelMock.findOne.mockResolvedValue(createMockSequelizeInstance(mockAssignment));
            dasModelMock.findAll.mockResolvedValue([]);

            // Le service doit attraper l'erreur de la librairie rrule et continuer
            const schedule = await service.getDailyScheduleForMember(1, targetDate);

            // Le planning RPM est vide, le planning final est vide (car pas de DAS)
            expect(schedule).toHaveLength(0);
        });
    });
});