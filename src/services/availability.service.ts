// src/services/availability.service.ts
import { ModelCtor, WhereOptions, Op } from 'sequelize';
import { RRule, RRuleSet, Options as RRuleOptions, Frequency, Weekday  } from 'rrule';
import moment from 'moment-timezone';
import db from '../models';
import Establishment, { EstablishmentAttributes } from '../models/Establishment';
import AvailabilityRule from '../models/AvailabilityRule';
import AvailabilityOverride from '../models/AvailabilityOverride';
import Service from '../models/Service';
import Booking, { BookingAttributes, BookingStatus } from '../models/Booking';
import TimeOffRequest, { TimeOffRequestStatus } from '../models/TimeOffRequest';
import StaffAvailability, { StaffAvailabilityAttributes } from '../models/StaffAvailability';
import { ServiceNotFoundError } from '../errors/service.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';
import { AppError } from '../errors/app.errors';

interface TimeInterval {
    start: Date; // En UTC
    end: Date;   // En UTC
}

export const SLOT_CHECK_INTERVAL_MINUTES = 15;

export class AvailabilityService {
    private establishmentModel: ModelCtor<Establishment>;
    private availabilityRuleModel: ModelCtor<AvailabilityRule>;
    private availabilityOverrideModel: ModelCtor<AvailabilityOverride>;
    private serviceModel: ModelCtor<Service>;
    private bookingModel: ModelCtor<Booking>;
    private timeOffRequestModel: ModelCtor<TimeOffRequest>;
    private staffAvailabilityModel: ModelCtor<StaffAvailability>;

    constructor() {
        this.establishmentModel = db.Establishment;
        this.availabilityRuleModel = db.AvailabilityRule;
        this.availabilityOverrideModel = db.AvailabilityOverride;
        this.serviceModel = db.Service;
        this.bookingModel = db.Booking;
        this.timeOffRequestModel = db.TimeOffRequest;
        this.staffAvailabilityModel = db.StaffAvailability;
    }

    private subtractInterval(intervals: TimeInterval[], toSubtract: TimeInterval): TimeInterval[] {
        const result: TimeInterval[] = [];
        for (const interval of intervals) {
            if (interval.end <= toSubtract.start || interval.start >= toSubtract.end) {
                result.push(interval); continue;
            }
            if (interval.start < toSubtract.start && interval.end > toSubtract.start && interval.end <= toSubtract.end) {
                result.push({ start: interval.start, end: toSubtract.start });
            } else if (interval.start >= toSubtract.start && interval.start < toSubtract.end && interval.end > toSubtract.end) {
                result.push({ start: toSubtract.end, end: interval.end });
            } else if (interval.start >= toSubtract.start && interval.end <= toSubtract.end) {
                // Skip
            } else if (interval.start < toSubtract.start && interval.end > toSubtract.end) {
                result.push({ start: interval.start, end: toSubtract.start });
                result.push({ start: toSubtract.end, end: interval.end });
            }
        }
        return result;
    }

