import { TimeInterval } from '../../../appointments/domain/appointment';
import {
  localWeekdayAndMinute,
  type BusinessHour,
} from '../../../appointments/domain/business-hours';
import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { PublicBookingReader } from '../ports';

export interface GetAvailabilityInput {
  slug: string;
  serviceId: string;
  /** Local calendar date in the business timezone, 'YYYY-MM-DD'. */
  date: string;
}

export interface AvailabilityView {
  slug: string;
  serviceId: string;
  date: string;
  timezone: string;
  durationMinutes: number;
  /** Free start instants (ISO UTC) a client can book. */
  slots: string[];
}

export interface AvailabilityDeps {
  reader: PublicBookingReader;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Granularity of the slot grid, in minutes. */
const SLOT_STEP_MINUTES = 15;

/**
 * Resolves the UTC instant for a given business-local date + minute-of-day.
 * We binary-free it by formatting a candidate and nudging: because tz offset
 * is piecewise-constant across a day (except the DST hour), we compute the
 * offset at local noon and apply it, then verify the local minute lands.
 */
function localDateMinuteToUtc(
  date: string,
  minute: number,
  timeZone: string,
): Date {
  const [y, m, d] = date.split('-').map(Number);
  // Start from the naive UTC instant for that wall-clock time...
  const naive = Date.UTC(y!, m! - 1, d!, Math.floor(minute / 60), minute % 60);
  // ...then correct by the tz offset observed at that instant.
  const probe = new Date(naive);
  const local = localWeekdayAndMinute(probe, timeZone);
  // Minutes the probe is OFF from the intended local minute (wrap a day).
  let delta = minute - local.minute;
  if (delta > 720) delta -= 1440;
  if (delta < -720) delta += 1440;
  return new Date(naive + delta * 60_000);
}

/**
 * Computes bookable start instants for a service on a local date.
 *
 * A slot is bookable when its [start, start+duration) interval:
 *  - lies fully inside an opening window for that local weekday, and
 *  - at least ONE assignable staff member is free (no overlapping SCHEDULED
 *    appointment). If every staff member is busy, the slot is dropped.
 *
 * All resolution is server-side from the slug; the client never names staff.
 */
export async function getAvailability(
  input: GetAvailabilityInput,
  deps: AvailabilityDeps,
): Promise<AvailabilityView> {
  if (!DATE_RE.test(input.date)) {
    throw new ValidationError('date must be YYYY-MM-DD');
  }

  const business = await deps.reader.findBusinessBySlug(input.slug);
  if (!business) throw new NotFoundError('Business not found');

  const service = await deps.reader.findService(business.id, input.serviceId);
  if (!service || service.deleted) throw new NotFoundError('Service not found');
  if (!service.active) throw new ValidationError('Service is not active');

  const staff = await deps.reader.listAssignableStaff(business.id);
  const hours = await deps.reader.listBusinessHours(business.id);

  const empty: AvailabilityView = {
    slug: business.slug,
    serviceId: service.id,
    date: input.date,
    timezone: business.timezone,
    durationMinutes: service.durationMinutes,
    slots: [],
  };
  if (staff.length === 0 || hours.length === 0) return empty;

  // Which local weekday is `date`? Resolve via local noon to dodge DST edges.
  const noonUtc = localDateMinuteToUtc(input.date, 720, business.timezone);
  const { weekday } = localWeekdayAndMinute(noonUtc, business.timezone);
  const windows: BusinessHour[] = hours.filter((h) => h.weekday === weekday);
  if (windows.length === 0) return empty;

  // Day window for the busy-appointment query (pad a day each side for tz).
  const dayStart = localDateMinuteToUtc(input.date, 0, business.timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const busy = await deps.reader.listAppointmentsInRange({
    businessId: business.id,
    from: new Date(dayStart.getTime() - 60 * 60_000),
    to: new Date(dayEnd.getTime() + 60 * 60_000),
    status: 'SCHEDULED',
  });

  // Busy intervals grouped per staff membership.
  const busyByStaff = new Map<string, TimeInterval[]>();
  for (const appt of busy) {
    const list = busyByStaff.get(appt.staffId) ?? [];
    list.push(appt.interval);
    busyByStaff.set(appt.staffId, list);
  }

  const slots: string[] = [];
  const duration = service.durationMinutes;

  for (const w of windows) {
    // Last start that still fits the duration inside the window.
    for (let min = w.openMinute; min + duration <= w.closeMinute; min += SLOT_STEP_MINUTES) {
      const startAt = localDateMinuteToUtc(input.date, min, business.timezone);
      let interval: TimeInterval;
      try {
        interval = TimeInterval.fromDuration(startAt, duration);
      } catch {
        continue;
      }
      // At least one staff member must be free for this interval.
      const someoneFree = staff.some((s) => {
        const theirBusy = busyByStaff.get(s.membershipId) ?? [];
        return !theirBusy.some((b) => b.overlaps(interval));
      });
      if (someoneFree) slots.push(interval.startAt.toISOString());
    }
  }

  return { ...empty, slots };
}
