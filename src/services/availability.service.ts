// src/services/availability.service.ts
import { ModelCtor, Op } from 'sequelize';

import moment from 'moment-timezone';
import db from '../models';
import Establishment from '../models/Establishment';
import AvailabilityRule from '../models/AvailabilityRule';
import AvailabilityOverride from '../models/AvailabilityOverride';
import Service from '../models/Service';
import Booking, { BookingStatus } from '../models/Booking';

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

    constructor() {
        this.establishmentModel = db.Establishment;
        this.availabilityRuleModel = db.AvailabilityRule;
        this.availabilityOverrideModel = db.AvailabilityOverride;
        this.serviceModel = db.Service;
        this.bookingModel = db.Booking;
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
}