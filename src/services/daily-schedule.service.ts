// src/services/daily-schedule.service.ts

import { ModelCtor, Op } from 'sequelize';
import {RRule, RRuleSet, rrulestr} from 'rrule';
import { isBefore, isEqual, isAfter, format, max as dateMax, min as dateMin, subDays, addDays } from 'date-fns';
import * as tz from '../utils/timezone.helpers';

import db from '../models';
import RecurringPlanningModelMemberAssignment from '../models/RecurringPlanningModelMemberAssignment';
import RecurringPlanningModel, { RPMBreak } from '../models/RecurringPlanningModel';
import DailyAdjustmentSlot, { DASTask } from '../models/DailyAdjustmentSlot';
import Establishment from '../models/Establishment';
import Membership from '../models/Membership';
import { SlotType, DefaultBlockType, BreakType } from '../types/planning.enums';
import { ICacheService } from './cache/cache.service.interface';
import { TimezoneConfigurationError, PlanningModuleError } from '../errors/planning.errors';
import { MembershipNotFoundError } from '../errors/membership.errors';
import {parseDateTimeInTimezone, startOfDayInTimezone} from "../utils/timezone.helpers";

export interface CalculatedSlot {
    startTime: string; endTime: string; slotDate: string;
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
    start: Date; end: Date;
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

    private getUtcDateFromLocalTime(dateStr: string, timeStr: string, timezone: string): Date {
        const localDateTimeStr = `${dateStr} ${timeStr}`;
        return tz.parseDateTimeInTimezone(localDateTimeStr, '00:00:00', timezone);
    }

    private async findActiveAssignmentsForDate(
        membershipId: number,
        targetDateStr: string,
    ): Promise<RecurringPlanningModelMemberAssignment[]> {
        return await this.rpmMemberAssignmentModel.findAll({
            where: {
                membershipId,
                assignmentStartDate: { [Op.lte]: targetDateStr },
                [Op.or]: [
                    // Cas 1: L'affectation n'a pas de date de fin (elle est toujours active).
                    { assignmentEndDate: null },
                    // Cas 2: L'affectation a une date de fin qui est AU PLUS TÔT le jour J.
                    { assignmentEndDate: { [Op.gte]: targetDateStr } }
                ]
            },
            include: [{
                model: RecurringPlanningModel,
                as: 'recurringPlanningModel',
                required: true,
            }]
        });
    }

    private applyOverridesToTimeline(baseTimeline: TimeBlock[], overrideIntervals: TimeBlock[]): TimeBlock[] {
        if (overrideIntervals.length === 0) return baseTimeline;
        let currentTimeline = [...baseTimeline];

        for (const override of overrideIntervals) {
            const nextTimeline: TimeBlock[] = [];
            for (const base of currentTimeline) {
                // Cas 1: Pas de chevauchement. On garde le bloc de base.
                if (isBefore(override.end, base.start) || isEqual(override.end, base.start) || isAfter(override.start, base.end) || isEqual(override.start, base.end)) {
                    nextTimeline.push(base);
                    continue;
                }

                // Cas 2: Chevauchement. Le bloc de base est fragmenté.
                // Partie avant l'override
                if (isBefore(base.start, override.start)) {
                    nextTimeline.push({ ...base, end: override.start });
                }
                // Partie après l'override
                if (isAfter(base.end, override.end)) {
                    nextTimeline.push({ ...base, start: override.end });
                }
            }
            currentTimeline = nextTimeline;
        }
        // Ajouter les blocs d'override à la timeline "trouée"
        currentTimeline.push(...overrideIntervals);
        return currentTimeline;
    }

