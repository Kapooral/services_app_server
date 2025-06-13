// src/services/daily-schedule.service.ts
import { ModelCtor, Op } from 'sequelize';
import moment from 'moment-timezone';
import { RRule, RRuleSet } from 'rrule';

import RecurringPlanningModelMemberAssignment from '../models/RecurringPlanningModelMemberAssignment';
import RecurringPlanningModel, { RPMBreak } from '../models/RecurringPlanningModel';
import DailyAdjustmentSlot, { DASTask } from '../models/DailyAdjustmentSlot';
import Establishment from '../models/Establishment';
import Membership from '../models/Membership';
import { SlotType, DefaultBlockType, BreakType } from '../types/planning.enums';

import { ICacheService } from './cache/cache.service.interface';
import { TimezoneConfigurationError, PlanningModuleError } from '../errors/planning.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';

export interface CalculatedSlot {
    startTime: string; // "HH:MM:SS"
    endTime: string;   // "HH:MM:SS"
    slotDate: string;  // "YYYY-MM-DD"
    type: SlotType | DefaultBlockType | BreakType;
    description?: string | null;
    source: 'RPM_ENVELOPE' | 'RPM_BREAK' | 'DAS';
    tasks?: DASTask[] | null;
    sourceRpmId?: number | null;
    sourceRpmBreakId?: string | null;
    sourceDasId?: number | null;
    isManualOverride?: boolean;
}

interface TimeBlock {
    start: moment.Moment;
    end: moment.Moment;
    type: SlotType | DefaultBlockType | BreakType;
    description?: string | null;
    source: 'RPM_ENVELOPE' | 'RPM_BREAK' | 'DAS';
    tasks?: DASTask[] | null;
    sourceRpmId?: number | null;
    sourceRpmBreakId?: string | null;
    sourceDasId?: number | null;
    isManualOverride?: boolean;
}

export class DailyScheduleService {
    constructor(
        private rpmMemberAssignmentModel: ModelCtor<RecurringPlanningModelMemberAssignment>,
        private dailyAdjustmentSlotModel: ModelCtor<DailyAdjustmentSlot>,
        private membershipModel: ModelCtor<Membership>,
        private cacheService: ICacheService
    ) {}

    private scheduleCacheKey(establishmentId: number, membershipId: number, dateStr: string): string {
        return `schedule:estId${establishmentId}:membId${membershipId}:date${dateStr}`;
    }

    private getMomentInTimezone(dateStr: string, timeStr: string, timezone: string): moment.Moment {
        if (!/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
            // Cette erreur devrait être prévenue par les validations Zod en amont.
            // Si elle arrive ici, c'est une incohérence de données ou un bug.
            throw new PlanningModuleError(
                'InvalidTimeFormatInternal',
                500,
                `Internal Error: Invalid time format "${timeStr}" encountered for date "${dateStr}" during schedule calculation.`,
                'INTERNAL_TIME_FORMAT_ERROR'
            );
        }
        const [hours, minutes, seconds] = timeStr.split(':').map(Number);
        return moment.tz(dateStr, timezone).set({ hours, minutes, seconds });
    }

    private async calculateRpmBaseBlocks(
        activeRpm: RecurringPlanningModel,
        targetDateStr: string,
        targetDateMoment: moment.Moment,
        establishmentTimezone: string
    ): Promise<TimeBlock[]> {
        let rpmBlocks: TimeBlock[] = [];
        const rruleSet = new RRuleSet();

        const ruleDtStart = this.getMomentInTimezone(activeRpm.referenceDate, activeRpm.globalStartTime, establishmentTimezone).toDate();

        try {
            const rruleOptions = RRule.parseString(activeRpm.rruleString);
            rruleOptions.dtstart = ruleDtStart;
            rruleOptions.tzid = establishmentTimezone
            rruleSet.rrule(new RRule(rruleOptions));

        } catch(e: any) {
            console.error(e)
            return [];
        }

        const occurrences = rruleSet.between(targetDateMoment.clone().startOf('day').toDate(), targetDateMoment.clone().endOf('day').toDate(), true);

        if (occurrences.length > 0) {
            const envelopeStart = this.getMomentInTimezone(targetDateStr, activeRpm.globalStartTime, establishmentTimezone);
            const envelopeEnd = this.getMomentInTimezone(targetDateStr, activeRpm.globalEndTime, establishmentTimezone);

            if (envelopeStart.isBefore(envelopeEnd)) {
                rpmBlocks.push({
                    start: envelopeStart, end: envelopeEnd, type: activeRpm.defaultBlockType,
                    source: 'RPM_ENVELOPE', sourceRpmId: activeRpm.id,
                    description: activeRpm.defaultBlockType === DefaultBlockType.UNAVAILABILITY ? (activeRpm.description || 'General Unavailability From Model') : activeRpm.description
                });

                if (activeRpm.breaks && activeRpm.breaks.length > 0) {
                    const breaksFromRpm: TimeBlock[] = activeRpm.breaks
                        // --- CORRECTION : AJOUT D'UN FILTRE POUR IGNORER LES PAUSES INCOHÉRENTES ---
                        .filter((b: RPMBreak) => b.startTime < b.endTime) // Ne garder que les pauses valides
                        .map((b: RPMBreak) => ({
                            start: this.getMomentInTimezone(targetDateStr, b.startTime, establishmentTimezone),
                            end: this.getMomentInTimezone(targetDateStr, b.endTime, establishmentTimezone),
                            type: b.breakType, description: b.description, source: 'RPM_BREAK' as const,
                            sourceRpmId: activeRpm!.id, sourceRpmBreakId: b.id
                        }))
                        .sort((a: TimeBlock, b: TimeBlock) => a.start.valueOf() - b.start.valueOf());

                    // Si après filtrage, il reste des pauses valides, on les applique
                    if (breaksFromRpm.length > 0) {
                        rpmBlocks = this.subtractAndInsertIntervals(rpmBlocks, breaksFromRpm);
                    }
                }
            }
        }
        return rpmBlocks;
    }

