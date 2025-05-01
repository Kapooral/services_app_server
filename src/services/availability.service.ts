// src/services/availability.service.ts
import { ModelCtor, FindOptions, Op } from 'sequelize';
import db from '../models';
import AvailabilityRule from '../models/AvailabilityRule';
import AvailabilityOverride from '../models/AvailabilityOverride';
import Service from '../models/Service';
import Booking, { BookingStatus } from '../models/Booking';
import { ServiceNotFoundError } from '../errors/service.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';
import { AppError } from '../errors/app.errors';

interface TimeInterval {
    start: Date;
    end: Date;
}

const SLOT_CHECK_INTERVAL_MINUTES = 15;

export class AvailabilityService {
    private availabilityRuleModel: ModelCtor<AvailabilityRule>;
    private availabilityOverrideModel: ModelCtor<AvailabilityOverride>;
    private serviceModel: ModelCtor<Service>;
    private bookingModel: ModelCtor<Booking>;

    constructor(
    ) {
        this.availabilityRuleModel = db.AvailabilityRule;
        this.availabilityOverrideModel = db.AvailabilityOverride;
        this.serviceModel = db.Service;
        this.bookingModel = db.Booking;
    }

    /**
     * Helper function to remove a time interval from a list of intervals.
     * Handles partial overlaps, complete overlaps, and containment.
     */
    private subtractInterval(intervals: TimeInterval[], toSubtract: TimeInterval): TimeInterval[] {
        const result: TimeInterval[] = [];
        for (const interval of intervals) {
            if (interval.end <= toSubtract.start || interval.start >= toSubtract.end) {
                result.push(interval);
                continue;
            }

            if (interval.start < toSubtract.start && interval.end > toSubtract.start && interval.end <= toSubtract.end) {
                result.push({ start: interval.start, end: toSubtract.start });
            }
            else if (interval.start >= toSubtract.start && interval.start < toSubtract.end && interval.end > toSubtract.end) {
                result.push({ start: toSubtract.end, end: interval.end });
            }
            else if (interval.start >= toSubtract.start && interval.end <= toSubtract.end) {
                // Skip this interval (it's fully subtracted)
            }
            else if (interval.start < toSubtract.start && interval.end > toSubtract.end) {
                result.push({ start: interval.start, end: toSubtract.start });
                result.push({ start: toSubtract.end, end: interval.end });
            }
        }
        return result;
    }

