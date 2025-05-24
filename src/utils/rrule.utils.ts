// src/utils/rrule.utils.ts
import { RRule, Options as RRuleOptions, Weekday, ByWeekday } from 'rrule'; // Importer ByWeekday
import moment from 'moment-timezone';

export interface TimeInterval {
    start: Date; // Date UTC
    end: Date;   // Date UTC
}

/**
 * Assure que les options RRULE sont valides et complètes pour l'instanciation de RRule.
 * Applique les valeurs par défaut de rrule.js si nécessaire.
 */
function sanitizeRRuleOptions(
    parsedOptions: Partial<RRuleOptions>,
    effectiveStartDateString: string,
    establishmentTimezone: string
): RRuleOptions {
    const dtstart = parsedOptions.dtstart
        ? moment(parsedOptions.dtstart)
            .tz(establishmentTimezone)
            .year(moment.tz(effectiveStartDateString, 'YYYY-MM-DD', establishmentTimezone).year())
            .month(moment.tz(effectiveStartDateString, 'YYYY-MM-DD', establishmentTimezone).month())
            .date(moment.tz(effectiveStartDateString, 'YYYY-MM-DD', establishmentTimezone).date())
            .toDate()
        : moment.tz(effectiveStartDateString, 'YYYY-MM-DD', establishmentTimezone).startOf('day').toDate();

    let byweekday: ByWeekday | ByWeekday[] | null = null;
    if (Array.isArray(parsedOptions.byweekday)) {
        byweekday = parsedOptions.byweekday.map(val =>
            typeof val === 'number' ? val : (val as Weekday).weekday
        ) as ByWeekday[];
    } else if (parsedOptions.byweekday !== null && parsedOptions.byweekday !== undefined) { // S'assurer que ce n'est pas null/undefined avant d'accéder à .weekday
        byweekday = typeof parsedOptions.byweekday === 'number' ? parsedOptions.byweekday : (parsedOptions.byweekday as Weekday).weekday;
    }

    const count = parsedOptions.count === undefined ? null : parsedOptions.count;

    return {
        ...parsedOptions,
        freq: parsedOptions.freq!,
        dtstart: dtstart,
        interval: parsedOptions.interval ?? 1,
        wkst: parsedOptions.wkst === undefined || parsedOptions.wkst === null ? RRule.MO.weekday : parsedOptions.wkst,
        byweekday: byweekday,
        bynweekday: parsedOptions.bynweekday === undefined ? null : parsedOptions.bynweekday,
        count: count,
        bysetpos: parsedOptions.bysetpos === undefined ? null : parsedOptions.bysetpos,
        byhour: parsedOptions.byhour === undefined ? null : parsedOptions.byhour,
        byminute: parsedOptions.byminute === undefined ? null : parsedOptions.byminute,
        bysecond: parsedOptions.bysecond === undefined ? null : parsedOptions.bysecond,
        bymonth: parsedOptions.bymonth === undefined ? null : parsedOptions.bymonth,
        bymonthday: parsedOptions.bymonthday === undefined ? null : parsedOptions.bymonthday,
        bynmonthday: parsedOptions.bynmonthday === undefined ? null : parsedOptions.bynmonthday,
        byyearday: parsedOptions.byyearday === undefined ? null : parsedOptions.byyearday,
        byweekno: parsedOptions.byweekno === undefined ? null : parsedOptions.byweekno,
        byeaster: parsedOptions.byeaster === undefined ? null : parsedOptions.byeaster,
        until: parsedOptions.until === undefined ? null : parsedOptions.until,
        tzid: parsedOptions.tzid === undefined ? null : parsedOptions.tzid,
    };
}


/**
 * Calcule la date de fin réelle UTC d'une règle de récurrence.
 */