    private async getDasTimeBlocksForDay(
        membershipId: number,
        targetDateStr: string,
        establishmentTimezone: string
    ): Promise<TimeBlock[]> {
        const dailyAdjustmentsData = await this.dailyAdjustmentSlotModel.findAll({
            where: { membershipId, slotDate: targetDateStr }, order: [['startTime', 'ASC']],
        });
        return dailyAdjustmentsData.map(das => ({ /* ... map DAS to TimeBlock ... */
            start: this.getMomentInTimezone(targetDateStr, das.startTime, establishmentTimezone),
            end: this.getMomentInTimezone(targetDateStr, das.endTime, establishmentTimezone),
            type: das.slotType, description: das.description, source: 'DAS' as const,
            tasks: das.tasks, sourceDasId: das.id, isManualOverride: das.isManualOverride,
            sourceRpmId: das.sourceRecurringPlanningModelId,
        }));
    }

    async getDailyScheduleForMember(membershipId: number, targetDateStr: string): Promise<CalculatedSlot[]> {
        const member = await this.membershipModel.findByPk(membershipId, {
            include: [{ model: Establishment, as: 'establishment', required: true, attributes: ['id', 'timezone'] }]
        });

        if (!member || !member.establishment) {
            throw new MembershipNotFoundError(`Membership ID ${membershipId} not found or not associated with an establishment.`);
        }
        if (!member.establishment.timezone) {
            throw new TimezoneConfigurationError(`Timezone not configured for establishment ID : ${ member.establishment.id }`);
        }
        const establishmentTimezone = member.establishment.timezone;

        // **A. Vérification du Cache**
        const cacheKey = this.scheduleCacheKey(member.establishment.id, membershipId, targetDateStr);
        const cachedSchedule = await this.cacheService.get<CalculatedSlot[]>(cacheKey);
        if (cachedSchedule) { return cachedSchedule; }

        const targetDateMoment = moment.tz(targetDateStr, 'YYYY-MM-DD', establishmentTimezone).startOf('day');

        let scheduleTimeBlocks: TimeBlock[] = [];

        // 1. RPM Actif
        const activeAssignment = await this.rpmMemberAssignmentModel.findOne({
            where: {
                membershipId,
                assignmentStartDate: { [Op.lte]: targetDateStr },
                [Op.or]: [ { assignmentEndDate: { [Op.gte]: targetDateStr } }, { assignmentEndDate: null } ]
            },
            include: [{ model: RecurringPlanningModel, as: 'recurringPlanningModel', required: true }]
        });
        const activeRpm: RecurringPlanningModel | null = activeAssignment?.recurringPlanningModel || null;

        if (activeRpm) {
            scheduleTimeBlocks = await this.calculateRpmBaseBlocks(activeRpm, targetDateStr, targetDateMoment, establishmentTimezone);
        }

        // 2. DAS pour le Jour
        const dasTimeBlocks = await this.getDasTimeBlocksForDay(membershipId, targetDateStr, establishmentTimezone);

        // 3. Fusionner
        scheduleTimeBlocks = this.mergeAndOverrideIntervals(scheduleTimeBlocks, dasTimeBlocks);

        // 4. Formatage Final
        const finalCalculatedSlots = scheduleTimeBlocks
            .filter(block => block.start.isBefore(block.end))
            .sort((a, b) => a.start.valueOf() - b.start.valueOf())
            .map(block => ({ /* ... map to CalculatedSlot ... */
                startTime: block.start.format('HH:mm:ss'),
                endTime: block.end.format('HH:mm:ss'),
                slotDate: targetDateStr,
                type: block.type, description: block.description, source: block.source,
                tasks: block.tasks, sourceRpmId: block.sourceRpmId,
                sourceRpmBreakId: block.sourceRpmBreakId, sourceDasId: block.sourceDasId,
                isManualOverride: block.isManualOverride,
            }));

        // **B. Stockage dans le Cache avant de retourner**
        // TTL de 15 minutes pour les plannings journaliers, peuvent changer avec des DAS
        await this.cacheService.set(cacheKey, finalCalculatedSlots, 900);

        return finalCalculatedSlots;
    }

