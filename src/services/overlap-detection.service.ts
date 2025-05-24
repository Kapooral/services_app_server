// src/services/overlap-detection.service.ts
import { ModelCtor, Op, WhereOptions } from 'sequelize';
import moment from 'moment-timezone';

import StaffAvailability, { StaffAvailabilityAttributes, PotentialConflictDetailItem } from '../models/StaffAvailability';
import TimeOffRequest, { TimeOffRequestAttributes, TimeOffRequestStatus } from '../models/TimeOffRequest';
import Establishment from '../models/Establishment';
import { StaffAvailabilityConflictError } from '../errors/planning.errors';
import { AppError } from '../errors/app.errors';
import { generateOccurrences, intervalsOverlap, TimeInterval, calculateRuleActualEndDateUTC } from '../utils/rrule.utils'; // Import de calculateRuleActualEndDateUTC

const FORECAST_WINDOW_YEARS = 1;

export interface AvailabilityCandidate {
    rruleString: string;
    durationMinutes: number;
    effectiveStartDate: string;
    effectiveEndDate?: string | null;
    idToExclude?: number;
}

// MODIFIÉ : potentialConflictDetails est maintenant un tableau d'items
export interface ConflictCheckResult {
    hasBlockingConflict: boolean;
    blockingConflictError?: StaffAvailabilityConflictError;
    potentialConflictDetails?: PotentialConflictDetailItem[] | null;
}

export class OverlapDetectionService {
    constructor(
        private staffAvailabilityModel: ModelCtor<StaffAvailability>,
        private timeOffRequestModel: ModelCtor<TimeOffRequest>,
        private establishmentModel: ModelCtor<Establishment>
    ) {}

    private getEstablishmentTimezone = async (establishmentId: number): Promise<string> => {
        // ... (inchangé)
        const establishment = await this.establishmentModel.findByPk(establishmentId, {
            attributes: ['timezone'],
        });
        if (!establishment?.timezone) {
            throw new AppError('EstablishmentConfigurationError', 500, `Establishment ID ${establishmentId} timezone not configured or establishment not found.`);
        }
        return establishment.timezone;
    };

    private calculateCandidateTestWindow(
        candidate: AvailabilityCandidate,
        establishmentTimezone: string
    ): TimeInterval {
        const candidateEffectiveStartMoment = moment.tz(candidate.effectiveStartDate, 'YYYY-MM-DD', establishmentTimezone).startOf('day');

        // Utiliser la fonction utilitaire optimisée pour trouver la vraie fin du candidat
        const actualCandidateEndDateUTC = calculateRuleActualEndDateUTC(
            candidate.rruleString,
            candidate.durationMinutes,
            candidate.effectiveStartDate,
            candidate.effectiveEndDate,
            establishmentTimezone
        );

        let testWindowEndUTC: Date;
        if (actualCandidateEndDateUTC) {
            testWindowEndUTC = actualCandidateEndDateUTC;
        } else {
            // Si pas de fin déterminable (règle vraiment infinie), utiliser la fenêtre de prévision
            testWindowEndUTC = candidateEffectiveStartMoment.clone().add(FORECAST_WINDOW_YEARS, 'years').endOf('day').utc().toDate();
        }

        const testWindowStartUTC = candidateEffectiveStartMoment.clone().utc().toDate();

        if (moment(testWindowStartUTC).isAfter(testWindowEndUTC)) {
            testWindowEndUTC = moment(testWindowStartUTC).add(candidate.durationMinutes, 'minutes').utc().toDate();
        }

        return { start: testWindowStartUTC, end: testWindowEndUTC };
    }

    private async fetchExistingStaffAvailabilities(
        membershipId: number,
        testWindow: TimeInterval,
        idToExclude?: number
    ): Promise<StaffAvailabilityAttributes[]> {
        const whereConditions: WhereOptions<StaffAvailabilityAttributes> = {
            membershipId,
            effectiveStartDate: { [Op.lte]: moment(testWindow.end).format('YYYY-MM-DD') },
            [Op.or]: [
                { effectiveEndDate: { [Op.gte]: moment(testWindow.start).format('YYYY-MM-DD') } },
                { effectiveEndDate: null }
            ],
            ...(idToExclude && { id: { [Op.ne]: idToExclude } })
        };

        const instances = await this.staffAvailabilityModel.findAll({ where: whereConditions });
        return instances.map(inst => inst.get({ plain: true }) as StaffAvailabilityAttributes);
    }

    private async fetchRelevantTimeOffRequests(
        membershipId: number,
        testWindow: TimeInterval
    ): Promise<TimeOffRequestAttributes[]> {
        // ... (inchangé)
        return this.timeOffRequestModel.findAll({
            where: {
                membershipId,
                status: { [Op.in]: [TimeOffRequestStatus.APPROVED, TimeOffRequestStatus.PENDING] },
                startDate: { [Op.lte]: moment(testWindow.end).format('YYYY-MM-DD') },
                endDate: { [Op.gte]: moment(testWindow.start).format('YYYY-MM-DD') },
            }
        });
    }

