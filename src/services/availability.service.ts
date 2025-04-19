import { ModelCtor, FindOptions, Op } from 'sequelize';
import db from '../models';
import AvailabilityRule from '../models/AvailabilityRule';
import AvailabilityOverride from '../models/AvailabilityOverride';
import Service from '../models/Service';
import Booking, { BookingStatus } from '../models/Booking';
import { EstablishmentService } from './establishment.service';
import { ServiceNotFoundError } from '../errors/service.errors';
import { EstablishmentNotFoundError } from '../errors/establishment.errors';
import { AppError } from '../errors/app.errors';

interface TimeInterval {
    start: Date;
    end: Date;
}

export class AvailabilityService {
    private availabilityRuleModel: ModelCtor<AvailabilityRule>;
    private availabilityOverrideModel: ModelCtor<AvailabilityOverride>;
    private establishmentService: EstablishmentService;
    private serviceModel: ModelCtor<Service>;
    private bookingModel: ModelCtor<Booking>;

    constructor(
        availabilityRuleModel: ModelCtor<AvailabilityRule>,
        availabilityOverrideModel: ModelCtor<AvailabilityOverride>,
        establishmentService: EstablishmentService,
        serviceModel: ModelCtor<Service>,
        bookingModel: ModelCtor<Booking>
    ) {
        this.availabilityRuleModel = availabilityRuleModel;
        this.availabilityOverrideModel = availabilityOverrideModel;
        this.establishmentService = establishmentService;
        this.serviceModel = serviceModel;
        this.bookingModel = bookingModel;
    }

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
                // No push
            }
            else if (interval.start < toSubtract.start && interval.end > toSubtract.end) {
                result.push({ start: interval.start, end: toSubtract.start });
                result.push({ start: toSubtract.end, end: interval.end });
            }
        }
        return result;
    }

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

        const rule = await this.availabilityRuleModel.findOne({
            where: { establishment_id: establishmentId, day_of_week: dayOfWeek },
            attributes: ['start_time', 'end_time']
        });

        const overrides = await this.availabilityOverrideModel.findAll({
            where: {
                establishment_id: establishmentId,
                [Op.or]: [
                    { start_datetime: { [Op.between]: [startOfDay, endOfDay] } },
                    { end_datetime: { [Op.between]: [startOfDay, endOfDay] } },
                    { [Op.and]: [
                            { start_datetime: { [Op.lt]: startOfDay } },
                            { end_datetime: { [Op.gt]: endOfDay } }
                        ]}
                ]
            },
            attributes: ['id', 'start_datetime', 'end_datetime', 'is_available'],
            order: [['start_datetime', 'ASC']]
        });

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

        let openIntervals: TimeInterval[] = [];
        let earliestPossibleStart: Date | null = null;
        let latestPossibleEnd: Date | null = null;

        if (rule) {
            const [startHour, startMinute, startSecond] = rule.start_time.split(':').map(Number);
            const [endHour, endMinute, endSecond] = rule.end_time.split(':').map(Number);
            const ruleStart = new Date(targetDate); ruleStart.setUTCHours(startHour, startMinute, startSecond, 0);
            const ruleEnd = new Date(targetDate); ruleEnd.setUTCHours(endHour, endMinute, endSecond, 0);
            if (ruleStart < ruleEnd) {
                openIntervals.push({ start: ruleStart, end: ruleEnd });
                earliestPossibleStart = ruleStart;
                latestPossibleEnd = ruleEnd;
            }
        } else {
            return [];
        }

        if (!earliestPossibleStart || !latestPossibleEnd || earliestPossibleStart >= latestPossibleEnd) {
            return [];
        }

        for (const override of overrides) {
            const overrideStart = override.start_datetime < startOfDay ? startOfDay : override.start_datetime;
            const overrideEnd = override.end_datetime > endOfDay ? endOfDay : override.end_datetime;
            if (overrideStart >= overrideEnd) continue;
            if (!override.is_available) {
                openIntervals = this.subtractInterval(openIntervals, { start: overrideStart, end: overrideEnd });
            } else {
                console.warn(`[AvailabilityService] 'is_available: true' override (ID: ${override.id}) ignored in MVP calculation.`);
            }
        }

        const availableSlots: Date[] = [];
        let potentialSlotStart = new Date(earliestPossibleStart);

        while (potentialSlotStart < latestPossibleEnd) {
            const potentialSlotEnd = new Date(potentialSlotStart.getTime() + durationMinutes * 60000);
            if (potentialSlotEnd > latestPossibleEnd) { break; }

            const fallsWithinOpenInterval = openIntervals.some(openInterval =>
                potentialSlotStart >= openInterval.start && potentialSlotEnd <= openInterval.end
            );

            if (fallsWithinOpenInterval) {
                const hasBookingConflict = bookings.some(booking =>
                    potentialSlotStart < booking.end_datetime && potentialSlotEnd > booking.start_datetime
                );
                if (!hasBookingConflict) {
                    availableSlots.push(new Date(potentialSlotStart));
                }
            }
            potentialSlotStart = new Date(potentialSlotStart.getTime() + durationMinutes * 60000);
        }

        return availableSlots.map(slot => slot.toISOString());
    }
}