export function calculateRuleActualEndDateUTC(
    rruleString: string,
    durationMinutes: number,
    effectiveStartDateString: string,
    effectiveEndDateString: string | null | undefined,
    establishmentTimezone: string
): Date | null {
    let rruleOptionsFromInput: Partial<RRuleOptions>;
    try {
        if (!rruleString || !rruleString.includes('FREQ=')) {
            let eventStartMoment = moment.tz(effectiveStartDateString, 'YYYY-MM-DD', establishmentTimezone).startOf('day');
            const dtMatch = rruleString?.match(/DTSTART=(?:[^;T]*T)?([0-9]{2})([0-9]{2})([0-9]{2})/);
            if (dtMatch) {
                eventStartMoment.hour(parseInt(dtMatch[1],10)).minute(parseInt(dtMatch[2],10)).second(parseInt(dtMatch[3],10));
            }
            let eventEndMoment = eventStartMoment.clone().add(durationMinutes, 'minutes');

            if (effectiveEndDateString) {
                const effectiveEndMoment = moment.tz(effectiveEndDateString, 'YYYY-MM-DD', establishmentTimezone).endOf('day');
                if (eventEndMoment.isAfter(effectiveEndMoment)) {
                    eventEndMoment = effectiveEndMoment;
                }
            }
            return eventEndMoment.utc().toDate();
        }
        rruleOptionsFromInput = RRule.parseString(rruleString);
    } catch (e) {
        if (effectiveEndDateString) {
            return moment.tz(effectiveEndDateString, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate();
        }
        return null;
    }

    const finalRRuleOptions = sanitizeRRuleOptions(rruleOptionsFromInput, effectiveStartDateString, establishmentTimezone);
    let calculatedEndDate: Date | null = null;

    if (finalRRuleOptions.until) {
        calculatedEndDate = moment.tz(finalRRuleOptions.until, establishmentTimezone).endOf('day').utc().toDate();
    }

    if (finalRRuleOptions.count && finalRRuleOptions.count > 0) {
        const rule = new RRule(finalRRuleOptions);
        let lastOccurrenceStartLocal: Date | null = null;

        const occurrences = rule.all((_date, index) => index < finalRRuleOptions.count!);

        if (occurrences.length > 0) {
            lastOccurrenceStartLocal = occurrences[occurrences.length - 1];
        }


        if (lastOccurrenceStartLocal) {
            const lastOccurrenceEndUTC = moment(lastOccurrenceStartLocal)
                .tz(establishmentTimezone, true)
                .add(durationMinutes, 'minutes')
                .utc()
                .toDate();
            if (!calculatedEndDate || lastOccurrenceEndUTC < calculatedEndDate) {
                calculatedEndDate = lastOccurrenceEndUTC;
            }
        } else if (occurrences.length === 0 && !finalRRuleOptions.until) {
            return null;
        }
    }

    if (effectiveEndDateString) {
        const effectiveEndUTC = moment.tz(effectiveEndDateString, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate();
        if (!calculatedEndDate || effectiveEndUTC < calculatedEndDate) {
            calculatedEndDate = effectiveEndUTC;
        }
    }
    return calculatedEndDate;
}

/**
 * Génère les occurrences pour une règle dans une fenêtre de temps donnée.
 */
export function generateOccurrences(
    rruleInputString: string,
    durationMinutes: number,
    effectiveStartDateString: string,
    effectiveEndDateString: string | null | undefined,
    windowStart: Date, // UTC
    windowEnd: Date,   // UTC
    establishmentTimezone: string
): TimeInterval[] {
    const occurrences: TimeInterval[] = [];
    let rruleOptionsFromInput: Partial<RRuleOptions>;

    try {
        if (!rruleInputString || rruleInputString.trim() === '' || !rruleInputString.includes('FREQ=')) {
            // Gérer comme un événement unique
            let singleEventStartMoment = moment.tz(effectiveStartDateString, 'YYYY-MM-DD', establishmentTimezone).startOf('day');
            const dtMatch = rruleInputString?.match(/DTSTART=(?:[^;T]*T)?([0-9]{2})([0-9]{2})([0-9]{2})/);
            if (dtMatch) {
                singleEventStartMoment.hour(parseInt(dtMatch[1],10)).minute(parseInt(dtMatch[2],10)).second(parseInt(dtMatch[3],10));
            }

            const startUtc = singleEventStartMoment.clone().utc().toDate();
            const endUtc = moment(startUtc).add(durationMinutes, 'minutes').toDate();

            const ruleEffectiveStartUtc = moment.tz(effectiveStartDateString, 'YYYY-MM-DD', establishmentTimezone).startOf('day').utc().toDate();
            let ruleEffectiveEndUtc: Date | null = null;
            if (effectiveEndDateString) {
                ruleEffectiveEndUtc = moment.tz(effectiveEndDateString, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate();
            }

            if (startUtc < windowEnd && endUtc > windowStart && endUtc > ruleEffectiveStartUtc && (!ruleEffectiveEndUtc || startUtc < ruleEffectiveEndUtc)) {
                occurrences.push({ start: startUtc, end: endUtc });
            }
            return occurrences;
        }
        rruleOptionsFromInput = RRule.parseString(rruleInputString);
    } catch (e) {
        throw new Error(`Invalid RRULE string format for parsing: "${rruleInputString}". Original error: ${(e as Error).message}`);
    }

    // Assainir et compléter les options pour le constructeur RRule
    const finalRRuleOptions = sanitizeRRuleOptions(rruleOptionsFromInput, effectiveStartDateString, establishmentTimezone);

    const actualRuleEndDate = calculateRuleActualEndDateUTC(
        rruleInputString, // Repasser la string originale ici
        durationMinutes,
        effectiveStartDateString,
        effectiveEndDateString,
        establishmentTimezone
    );

    if (actualRuleEndDate) {
        if (!finalRRuleOptions.until || actualRuleEndDate < finalRRuleOptions.until) {
            finalRRuleOptions.until = actualRuleEndDate;
        }
    }

    if (finalRRuleOptions.until && moment(finalRRuleOptions.until).isBefore(moment(windowStart))) return [];
    if (moment(finalRRuleOptions.dtstart).isAfter(moment(windowEnd))) return [];

    const rule = new RRule(finalRRuleOptions);
    const localWindowStartForRrule = moment(windowStart).tz(establishmentTimezone).toDate();
    const localWindowEndForRrule = moment(windowEnd).tz(establishmentTimezone).toDate();

    const ruleOccurrencesLocal = rule.between(localWindowStartForRrule, localWindowEndForRrule, true);

    for (const localEventStart of ruleOccurrencesLocal) {
        const startUtc = moment(localEventStart).tz(establishmentTimezone, true).utc().toDate();
        const endUtc = moment(startUtc).add(durationMinutes, 'minutes').toDate();
        if (startUtc < windowEnd && endUtc > windowStart) {
            occurrences.push({ start: startUtc, end: endUtc });
        }
    }
    return occurrences;
}

export function intervalsOverlap(interval1: TimeInterval, interval2: TimeInterval): boolean {
    return interval1.start.getTime() < interval2.end.getTime() &&
        interval1.end.getTime() > interval2.start.getTime();
}