    /**
     * Calculates available booking slots for a specific service on a given date.
     * @param serviceId The ID of the service.
     * @param dateString The target date in 'YYYY-MM-DD' format.
     * @returns A promise resolving to an array of ISO 8601 UTC strings representing the start times of available slots.
     */
    async getAvailableSlots(serviceId: number, dateString: string): Promise<string[]> {
        const service = await this.serviceModel.findByPk(serviceId, {
            attributes: ['id', 'establishment_id', 'duration_minutes', 'capacity', 'is_active'],
            include: [{
                model: db.Establishment,
                as: 'establishment',
                attributes: ['id', 'is_validated'],
                required: true
            }]
        });

        // --- Initial Validations ---
        if (!service || !service.establishment) throw new ServiceNotFoundError();
        if (!service.establishment.is_validated) { throw new EstablishmentNotFoundError("Establishment is not validated."); }
        if (!service.is_active) { throw new ServiceNotFoundError("Service is inactive."); }

        const establishmentId = service.establishment_id;
        const durationMinutes = service.duration_minutes;

        const targetDate = new Date(`${dateString}T00:00:00.000Z`);
        if (isNaN(targetDate.getTime())) {
            throw new AppError('InvalidDateFormat', 400, 'Invalid date format provided.');
        }
        const dayOfWeek = targetDate.getUTCDay();
        const startOfDay = new Date(targetDate);
        const endOfDay = new Date(targetDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        // --- Determine Base Availability from Rule ---
        const rule = await this.availabilityRuleModel.findOne({
            where: { establishment_id: establishmentId, day_of_week: dayOfWeek },
            attributes: ['start_time', 'end_time']
        });

        if (!rule) { return []; }

        const [startHour, startMinute] = rule.start_time.split(':').map(Number);
        const [endHour, endMinute] = rule.end_time.split(':').map(Number);
        const ruleStart = new Date(targetDate); ruleStart.setUTCHours(startHour, startMinute, 0, 0);
        const ruleEnd = new Date(targetDate); ruleEnd.setUTCHours(endHour, endMinute, 0, 0);

        if (ruleStart >= ruleEnd) { return []; }

        // Initial open intervals based on the rule
        let openIntervals: TimeInterval[] = [{ start: ruleStart, end: ruleEnd }];

        // --- Apply Overrides ---
        const overrides = await this.availabilityOverrideModel.findAll({
            where: {
                establishment_id: establishmentId,
                start_datetime: { [Op.lt]: endOfDay }, // Starts before the end of the target day
                end_datetime: { [Op.gt]: startOfDay }  // Ends after the start of the target day
            },
            attributes: ['id', 'start_datetime', 'end_datetime', 'is_available'],
            order: [['start_datetime', 'ASC']]
        });

        for (const override of overrides) {
            const overrideStartClamped = override.start_datetime < startOfDay ? startOfDay : override.start_datetime;
            const overrideEndClamped = override.end_datetime > endOfDay ? endOfDay : override.end_datetime;

            if (overrideStartClamped >= overrideEndClamped) continue;

            if (!override.is_available) {
                openIntervals = this.subtractInterval(openIntervals, { start: overrideStartClamped, end: overrideEndClamped });
            } else {
                // Overrides making time available ('is_available: true') are currently ignored.
                // Could be used in future logic to add availability outside normal rules.
                // console.warn(`[AvailabilityService] 'is_available: true' override (ID: ${override.id}) ignored.`);
            }
        }

        // --- Fetch Existing Bookings ---
        const bookings = await this.bookingModel.findAll({
            where: {
                establishment_id: establishmentId,
                status: { [Op.in]: [BookingStatus.CONFIRMED, BookingStatus.PENDING_CONFIRMATION] },
                start_datetime: { [Op.lt]: endOfDay },
                end_datetime: { [Op.gt]: startOfDay }
            },
            attributes: ['start_datetime', 'end_datetime'],
            order: [['start_datetime', 'ASC']]
        });

        // --- Generate Potential Slots and Check Conflicts ---
        const availableSlots: Date[] = [];
        const stepMillis = SLOT_CHECK_INTERVAL_MINUTES * 60 * 1000;
        const now = new Date();
        const isToday = (dateString === now.toISOString().split('T')[0]);

        // Iterate through each potentially fragmented open interval
        for (const openInterval of openIntervals) {
            let potentialSlotStart = new Date(openInterval.start);

            // Iterate with a fixed step
            while (potentialSlotStart.getTime() < openInterval.end.getTime()) {
                const potentialSlotEnd = new Date(potentialSlotStart.getTime() + durationMinutes * 60000);

                // Check if the slot ends after the current open interval
                if (potentialSlotEnd > openInterval.end) {
                    break; // Cannot fit this slot starting here in this interval
                }

                // Check if the slot starts in the past (only relevant for today)
                if (isToday && potentialSlotStart < now) {
                    // Increment and continue to the next potential start time
                    potentialSlotStart = new Date(potentialSlotStart.getTime() + stepMillis);
                    continue;
                }

                // Check for conflicts with existing bookings
                const hasBookingConflict = bookings.some(booking =>
                    potentialSlotStart < booking.end_datetime && potentialSlotEnd > booking.start_datetime
                );

                if (!hasBookingConflict) {
                    // Add slot if no conflict
                    // No need to check for duplicates if step >= duration, but safer to keep if step < duration
                    if (!availableSlots.some(existing => existing.getTime() === potentialSlotStart.getTime())) {
                        availableSlots.push(new Date(potentialSlotStart));
                    }
                }

                // Increment by the fixed step
                potentialSlotStart = new Date(potentialSlotStart.getTime() + stepMillis);
            }
        }

        // Sort results chronologically
        availableSlots.sort((a, b) => a.getTime() - b.getTime());

        // Return ISO strings
        return availableSlots.map(slot => slot.toISOString());
    }
}