    public async checkForConflicts(
        candidate: AvailabilityCandidate,
        membershipId: number,
        establishmentId: number
    ): Promise<ConflictCheckResult> {
        const establishmentTimezone = await this.getEstablishmentTimezone(establishmentId);
        const testWindow = this.calculateCandidateTestWindow(candidate, establishmentTimezone);

        const [existingAvailsData, existingTimeOffsData] = await Promise.all([
            this.fetchExistingStaffAvailabilities(membershipId, testWindow, candidate.idToExclude),
            this.fetchRelevantTimeOffRequests(membershipId, testWindow)
        ]);
        // Renommer pour clarté
        const existingAvailabilities = existingAvailsData;
        const timeOffRequests = existingTimeOffsData;


        let candidateOccurrences: TimeInterval[];
        try {
            candidateOccurrences = generateOccurrences(
                candidate.rruleString, candidate.durationMinutes,
                candidate.effectiveStartDate, candidate.effectiveEndDate,
                testWindow.start, testWindow.end, establishmentTimezone
            );
        } catch (error) { // Erreur de parsing de la rrule du candidat
            return {
                hasBlockingConflict: true,
                blockingConflictError: new StaffAvailabilityConflictError(`Invalid RRULE string for candidate: ${(error as Error).message}`),
            };
        }

        if (candidateOccurrences.length === 0) {
            return { hasBlockingConflict: false, potentialConflictDetails: null };
        }

        const collectedPotentialConflicts: PotentialConflictDetailItem[] = [];

        for (const candOcc of candidateOccurrences) {
            // Conflit avec StaffAvailability existantes
            for (const exAvail of existingAvailabilities) {
                let exAvailOccurrences: TimeInterval[];
                try {
                    exAvailOccurrences = generateOccurrences(
                        exAvail.rruleString, exAvail.durationMinutes,
                        exAvail.effectiveStartDate, exAvail.effectiveEndDate,
                        candOcc.start, candOcc.end, establishmentTimezone
                    );
                } catch (error) {
                    // Règle existante corrompue
                    console.error(`DataIntegrityError: Corrupted existing StaffAvailability (ID: ${exAvail.id}) rruleString: "${exAvail.rruleString}". Error: ${(error as Error).message}`);
                    // DÉCISION : Lever une erreur 500 pour forcer la correction des données.
                    throw new AppError('DataIntegrityError', 500, `Corrupted existing availability rule (ID: ${exAvail.id}) encountered during conflict check.`);
                }

                for (const exAvailOcc of exAvailOccurrences) {
                    if (intervalsOverlap(candOcc, exAvailOcc)) {
                        return {
                            hasBlockingConflict: true,
                            blockingConflictError: new StaffAvailabilityConflictError(
                                `Proposed availability conflicts with existing availability period (ID: ${exAvail.id}). Candidate: [${moment(candOcc.start).tz(establishmentTimezone).format()}-${moment(candOcc.end).tz(establishmentTimezone).format()}]. Existing: [${moment(exAvailOcc.start).tz(establishmentTimezone).format()}-${moment(exAvailOcc.end).tz(establishmentTimezone).format()}].`
                            ),
                        };
                    }
                }
            }

            // Conflit avec TimeOffRequest APPROVED
            for (const timeOff of timeOffRequests) {
                if (timeOff.status === TimeOffRequestStatus.APPROVED) {
                    const timeOffStartUtc = moment.tz(timeOff.startDate, 'YYYY-MM-DD', establishmentTimezone).startOf('day').utc().toDate();
                    const timeOffEndUtc = moment.tz(timeOff.endDate, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate();
                    if (intervalsOverlap(candOcc, { start: timeOffStartUtc, end: timeOffEndUtc })) {
                        return {
                            hasBlockingConflict: true,
                            blockingConflictError: new StaffAvailabilityConflictError(
                                `Proposed availability conflicts with approved time off request (ID: ${timeOff.id}) for period ${timeOff.startDate} to ${timeOff.endDate}.`
                            ),
                        };
                    }
                }
            }
        } // Fin de la première boucle sur candidateOccurrences (pour les conflits bloquants)

        // Seconde passe pour les conflits non bloquants (TimeOffRequest PENDING)
        // si aucun conflit bloquant n'a été trouvé.
        for (const candOcc of candidateOccurrences) {
            for (const timeOff of timeOffRequests) {
                if (timeOff.status === TimeOffRequestStatus.PENDING) {
                    const timeOffStartUtc = moment.tz(timeOff.startDate, 'YYYY-MM-DD', establishmentTimezone).startOf('day').utc().toDate();
                    const timeOffEndUtc = moment.tz(timeOff.endDate, 'YYYY-MM-DD', establishmentTimezone).endOf('day').utc().toDate();
                    if (intervalsOverlap(candOcc, { start: timeOffStartUtc, end: timeOffEndUtc })) {
                        if (!collectedPotentialConflicts.some(p => p.timeOffRequestId === timeOff.id)) {
                            collectedPotentialConflicts.push({
                                type: "PENDING_TIMEOFF_REQUEST_OVERLAP",
                                timeOffRequestId: timeOff.id,
                                message: `This availability potentially conflicts with pending time off request (ID: ${timeOff.id}) from ${timeOff.startDate} to ${timeOff.endDate}.`
                            });
                        }
                    }
                }
            }
        }

        return {
            hasBlockingConflict: false,
            potentialConflictDetails: collectedPotentialConflicts.length > 0 ? collectedPotentialConflicts : null
        };
    }
}