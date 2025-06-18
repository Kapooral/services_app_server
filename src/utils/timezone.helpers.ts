import {
    parse as fnsParse,
    format as fnsFormat,
    startOfDay as fnsStartOfDay,
    endOfDay as fnsEndOfDay,
} from 'date-fns';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * L'objet Date de JavaScript est toujours en UTC.
 * Ce helper essentiel prend une date et une heure locales (ex: '2023-10-27', '09:00:00') et un fuseau horaire
 * (ex: 'Europe/Paris'), et retourne l'objet Date UTC correct correspondant à cet instant précis.
 * @param dateStr - La date au format 'yyyy-MM-dd'.
 * @param timeStr - L'heure au format 'HH:mm:ss'.
 * @param timezone - L'identifiant IANA du fuseau horaire (ex: 'Europe/Paris').
 * @returns L'objet Date correspondant à l'instant UTC.
 */
export function parseDateTimeInTimezone(dateStr: string, timeStr: string, timezone: string): Date {
    const localDateTimeStr = `${dateStr}T${timeStr}`;
    return fromZonedTime(localDateTimeStr, timezone);
}

/**
 * Prend un objet Date UTC et le formate en une chaîne de caractères (ex: 'HH:mm:ss')
 * dans le contexte du fuseau horaire spécifié.
 * @param date - L'objet Date UTC.
 * @param formatStr - Le format de sortie désiré (ex: 'HH:mm:ss', 'yyyy-MM-dd').
 * @param timezone - L'identifiant IANA du fuseau horaire.
 * @returns La date/heure formatée en string.
 */
export function formatInTimezone(date: Date, formatStr: string, timezone: string): string {
    return formatInTimeZone(date, timezone, formatStr);
}

/**
 * Calcule le début du jour (00:00:00.000) pour une date donnée DANS un fuseau horaire spécifique.
 * @param date - L'objet Date UTC.
 * @param timezone - L'identifiant IANA du fuseau horaire.
 * @returns Un nouvel objet Date représentant le début du jour dans ce fuseau horaire.
 */
export function startOfDayInTimezone(date: Date, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const start = fnsStartOfDay(zonedDate);
    return fromZonedTime(start, timezone);
}

/**
 * Calcule la fin du jour (23:59:59.999) pour une date donnée DANS un fuseau horaire spécifique.
 * @param date - L'objet Date UTC.
 * @param timezone - L'identifiant IANA du fuseau horaire.
 * @returns Un nouvel objet Date représentant la fin du jour dans ce fuseau horaire.
 */
export function endOfDayInTimezone(date: Date, timezone: string): Date {
    const zonedDate = toZonedTime(date, timezone);
    const end = fnsEndOfDay(zonedDate);
    return fromZonedTime(end, timezone);
}