    private mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
        if (!intervals || intervals.length === 0) return [];
        intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
        const merged: TimeInterval[] = [{ ...intervals[0] }];
        for (let i = 1; i < intervals.length; i++) {
            const current = merged[merged.length - 1];
            const next = intervals[i];
            if (current.end >= next.start) {
                current.end = new Date(Math.max(current.end.getTime(), next.end.getTime()));
            } else {
                merged.push({ ...next });
            }
        }
        return merged;
    }

    private getDayBoundariesInUTC(dateString: string, establishmentTimezone: string): { dayStartUTC: Date, dayEndUTC: Date } {
        const establishmentMoment = moment.tz(dateString, 'YYYY-MM-DD', establishmentTimezone);
        if (!establishmentMoment.isValid()) {
            throw new AppError('InvalidDateFormat', 400, `Invalid date string or timezone for establishment: ${dateString}, ${establishmentTimezone}`);
        }
        const dayStartUTC = establishmentMoment.startOf('day').utc().toDate();
        const dayEndUTC = establishmentMoment.endOf('day').utc().toDate();
        return { dayStartUTC, dayEndUTC };
    }

    private cleanRRuleOptions(
        originalRRuleString: string,
        parsedOptions: Partial<RRuleOptions>, // Options issues de RRule.parseString()
        staffRuleContext?: { id: number | string; effectiveStartDate: string; },
        establishmentTimezoneForContext?: string
    ): RRuleOptions | null {
        const logPrefix = `[AVAIL_SVC_CLEAN_OPTS_R${staffRuleContext?.id}]`;
        console.log(`${logPrefix} START. originalRRuleString: "${originalRRuleString}", establishmentTimezone: ${establishmentTimezoneForContext}`);
        console.log(`${logPrefix} parsedOptions input from RRule.parseString():`, JSON.stringify(parsedOptions));

        const options: Partial<RRuleOptions> = { ...parsedOptions }; // Copie pour modifications locales
        let processedDtStart: Date | undefined = undefined;
        let processedUntil: Date | null = null; // Reste null si non défini

        // --- Analyse de DTSTART et UNTIL à partir de originalRRuleString ---
        let dtStartValueFromOriginal: string | undefined;
        let dtStartTzidFromOriginal: string | undefined;
        // Regex pour capturer DTSTART, son TZID optionnel, et la valeur date/heure
        const dtStartMatch = originalRRuleString.match(/DTSTART(?:;TZID=([^:=;]+))?(?::|=)([0-9T]+)/);
        if (dtStartMatch) {
            dtStartTzidFromOriginal = dtStartMatch[1]; // Groupe 1: TZID (peut être undefined)
            dtStartValueFromOriginal = dtStartMatch[2]; // Groupe 2: Valeur date/heure
        }

        let untilValueFromOriginal: string | undefined;
        let untilTzidFromOriginal: string | undefined; // UNTIL peut aussi avoir un TZID
        const untilMatch = originalRRuleString.match(/UNTIL(?:;TZID=([^:=;]+))?(?::|=)([0-9T]+)/);
        if (untilMatch) {
            untilTzidFromOriginal = untilMatch[1];
            untilValueFromOriginal = untilMatch[2];
        }
        console.log(`${logPrefix} Extracted from original string - DTSTART: ${dtStartValueFromOriginal}, TZID: ${dtStartTzidFromOriginal}`);
        console.log(`${logPrefix} Extracted from original string - UNTIL: ${untilValueFromOriginal}, TZID: ${untilTzidFromOriginal}`);


        // --- Traitement de dtstart ---
        console.log(`${logPrefix} --- Processing dtstart ---`);
        if (dtStartValueFromOriginal) {
            if (!dtStartValueFromOriginal.endsWith('Z') && !dtStartTzidFromOriginal && establishmentTimezoneForContext) {
                processedDtStart = moment.tz(dtStartValueFromOriginal, "YYYYMMDDTHHmmss", establishmentTimezoneForContext).toDate();
                console.log(`${logPrefix} dtstart (original local): Interpreted "${dtStartValueFromOriginal}" in timezone "${establishmentTimezoneForContext}" to UTC: ${processedDtStart?.toISOString()}`);
            } else if (dtStartTzidFromOriginal) {
                processedDtStart = moment.tz(dtStartValueFromOriginal, "YYYYMMDDTHHmmss", dtStartTzidFromOriginal).toDate();
                options.tzid = dtStartTzidFromOriginal; // Propager le tzid extrait aux options finales
                console.log(`${logPrefix} dtstart (original with TZID): Interpreted "${dtStartValueFromOriginal}" in timezone "${dtStartTzidFromOriginal}" to UTC: ${processedDtStart?.toISOString()}. RRule tzid set to: ${options.tzid}`);
            } else {
                if (parsedOptions.dtstart instanceof Date) {
                    processedDtStart = parsedOptions.dtstart;
                } else if (typeof parsedOptions.dtstart === 'string') {
                    processedDtStart = moment(parsedOptions.dtstart).toDate();
                }
                console.log(`${logPrefix} dtstart (original UTC/Z or no explicit TZID in string but context might be missing): Used value from RRule.parseString: ${processedDtStart?.toISOString()}`);
            }
        } else if (parsedOptions.dtstart instanceof Date) {
            processedDtStart = parsedOptions.dtstart;
            console.log(`${logPrefix} dtstart: No DTSTART in original string, used Date from RRule.parseString: ${processedDtStart?.toISOString()}`);
        } else if (typeof parsedOptions.dtstart === 'string') { // Si RRule.parseString retourne une string ISO
            processedDtStart = moment(parsedOptions.dtstart).toDate();
            console.log(`${logPrefix} dtstart: No DTSTART in original string, used string from RRule.parseString: ${processedDtStart?.toISOString()}`);
        }

        // Fallbacks pour dtstart si toujours non défini
        if (!(processedDtStart instanceof Date) && staffRuleContext && staffRuleContext.effectiveStartDate && establishmentTimezoneForContext) {
            // staffRuleContext.effectiveStartDate est maintenant de type string (YYYY-MM-DD)
            // donc plus besoin de la vérification instanceof Date ni du formatage avec moment().format()
            const effStartDateStr = staffRuleContext.effectiveStartDate; // C'est déjà une chaîne YYYY-MM-DD

            processedDtStart = moment.tz(effStartDateStr, 'YYYY-MM-DD', establishmentTimezoneForContext).startOf('day').toDate();
            console.log(`${logPrefix} dtstart: Fallback to effectiveStartDate of rule (${effStartDateStr} in ${establishmentTimezoneForContext}): ${processedDtStart?.toISOString()}`);
        }
        if (!(processedDtStart instanceof Date)) {
            console.error(`${logPrefix} [AVAIL_SVC_CLEAN_DTSTART_ERROR] RRule options for StaffAvailability ID ${staffRuleContext?.id}: dtstart is invalid after all processing. Original: "${originalRRuleString}". Defaulting to current date.`);
            processedDtStart = moment().startOf('day').toDate(); // Defaulting to now, might not be ideal but ensures a Date
        }
        console.log(`${logPrefix} Final processedDtStart: ${processedDtStart?.toISOString()}`);


        // --- Traitement de until --- (logique similaire à dtstart)
        console.log(`${logPrefix} --- Processing until ---`);
        if (untilValueFromOriginal) {
            if (!untilValueFromOriginal.endsWith('Z') && !untilTzidFromOriginal && establishmentTimezoneForContext) {
                processedUntil = moment.tz(untilValueFromOriginal, "YYYYMMDDTHHmmss", establishmentTimezoneForContext).toDate();
                console.log(`${logPrefix} until (original local): Interpreted "${untilValueFromOriginal}" in timezone "${establishmentTimezoneForContext}" to UTC: ${processedUntil?.toISOString()}`);
            } else if (untilTzidFromOriginal) {
                processedUntil = moment.tz(untilValueFromOriginal, "YYYYMMDDTHHmmss", untilTzidFromOriginal).toDate();
                // Si DTSTART a un TZID, RRule l'utilise pour UNTIL aussi. Pas besoin de setter options.tzid ici si dtstart en avait déjà un.
                // Si seul UNTIL a un TZID, c'est un cas étrange mais on respecte.
                if (!options.tzid) options.tzid = untilTzidFromOriginal;
                console.log(`${logPrefix} until (original with TZID): Interpreted "${untilValueFromOriginal}" in timezone "${untilTzidFromOriginal}" to UTC: ${processedUntil?.toISOString()}`);
            } else {
                if (parsedOptions.until instanceof Date) {
                    processedUntil = parsedOptions.until;
                } else if (typeof parsedOptions.until === 'string') {
                    processedUntil = moment(parsedOptions.until).toDate();
                }
                console.log(`${logPrefix} until (original UTC/Z or no context): Used value from RRule.parseString: ${processedUntil?.toISOString()}`);
            }
        } else if (parsedOptions.until instanceof Date) {
            processedUntil = parsedOptions.until;
            console.log(`${logPrefix} until: No UNTIL in original string, used Date from RRule.parseString: ${processedUntil?.toISOString()}`);
        } else if (typeof parsedOptions.until === 'string') { // Si RRule.parseString retourne une string ISO
            processedUntil = moment(parsedOptions.until).toDate();
            console.log(`${logPrefix} until: No UNTIL in original string, used string from RRule.parseString: ${processedUntil?.toISOString()}`);
        }
        console.log(`${logPrefix} Final processedUntil: ${processedUntil?.toISOString()}`);


        // --- freq ---
        console.log(`${logPrefix} --- Processing freq ---`);
        let freqValue = options.freq;
        const ruleIdForFreqLog = staffRuleContext ? `for StaffAvailability ID ${staffRuleContext.id}` : '(unknown rule)';
        console.log(`${logPrefix} Initial options.freq ${ruleIdForFreqLog}:`, freqValue);

        if (freqValue === undefined || freqValue === null) {
            // Si freq est absente, RRule.js essaie de l'inférer depuis les options BY*.
            // Si aucune option BY* n'est présente pour inférer, RRule() lèvera une erreur.
            // On logue seulement si nous aussi ne pouvons pas l'inférer (même si notre inférence ici est basique).
            if (!options.byweekday && !options.bymonthday && !options.byyearday && !options.byweekno && !options.bymonth) {
                console.error(`${logPrefix} [AVAIL_SVC_CLEAN_FREQ_ERROR] RRule options ${ruleIdForFreqLog}: frequency (freq) is missing and cannot be inferred. The rrule string was: "${originalRRuleString}".`);
                return null; // Règle invalide, ne pas continuer.
            }
        }
        // Si freqValue est fournie mais invalide
        if (freqValue !== undefined && freqValue !== null && (typeof freqValue !== 'number' || !Object.values(Frequency).includes(freqValue as Frequency))) {
            console.error(`${logPrefix} [AVAIL_SVC_CLEAN_FREQ_ERROR] Invalid RRule frequency value for ${ruleIdForFreqLog}: ${freqValue}. The rrule string was: "${originalRRuleString}".`);
            return null; // Règle invalide.
        }
        console.log(`${logPrefix} Final freqValue for RRule constructor (can be undefined if inferable by RRule lib) ${ruleIdForFreqLog}:`, freqValue);

        // Helper pour normaliser les valeurs optionnelles vers T | null
        const normalize = <T>(value: T | null | undefined): T | null => {
            return value === undefined ? null : value;
        };

        // Construction de l'objet final en respectant RRuleOptions
        const finalRuleOptions: RRuleOptions = {
            dtstart: processedDtStart as Date, // Assuré d'être une Date par les fallbacks
            until: processedUntil,             // Date | null
            freq: freqValue as Frequency,      // Peut être undefined, RRule gérera

            // Options avec des valeurs par défaut ou normalisées
            interval: options.interval === undefined ? 1 : options.interval,
            wkst: normalize(options.wkst as Weekday | number | null), // Cast pour la clarté, normalize gère undefined
            count: normalize(options.count),
            bysetpos: normalize(options.bysetpos),
            bymonth: normalize(options.bymonth),
            bymonthday: normalize(options.bymonthday),
            bynmonthday: normalize(options.bynmonthday), // Peut être un array de numéros négatifs
            byyearday: normalize(options.byyearday),
            byweekno: normalize(options.byweekno),
            byweekday: normalize(options.byweekday as Weekday | Weekday[] | null), // Weekday[] si plusieurs jours

            // Options souvent nulles par défaut si non présentes dans la rruleString
            byhour: normalize(options.byhour),
            byminute: normalize(options.byminute),
            bysecond: normalize(options.bysecond),

            // Propriétés requises par TS2739
            tzid: normalize(options.tzid), // Sera null si options.tzid est undefined
            bynweekday: normalize(options.bynweekday as Array<[number, number]> | null), // Type plus précis [number, number][] | null
            byeaster: normalize(options.byeaster),
        };

        console.log(`${logPrefix} Returning final RRule options:`, JSON.stringify(finalRuleOptions));
        return finalRuleOptions;
    }

    private async getEstablishmentOpenIntervalsUTC(
        establishmentId: number,
        dateString: string, // YYYY-MM-DD
        establishmentTimezone: string
    ): Promise<TimeInterval[]> {
        const { dayStartUTC, dayEndUTC } = this.getDayBoundariesInUTC(dateString, establishmentTimezone);
        const dayOfWeek = moment.tz(dateString, 'YYYY-MM-DD', establishmentTimezone).day();

        let openIntervals: TimeInterval[] = [];
        const rule = await this.availabilityRuleModel.findOne({
            where: { establishment_id: establishmentId, day_of_week: dayOfWeek }
        });

        if (rule && rule.start_time && rule.end_time) {
            const [startH, startM] = rule.start_time.split(':').map(Number);
            const [endH, endM] = rule.end_time.split(':').map(Number);
            const ruleStartMoment = moment.tz(dateString, 'YYYY-MM-DD', establishmentTimezone).hour(startH).minute(startM).second(0).millisecond(0);
            const ruleEndMoment = moment.tz(dateString, 'YYYY-MM-DD', establishmentTimezone).hour(endH).minute(endM).second(0).millisecond(0);
            if (ruleStartMoment.isBefore(ruleEndMoment)) {
                openIntervals.push({ start: ruleStartMoment.utc().toDate(), end: ruleEndMoment.utc().toDate() });
            }
        }

        const overrides = await this.availabilityOverrideModel.findAll({
            where: {
                establishment_id: establishmentId,
                start_datetime: { [Op.lt]: dayEndUTC },
                end_datetime: { [Op.gt]: dayStartUTC }
            },
            order: [['start_datetime', 'ASC']]
        });

        for (const override of overrides) {
            const overrideStartClamped = override.start_datetime < dayStartUTC ? dayStartUTC : override.start_datetime;
            const overrideEndClamped = override.end_datetime > dayEndUTC ? dayEndUTC : override.end_datetime;
            if (overrideStartClamped >= overrideEndClamped) continue;
            if (!override.is_available) {
                openIntervals = this.subtractInterval(openIntervals, { start: overrideStartClamped, end: overrideEndClamped });
            } else {
                openIntervals.push({ start: overrideStartClamped, end: overrideEndClamped });
            }
        }
        return this.mergeIntervals(openIntervals);
    }

    private async getMemberNetWorkingPeriodsUTC(
        membershipId: number,
        queryStartUTC: Date,
        queryEndUTC: Date,
        establishmentTimezone: string
    ): Promise<TimeInterval[]> {
        console.log(`[getMemberNetWorkingPeriodsUTC] Args: membershipId=${membershipId}, queryStartUTC=${queryStartUTC.toISOString()}, queryEndUTC=${queryEndUTC.toISOString()}, establishmentTimezone=${establishmentTimezone}`);

        const memberStaffAvailabilities = await this.staffAvailabilityModel.findAll({
            where: {
                membershipId: membershipId,
                effectiveStartDate: { [Op.lte]: moment(queryEndUTC).format('YYYY-MM-DD') },
                [Op.or]: [
                    { effectiveEndDate: { [Op.gte]: moment(queryStartUTC).format('YYYY-MM-DD') } },
                    { effectiveEndDate: null }
                ]
            }
        });
        console.log(`[getMemberNetWorkingPeriodsUTC] Found ${memberStaffAvailabilities.length} staff availabilities for member ${membershipId}.`);

        let workingIntervals: TimeInterval[] = [];
        let nonWorkingStaffRuleIntervals: TimeInterval[] = [];

        for (const staffRule of memberStaffAvailabilities) {
            console.log(`[getMemberNetWorkingPeriodsUTC] Processing staffRule ID: ${staffRule.id}, rruleString: "${staffRule.rruleString}"`);
            try {
                const rruleOptionsFromStr: Partial<RRuleOptions> = RRule.parseString(staffRule.rruleString);
                console.log(`[getMemberNetWorkingPeriodsUTC] Parsed options from rruleString for rule ${staffRule.id}:`, JSON.stringify(rruleOptionsFromStr, null, 2));

                const finalRRuleOptions = this.cleanRRuleOptions(
                    staffRule.rruleString,
                    rruleOptionsFromStr,
                    {
                        id: staffRule.id,
                        // staffRule.effectiveStartDate est déjà une string YYYY-MM-DD
                        effectiveStartDate: staffRule.effectiveStartDate
                    },
                    establishmentTimezone
                );
                console.log(`[getMemberNetWorkingPeriodsUTC] Final RRuleOptions for rule ${staffRule.id}:`, JSON.stringify(finalRRuleOptions, null, 2));


                if (finalRRuleOptions && !(finalRRuleOptions.dtstart instanceof Date)) {
                    console.error(`[getMemberNetWorkingPeriodsUTC] Skipped rule ${staffRule.id} due to invalid dtstart after cleaning.`);
                    continue;
                }
                if (!finalRRuleOptions) {
                    console.log(`[AVAIL_SVC_GET_PERIODS_LOOP] Skipping staffRule ID ${staffRule.id} due to invalid rrule options (e.g., missing freq) indicated by cleanRRuleOptions returning null.`);
                    continue; // Passer à la staffRule suivante
                }

                console.log(`[AVAIL_SVC_GET_PERIODS_LOOP] About to create RRule for rule ID ${staffRule.id} with options:`, JSON.stringify(finalRRuleOptions));
                const rule = new RRule(finalRRuleOptions);
                console.log(`[getMemberNetWorkingPeriodsUTC] RRule object created for rule ${staffRule.id}. Calling between(${queryStartUTC.toISOString()}, ${queryEndUTC.toISOString()})`);
                const occurrencesUTC = rule.between(queryStartUTC, queryEndUTC, true);
                console.log(`[getMemberNetWorkingPeriodsUTC] Found ${occurrencesUTC.length} occurrences for rule ${staffRule.id}`);

                for (const occUTC of occurrencesUTC) {
                    const occurrenceStartUTC = new Date(occUTC);
                    const occurrenceEndUTC = new Date(occurrenceStartUTC.getTime() + staffRule.durationMinutes * 60000);
                    console.log(`[getMemberNetWorkingPeriodsUTC] Rule ${staffRule.id} - Raw Occurrence: Start=${occurrenceStartUTC.toISOString()}, End=${occurrenceEndUTC.toISOString()}`);

                    const ruleEffectiveStartUTC = moment(staffRule.effectiveStartDate).tz(establishmentTimezone).startOf('day').utc().toDate();
                    const ruleEffectiveEndUTC = staffRule.effectiveEndDate ? moment(staffRule.effectiveEndDate).tz(establishmentTimezone).endOf('day').utc().toDate() : null;
                    console.log(`[getMemberNetWorkingPeriodsUTC] Rule ${staffRule.id} - Effective UTC: Start=${ruleEffectiveStartUTC.toISOString()}, End=${ruleEffectiveEndUTC ? ruleEffectiveEndUTC.toISOString() : 'null'}`);

                    let validStart = occurrenceStartUTC < ruleEffectiveStartUTC ? ruleEffectiveStartUTC : occurrenceStartUTC;
                    let validEnd = ruleEffectiveEndUTC && occurrenceEndUTC > ruleEffectiveEndUTC ? ruleEffectiveEndUTC : occurrenceEndUTC;

                    console.log(`[getMemberNetWorkingPeriodsUTC] Rule ${staffRule.id} - Clamped Occurrence: validStart=${validStart.toISOString()}, validEnd=${validEnd.toISOString()}`);

                    if (validEnd <= ruleEffectiveStartUTC || (ruleEffectiveEndUTC && validStart >= ruleEffectiveEndUTC)) {
                        console.log(`[getMemberNetWorkingPeriodsUTC] Rule ${staffRule.id} - Occurrence outside effective period. Skipping.`);
                        continue;
                    }
                    if (validStart >= validEnd) {
                        console.log(`[getMemberNetWorkingPeriodsUTC] Rule ${staffRule.id} - Occurrence has invalid duration after clamping (start >= end). Skipping.`);
                        continue;
                    }

                    if (staffRule.isWorking) {
                        workingIntervals.push({ start: validStart, end: validEnd });
                        console.log(`[getMemberNetWorkingPeriodsUTC] Rule ${staffRule.id} - Added to workingIntervals:`, { start: validStart.toISOString(), end: validEnd.toISOString() });
                    } else {
                        nonWorkingStaffRuleIntervals.push({ start: validStart, end: validEnd });
                        console.log(`[getMemberNetWorkingPeriodsUTC] Rule ${staffRule.id} - Added to nonWorkingStaffRuleIntervals:`, { start: validStart.toISOString(), end: validEnd.toISOString() });
                    }
                }

            } catch (e) {
                console.error(`[getMemberNetWorkingPeriodsUTC] Error processing rrule for StaffAvailability ID ${staffRule.id}: "${staffRule.rruleString}"`, e);
            }
        }

        console.log('[getMemberNetWorkingPeriodsUTC] workingIntervals before merge/subtract:', JSON.stringify(workingIntervals.map(i => ({s:i.start.toISOString(), e:i.end.toISOString()})), null, 2));
        console.log('[getMemberNetWorkingPeriodsUTC] nonWorkingStaffRuleIntervals before merge/subtract:', JSON.stringify(nonWorkingStaffRuleIntervals.map(i => ({s:i.start.toISOString(), e:i.end.toISOString()})), null, 2));

        let netWorkingPeriods = this.mergeIntervals(workingIntervals);
        console.log('[getMemberNetWorkingPeriodsUTC] netWorkingPeriods after merging workingIntervals:', JSON.stringify(netWorkingPeriods.map(i => ({s:i.start.toISOString(), e:i.end.toISOString()})), null, 2));
        for (const nonWorking of nonWorkingStaffRuleIntervals) {
            netWorkingPeriods = this.subtractInterval(netWorkingPeriods, nonWorking);
        }
        console.log('[getMemberNetWorkingPeriodsUTC] Final netWorkingPeriods to be returned:', JSON.stringify(netWorkingPeriods.map(i => ({s:i.start.toISOString(), e:i.end.toISOString()})), null, 2));
        return netWorkingPeriods;
    }

    async getAvailableSlots(serviceId: number, dateString: string): Promise<string[]> {
        const service = await this.serviceModel.findByPk(serviceId, {
            include: [{ model: this.establishmentModel, as: 'establishment', required: true, attributes: ['id', 'is_validated', 'timezone'] }]
        });

        if (!service || !service.establishment) throw new ServiceNotFoundError();
        if (!service.establishment.timezone) {
            throw new AppError('ConfigurationError', 500, `Establishment ID ${service.establishment_id} does not have a timezone configured.`);
        }
        const establishmentTimezone = service.establishment.timezone;

        if (!service.establishment.is_validated) throw new EstablishmentNotFoundError("Establishment is not validated.");
        if (!service.is_active) throw new ServiceNotFoundError("Service is inactive.");

        const establishmentId = service.establishment_id;
        const durationMinutes = service.duration_minutes;

        const { dayStartUTC, dayEndUTC } = this.getDayBoundariesInUTC(dateString, establishmentTimezone);
        let openIntervalsUTC = await this.getEstablishmentOpenIntervalsUTC(establishmentId, dateString, establishmentTimezone);

        const bookings = await this.bookingModel.findAll({
            where: {
                establishment_id: establishmentId,
                service_id: serviceId,
                status: { [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING_CONFIRMATION] },
                start_datetime: { [Op.lt]: dayEndUTC },
                end_datetime: { [Op.gt]: dayStartUTC }
            }
        });
        for (const booking of bookings) {
            openIntervalsUTC = this.subtractInterval(openIntervalsUTC, { start: booking.start_datetime, end: booking.end_datetime });
        }

        const availableSlots: Date[] = [];
        const stepMillis = Math.min(durationMinutes, SLOT_CHECK_INTERVAL_MINUTES) * 60 * 1000;
        const nowInEstTZ = moment.tz(establishmentTimezone);
        const todayInEstTZFormat = nowInEstTZ.format('YYYY-MM-DD');
        const nowUTC = moment().utc().toDate(); // Temps actuel en UTC

        for (const openInterval of openIntervalsUTC) {
            let slotStartUTC = new Date(openInterval.start);
            while (slotStartUTC.getTime() < openInterval.end.getTime()) {
                const slotEndUTC = new Date(slotStartUTC.getTime() + durationMinutes * 60 * 1000);
                if (slotEndUTC > openInterval.end) break;

                // Comparer slotStartUTC (qui est déjà en UTC) avec nowUTC
                if (dateString === todayInEstTZFormat && slotStartUTC < nowUTC) {
                    slotStartUTC = new Date(slotStartUTC.getTime() + stepMillis);
                    continue;
                }
                availableSlots.push(new Date(slotStartUTC));
                slotStartUTC = new Date(slotStartUTC.getTime() + stepMillis);
            }
        }
        const uniqueSlots = Array.from(new Set(availableSlots.map(d => d.getTime()))).map(time => new Date(time));
        uniqueSlots.sort((a, b) => a.getTime() - b.getTime());
        return uniqueSlots.map(slot => slot.toISOString());
    }

    async isMemberAvailableForSlot(
        membershipId: number,
        slotStartDateTimeUTC: Date,
        slotEndDateTimeUTC: Date,
        establishmentTimezone: string,
        bookingIdToExclude?: number
    ): Promise<{ available: boolean; reason?: string; conflictingBookings?: BookingAttributes[] }> {
        if (!establishmentTimezone) {
            throw new AppError('ConfigurationError', 500, 'Establishment timezone is required for member availability check.');
        }

        const slotDateStringInEstTZ = moment(slotStartDateTimeUTC).tz(establishmentTimezone).format('YYYY-MM-DD');
        const { dayStartUTC: queryWindowStartUTC, dayEndUTC: queryWindowEndUTC } = this.getDayBoundariesInUTC(slotDateStringInEstTZ, establishmentTimezone);

        const memberNetWorkingPeriodsUTC = await this.getMemberNetWorkingPeriodsUTC(
            membershipId, queryWindowStartUTC, queryWindowEndUTC, establishmentTimezone
        );

        const isWithinNetWorkingHours = memberNetWorkingPeriodsUTC.some(period =>
            slotStartDateTimeUTC.getTime() >= period.start.getTime() && slotEndDateTimeUTC.getTime() <= period.end.getTime()
        );

        if (!isWithinNetWorkingHours) {
            return { available: false, reason: 'Member is not scheduled to work during this time based on their StaffAvailability rules.' };
        }

        const slotStartDateInEstTZ_forTimeOff = moment(slotStartDateTimeUTC).tz(establishmentTimezone).format('YYYY-MM-DD');
        const slotEndDateInEstTZ_forTimeOff = moment(slotEndDateTimeUTC).subtract(1, 'millisecond').tz(establishmentTimezone).format('YYYY-MM-DD');

        const approvedTimeOff = await this.timeOffRequestModel.findOne({
            where: {
                membershipId: membershipId,
                status: TimeOffRequestStatus.APPROVED,
                startDate: { [Op.lte]: slotEndDateInEstTZ_forTimeOff },
                endDate: { [Op.gte]: slotStartDateInEstTZ_forTimeOff },
            }
        });

        if (approvedTimeOff) {
            const timeOffDayStartUTC = moment.tz(approvedTimeOff.startDate, 'YYYY-MM-DD', establishmentTimezone).startOf('day').utc().toDate();
            const timeOffDayEndUTC = moment.tz(approvedTimeOff.endDate, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate();
            if (slotStartDateTimeUTC < timeOffDayEndUTC && slotEndDateTimeUTC > timeOffDayStartUTC) {
                return { available: false, reason: `Member has approved time off (${approvedTimeOff.type}) covering this period.` };
            }
        }

        const whereClauseForBookings: WhereOptions<BookingAttributes> = {
            assignedMembershipId: membershipId,
            status: { [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING_CONFIRMATION] },
            start_datetime: { [Op.lt]: slotEndDateTimeUTC },
            end_datetime: { [Op.gt]: slotStartDateTimeUTC },
        };
        if (bookingIdToExclude) {
            whereClauseForBookings.id = { [Op.ne]: bookingIdToExclude };
        }
        const conflictingBookings = await this.bookingModel.findAll({ where: whereClauseForBookings });

        if (conflictingBookings.length > 0) {
            return {
                available: false,
                reason: `Member has ${conflictingBookings.length} other booking(s) at this time.`,
                conflictingBookings: conflictingBookings.map(b => b.get({ plain: true }))
            };
        }
        return { available: true };
    }
}