    /**
     * Prend une liste de blocs de base (l'enveloppe de travail), y soustrait les créneaux de pause,
     * puis retourne une nouvelle timeline contenant les blocs de travail restants ET les blocs de pause insérés.
     * @param envelopeBlocks - Les blocs de base à fragmenter (généralement un seul bloc de travail).
     * @param breaks - La liste des pauses (format DTO) à appliquer.
     * @param onDate - La date ('yyyy-MM-dd') pour laquelle les pauses sont calculées.
     * @param timezone - Le fuseau horaire de l'établissement.
     * @param rpmId - L'ID du RPM source, pour l'information de contexte dans les blocs.
     * @returns Une nouvelle liste de TimeBlock, triée implicitement par le processus.
     */
    private applyBreaksToEnvelope(
        envelopeBlocks: TimeBlock[],
        breaks: RPMBreak[],
        onDate: string,
        timezone: string,
        rpmId: number
    ): TimeBlock[] {
        if (!breaks || breaks.length === 0) return envelopeBlocks;

        const breakTimeBlocks: TimeBlock[] = breaks.map(b => {
            let breakStart = tz.parseDateTimeInTimezone(onDate, b.startTime, timezone);
            let breakEnd = tz.parseDateTimeInTimezone(onDate, b.endTime, timezone);

            if (isBefore(breakEnd, breakStart) || isEqual(breakEnd, breakStart)) {
                breakEnd = addDays(breakEnd, 1);
            }

            return {
                start: breakStart, end: breakEnd, type: b.breakType,
                description: b.description, source: 'RPM_BREAK',
                sourceRpmId: rpmId, sourceRpmBreakId: b.id,
            };
        });

        let currentWorkTimeline = [...envelopeBlocks];

        for (const breakBlock of breakTimeBlocks) {
            currentWorkTimeline = currentWorkTimeline.flatMap(workBlock => {
                const noOverlap = isBefore(breakBlock.end, workBlock.start) || isEqual(breakBlock.end, workBlock.start) ||
                    isAfter(breakBlock.start, workBlock.end) || isEqual(breakBlock.start, workBlock.end);
                if (noOverlap) return [workBlock];

                const fragments: TimeBlock[] = [];
                if (isBefore(workBlock.start, breakBlock.start)) {
                    fragments.push({ ...workBlock, end: breakBlock.start });
                }
                if (isAfter(workBlock.end, breakBlock.end)) {
                    fragments.push({ ...workBlock, start: breakBlock.end });
                }
                return fragments;
            });
        }

        // On retourne la timeline complète (travail fragmenté + pauses) pour le tri ultérieur
        return [...currentWorkTimeline, ...breakTimeBlocks];
    }

    private _mergeContiguousBlocks(timeline: TimeBlock[]): TimeBlock[] {
        if (timeline.length <= 1) {
            return timeline;
        }

        // Trier par heure de début
        const sortedTimeline = [...timeline].sort((a, b) => a.start.getTime() - b.start.getTime());

        const merged: TimeBlock[] = [sortedTimeline[0]];

        for (let i = 1; i < sortedTimeline.length; i++) {
            const current = merged[merged.length - 1];
            const next = sortedTimeline[i];

            // Si les blocs sont de types différents, on ne peut pas les fusionner
            if (current.type !== next.type) {
                merged.push(next);
                continue;
            }

            // Si le bloc suivant commence avant ou au moment où le bloc courant se termine (chevauchement ou contiguïté)
            if (isBefore(next.start, current.end) || isEqual(next.start, current.end)) {
                // On fusionne en étendant la fin du bloc courant
                current.end = dateMax([current.end, next.end]);
            } else {
                // Pas de chevauchement, on ajoute le bloc suivant comme un nouveau bloc
                merged.push(next);
            }
        }
        return merged;
    }

    private calculateRpmBaseBlocks(
        rpm: RecurringPlanningModel,
        windowStart: Date, // Date UTC
        windowEnd: Date,   // Date UTC
        timezone: string
    ): TimeBlock[] {
        let occurrences: Date[];
        const MAX_OCCURRENCES = 1000; // Sécurité contre les boucles infinies
        try {
            // DTSTART est crucial. On le construit dans le bon fuseau horaire.
            const dtstart = tz.parseDateTimeInTimezone(rpm.referenceDate, rpm.globalStartTime, timezone);
            const rule = rrulestr(rpm.rruleString, { dtstart });
            occurrences = rule.all((date, i) => i < MAX_OCCURRENCES).filter(occ =>
                (isAfter(occ, windowStart) || isEqual(occ, windowStart)) &&
                (isBefore(occ, windowEnd) || isEqual(occ, windowEnd))
            );
        } catch (e) {
            console.error(`Error parsing RRULE for RPM ID ${rpm.id}:`, e);
            return [];
        }

        const allBlocks: TimeBlock[] = [];
        for (const occ of occurrences) {
            const occDateStr = tz.formatInTimezone(occ, 'yyyy-MM-dd', timezone);

            const envelopeStart = tz.parseDateTimeInTimezone(occDateStr, rpm.globalStartTime, timezone);
            let envelopeEnd = tz.parseDateTimeInTimezone(occDateStr, rpm.globalEndTime, timezone);

            // Gérer le cas où un créneau finit le jour suivant (ex: 22:00 - 02:00)
            if (isBefore(envelopeEnd, envelopeStart) || isEqual(envelopeEnd, envelopeStart)) {
                envelopeEnd = addDays(envelopeEnd, 1);
            }

            let envelopeBlocks: TimeBlock[] = [{
                start: envelopeStart, end: envelopeEnd, type: rpm.defaultBlockType,
                source: 'RPM_ENVELOPE', sourceRpmId: rpm.id, description: rpm.description
            }];

            if (rpm.breaks && rpm.breaks.length > 0) {
                envelopeBlocks = this.applyBreaksToEnvelope(envelopeBlocks, rpm.breaks, occDateStr, timezone, rpm.id);
            }
            allBlocks.push(...envelopeBlocks);
        }
        return allBlocks;
    }