    private subtractAndInsertIntervals(
        baseIntervals: TimeBlock[],
        subtractingIntervals: TimeBlock[]
    ): TimeBlock[] {
        if (subtractingIntervals.length === 0) return baseIntervals;
        let currentResult = [...baseIntervals];

        for (const sub of subtractingIntervals) {
            const nextResult: TimeBlock[] = [];
            for (const base of currentResult) {
                if (base.source === 'RPM_BREAK' && sub.source === 'RPM_BREAK') { // Une pause RPM ne soustrait pas une autre pause RPM
                    nextResult.push(base);
                    continue;
                }
                if (sub.end.isSameOrBefore(base.start) || sub.start.isSameOrAfter(base.end)) {
                    nextResult.push(base); continue;
                }
                if (base.start.isBefore(sub.start)) {
                    nextResult.push({ ...base, end: sub.start.clone() });
                }
                const actualSubStart = moment.max(base.start, sub.start);
                const actualSubEnd = moment.min(base.end, sub.end);
                if (actualSubStart.isBefore(actualSubEnd)) {
                    nextResult.push({ ...sub, start: actualSubStart, end: actualSubEnd });
                }
                if (base.end.isAfter(sub.end)) {
                    nextResult.push({ ...base, start: sub.end.clone() });
                }
            }
            currentResult = nextResult; // Ne pas trier ici, trier à la fin pour performance
        }
        return currentResult; // Le filtrage et le tri se feront à la fin de getDailyScheduleForMember
    }

    private mergeAndOverrideIntervals(rpmGeneratedIntervals: TimeBlock[], dasIntervals: TimeBlock[]): TimeBlock[] {
        if (dasIntervals.length === 0) return rpmGeneratedIntervals;
        // Avec la garantie que les DAS ne se chevauchent pas entre eux (validé par DailyAdjustmentSlotService),
        // la logique est plus simple : chaque DAS "perce" les intervalles RPM.
        let currentTimeline = [...rpmGeneratedIntervals];

        for (const das of dasIntervals) { // Les DAS sont déjà triés par startTime
            const nextTimeline: TimeBlock[] = [];
            for (const block of currentTimeline) {
                // Si le bloc est un DAS, on le garde (ils ne se chevauchent pas)
                if (block.source === 'DAS') {
                    nextTimeline.push(block);
                    continue;
                }
                // Maintenant, block est un RPM_ENVELOPE ou RPM_BREAK
                // Cas 1: Pas de chevauchement entre block (RPM) et das
                if (das.end.isSameOrBefore(block.start) || das.start.isSameOrAfter(block.end)) {
                    nextTimeline.push(block);
                } else {
                    // Cas 2: Chevauchement. Le DAS "perce" le bloc RPM.
                    // Partie du bloc RPM avant le DAS
                    if (block.start.isBefore(das.start)) {
                        nextTimeline.push({ ...block, end: das.start.clone() });
                    }
                    // La partie du bloc RPM après le DAS (sera traitée implicitement par le prochain das ou la fin)
                    // ou ajoutée si le das ne couvre pas tout
                    if (block.end.isAfter(das.end)) {
                        // On ajoute un nouveau segment pour la partie après le DAS.
                        // Ce segment pourrait être affecté par d'autres DAS plus tard.
                        nextTimeline.push({ ...block, start: das.end.clone() });
                    }
                    // Le DAS lui-même sera ajouté plus tard dans sa propre itération s'il n'est pas déjà dans la timeline,
                    // ou plutôt, on construit la timeline finale en intégrant les DAS.
                }
            }
            currentTimeline = nextTimeline;
        }
        // Ajouter tous les DAS à la timeline "nettoyée" des blocs RPM
        currentTimeline.push(...dasIntervals);

        // Trier et filtrer les blocs de durée nulle
        return currentTimeline
            .filter(block => block.start.isBefore(block.end))
            .sort((a,b)=> a.start.valueOf() - b.start.valueOf());
    }
}