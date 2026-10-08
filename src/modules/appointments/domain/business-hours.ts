import { ValidationError } from '../../../shared/domain/errors';
import { TimeInterval } from './appointment';

export interface BusinessHour {
  /** 0 = Sunday ... 6 = Saturday (in the business timezone). */
  weekday: number;
  /** Minutes from midnight (business-local), e.g. 09:00 = 540. */
  openMinute: number;
  closeMinute: number;
}

export function assertBusinessHour(h: BusinessHour): BusinessHour {
  if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6) {
    throw new ValidationError('weekday must be 0..6');
  }
  if (
    !Number.isInteger(h.openMinute) ||
    !Number.isInteger(h.closeMinute) ||
    h.openMinute < 0 ||
    h.closeMinute > 1440 ||
    h.openMinute >= h.closeMinute
  ) {
    throw new ValidationError('Invalid business hours range');
  }
  return h;
}

/**
 * Projects a UTC instant into the given IANA timezone and returns the local
 * weekday (0=Sun..6=Sat) and minutes-from-midnight. Uses Intl so DST and
 * offset rules come from the host tz database — no manual offset math.
 */
export function localWeekdayAndMinute(
  instant: Date,
  timeZone: string,
): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdays[map.weekday ?? ''];
  if (weekday === undefined) {
    throw new ValidationError(`Unable to resolve weekday for timezone ${timeZone}`);
  }
  // '24' can appear at midnight under hour12:false; normalise to 0.
  const hour = Number(map.hour) % 24;
  const minute = hour * 60 + Number(map.minute);
  return { weekday, minute };
}

/**
 * True when the whole appointment interval falls within an open window of the
 * business for that local weekday. Start and end are both checked against the
 * same weekday's window; an interval that would cross midnight (local) into a
 * different weekday is rejected as outside hours.
 */
export function isWithinBusinessHours(
  interval: TimeInterval,
  timeZone: string,
  hours: BusinessHour[],
): boolean {
  const start = localWeekdayAndMinute(interval.startAt, timeZone);
  // End is exclusive; subtract 1ms so an interval ending exactly at close is in.
  const endInstant = new Date(interval.endAt.getTime() - 1);
  const end = localWeekdayAndMinute(endInstant, timeZone);

  if (start.weekday !== end.weekday) return false;

  const windows = hours.filter((h) => h.weekday === start.weekday);
  return windows.some(
    (w) => start.minute >= w.openMinute && end.minute < w.closeMinute,
  );
}