    public async getScheduleForRpm(rpmId: number, targetDateStr: string, establishmentId: number): Promise<Map<number, CalculatedSlot[]>> {
        const rpm = await db.RecurringPlanningModel.findByPk(rpmId, { where: { establishmentId } });
        if (!rpm) { return new Map(); }

        const establishmentTimezone = rpm.establishment.timezone

        const activeAssignments = await this.rpmMemberAssignmentModel.findAll({
            where: {
                recurringPlanningModelId: rpmId,
                assignmentStartDate: { [Op.lte]: targetDateStr },
                [Op.or]: [{ assignmentEndDate: { [Op.gte]: targetDateStr } }, { assignmentEndDate: null }]
            },
            include: [{ model: this.membershipModel, as: 'member', required: true, include: [{ model: Establishment, as: 'establishment', required: true }] }]
        });
        if (!activeAssignments.length) { return new Map(); }

        const memberIds = activeAssignments.map(a => a.membershipId);
        const allDasForDay = await this.dailyAdjustmentSlotModel.findAll({
            where: { membershipId: { [Op.in]: memberIds }, slotDate: targetDateStr }
        });

        const dasByMemberId = new Map<number, DailyAdjustmentSlot[]>();
        allDasForDay.forEach(das => {
            if (!dasByMemberId.has(das.membershipId)) { dasByMemberId.set(das.membershipId, []); }
            dasByMemberId.get(das.membershipId)!.push(das);
        });

        const targetDate = tz.startOfDayInTimezone(tz.parseDateTimeInTimezone(targetDateStr, '00:00:00', establishmentTimezone), establishmentTimezone)

        const finalScheduleMap = new Map<number, CalculatedSlot[]>();
        for (const assignment of activeAssignments) {
            // --- CORRECTION 1 : Type Guard ---
            // On vérifie que 'assignment.member' existe avant de l'utiliser.
            if (assignment.member) {
                const memberDas = dasByMemberId.get(assignment.membershipId) || [];
                const memberSchedule = await this.calculateSingleMemberSchedule(assignment.member, targetDate, [assignment], memberDas);
                finalScheduleMap.set(assignment.membershipId, memberSchedule);
            }
        }
        return finalScheduleMap;
    }

    public async getDailyScheduleForMember(membershipId: number, targetDateStr: string): Promise<CalculatedSlot[]> {
        const member = await this.membershipModel.findByPk(membershipId, { include: [{ model: Establishment, as: 'establishment', required: true }] });

        if (!member) { throw new MembershipNotFoundError(`Membership ID ${membershipId} not found.`); }
        if (!member.establishment?.timezone) { throw new TimezoneConfigurationError(`Timezone not found for member ${membershipId}`); }

        const timezone = member.establishment.timezone;
        // La date de référence est le début du jour J dans le fuseau horaire de l'établissement.
        const targetDateStartOfDay = tz.startOfDayInTimezone(tz.parseDateTimeInTimezone(targetDateStr, '00:00:00', timezone), timezone);

        const cacheKey = this.scheduleCacheKey(member.establishment.id, membershipId, targetDateStr);
        const cachedSchedule = await this.cacheService.get<CalculatedSlot[]>(cacheKey);
        if (cachedSchedule) { return cachedSchedule; }

        const activeAssignments = await this.findActiveAssignmentsForDate(membershipId, targetDateStr);
        const dasForDay = await this.dailyAdjustmentSlotModel.findAll({ where: { membershipId, slotDate: targetDateStr } });

        const finalSchedule = await this.calculateSingleMemberSchedule(member, targetDateStartOfDay, activeAssignments, dasForDay);

        await this.cacheService.set(cacheKey, finalSchedule, 900);

        return finalSchedule;
    }

