/**
 * Timezone math for the dashboard's "today" window.
 *
 * Appointments are stored in UTC; "today" is a business-LOCAL day. We compute
 * the UTC instants for the local day's start (00:00) and the next day's start
 * using Intl to read the zone's offset at that instant (DST-correct), with no
 * hard-coded offset tables.
 */

/** Returns the offset (minutes) of `timeZone` at `instant`, east-positive. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  // Interpret the local wall-clock as if it were UTC, then diff with the real
  // instant to recover the offset.
  const asUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    (parts.hour ?? 0) % 24,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The business-local calendar date (Y/M/D) for a UTC instant. */
function localYmd(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/**
 * UTC [start, end) bounds for the business-local day containing `now`.
 * `end` is the next local midnight.
 */
export function localDayWindow(
  now: Date,
  timeZone: string,
): { from: Date; to: Date } {
  const { y, m, d } = localYmd(now, timeZone);
  // First approximation: local midnight interpreted as UTC.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Correct by the zone offset at that instant.
  const off = offsetMinutes(new Date(guess), timeZone);
  const from = new Date(guess - off * 60000);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}