    private async calculateSingleMemberSchedule(
        member: Membership,
        targetDate: Date, // Date UTC représentant le début du jour J dans le TZ de l'établissement
        assignments: RecurringPlanningModelMemberAssignment[],
        dasForDay: DailyAdjustmentSlot[]
    ): Promise<CalculatedSlot[]> {
        const timezone = member.establishment!.timezone!;

        // 1. Définir une fenêtre de clipping précise pour le jour J.
        const targetDayWindowEnd = tz.endOfDayInTimezone(targetDate, timezone);

        // 2. Définir une fenêtre de recherche ROBUSTE pour rrule.js
        // Elle doit être assez large pour voir l'intégralité des créneaux qui touchent le jour J.
        const searchWindowStart = subDays(targetDate, 1);

        // La fenêtre doit se terminer à la FIN du jour J+1 pour capturer
        // l'intégralité d'un créneau de nuit qui commence le jour J.
        const searchWindowEnd = tz.endOfDayInTimezone(addDays(targetDayWindowEnd, 1), timezone);

        // 3. Générer tous les blocs de base des RPM en utilisant la fenêtre de recherche robuste.
        let baseTimeline: TimeBlock[] = [];
        for (const assignment of assignments) {
            if (assignment.recurringPlanningModel) {
                const rpmBlocks = this.calculateRpmBaseBlocks(assignment.recurringPlanningModel, searchWindowStart, searchWindowEnd, timezone);
                baseTimeline.push(...rpmBlocks);
            }
        }
        baseTimeline = this._mergeContiguousBlocks(baseTimeline);

        // 4. Générer les blocs d'ajustement (DAS)
        const overrideBlocks: TimeBlock[] = dasForDay.map(das => ({
            start: tz.parseDateTimeInTimezone(das.slotDate, das.startTime, timezone),
            end: tz.parseDateTimeInTimezone(das.slotDate, das.endTime, timezone),
            type: das.slotType, description: das.description, source: 'DAS',
            tasks: das.tasks, sourceDasId: das.id, isManualOverride: das.isManualOverride
        }));

        // 5. Appliquer les overrides sur la timeline de base
        const mergedTimeline = this.applyOverridesToTimeline(baseTimeline, overrideBlocks);

        // 6. LE SEUL TRI QUI FAIT FOI : Assurer l'ordre chronologique avant le découpage
        const sortedTimeline = mergedTimeline.sort((a, b) => a.start.getTime() - b.start.getTime());

        // 7. Découper la timeline pour ne garder que ce qui est DANS le jour J
        const finalTimeline = sortedTimeline.map(block => ({
            ...block,
            start: dateMax([block.start, targetDate]),
            end: dateMin([block.end, targetDayWindowEnd]),
        })).filter(block => isBefore(block.start, block.end));

        // 8. Trier et formater pour la sortie (ce dernier tri est une sécurité, le plus important est le #6)
        return finalTimeline
            .sort((a, b) => a.start.getTime() - b.start.getTime())
            .map(block => ({
                startTime: tz.formatInTimezone(block.start, 'HH:mm:ss', timezone),
                endTime: tz.formatInTimezone(block.end, 'HH:mm:ss', timezone),
                slotDate: tz.formatInTimezone(block.start, 'yyyy-MM-dd', timezone),
                type: block.type, description: block.description, source: block.source,
                tasks: block.tasks, sourceRpmId: block.sourceRpmId, sourceRpmBreakId: block.sourceRpmBreakId,
                sourceDasId: block.sourceDasId, isManualOverride: block.isManualOverride,
            }));
    }

    private subtractAndInsertIntervals(baseIntervals: TimeBlock[], subtractingIntervals: TimeBlock[]): TimeBlock[] {
        if (subtractingIntervals.length === 0) return baseIntervals;
        let currentResult = [...baseIntervals];

        for (const sub of subtractingIntervals) {
            const nextResult: TimeBlock[] = [];
            for (const base of currentResult) {
                if (isBefore(sub.end, base.start) || isEqual(sub.end, base.start) || isAfter(sub.start, base.end) || isEqual(sub.start, base.end)) {
                    nextResult.push(base); continue;
                }
                if (isBefore(base.start, sub.start)) {
                    nextResult.push({ ...base, end: new Date(sub.start) });
                }
                const actualSubStart = dateMax([base.start, sub.start]);
                const actualSubEnd = dateMin([base.end, sub.end]);
                if (isBefore(actualSubStart, actualSubEnd)) {
                    nextResult.push({ ...sub, start: actualSubStart, end: actualSubEnd });
                }
                if (isAfter(base.end, sub.end)) {
                    nextResult.push({ ...base, start: new Date(sub.end) });
                }
            }
            currentResult = nextResult;
        }
        return currentResult;
    }

    private mergeAndOverrideIntervals(rpmGeneratedIntervals: TimeBlock[], dasIntervals: TimeBlock[]): TimeBlock[] {
        if (dasIntervals.length === 0) return rpmGeneratedIntervals;
        let currentTimeline = [...rpmGeneratedIntervals];

        for (const das of dasIntervals) {
            const nextTimeline: TimeBlock[] = [];
            for (const block of currentTimeline) {
                if (isBefore(das.end, block.start) || isEqual(das.end, block.start) || isAfter(das.start, block.end) || isEqual(das.start, block.end)) {
                    nextTimeline.push(block);
                } else {
                    if (isBefore(block.start, das.start)) {
                        nextTimeline.push({ ...block, end: new Date(das.start) });
                    }
                    if (isAfter(block.end, das.end)) {
                        nextTimeline.push({ ...block, start: new Date(das.end) });
                    }
                }
            }
            currentTimeline = nextTimeline;
        }
        currentTimeline.push(...dasIntervals);
        return currentTimeline;
    }
}