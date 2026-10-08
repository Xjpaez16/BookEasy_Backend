import { describe, it, expect } from 'bun:test';
import {
  isWithinBusinessHours,
  localWeekdayAndMinute,
  assertBusinessHour,
} from '../../src/modules/appointments/domain/business-hours';
import { TimeInterval } from '../../src/modules/appointments/domain/appointment';
import { ValidationError } from '../../src/shared/domain/errors';

describe('assertBusinessHour', () => {
  it('rejects open >= close', () => {
    expect(() => assertBusinessHour({ weekday: 1, openMinute: 600, closeMinute: 600 })).toThrow(
      ValidationError,
    );
  });
  it('rejects an out-of-range weekday', () => {
    expect(() => assertBusinessHour({ weekday: 7, openMinute: 540, closeMinute: 1020 })).toThrow(
      ValidationError,
    );
  });
});

describe('localWeekdayAndMinute', () => {
  it('projects a UTC instant into a negative-offset timezone', () => {
    // 2026-01-05 is a Monday. 14:00Z in America/Bogota (UTC-5) => 09:00 local, Monday.
    const { weekday, minute } = localWeekdayAndMinute(
      new Date('2026-01-05T14:00:00Z'),
      'America/Bogota',
    );
    expect(weekday).toBe(1); // Monday
    expect(minute).toBe(9 * 60);
  });
});

describe('isWithinBusinessHours', () => {
  const bogotaMonHours = [{ weekday: 1, openMinute: 540, closeMinute: 1080 }]; // 09:00–18:00

  it('accepts a slot fully inside the window', () => {
    // 14:00Z = 09:00 Bogota Monday, 30 min => ends 09:30 local, inside.
    const iv = TimeInterval.fromDuration(new Date('2026-01-05T14:00:00Z'), 30);
    expect(isWithinBusinessHours(iv, 'America/Bogota', bogotaMonHours)).toBe(true);
  });

  it('rejects a slot starting before opening', () => {
    // 13:30Z = 08:30 Bogota Monday, before 09:00.
    const iv = TimeInterval.fromDuration(new Date('2026-01-05T13:30:00Z'), 30);
    expect(isWithinBusinessHours(iv, 'America/Bogota', bogotaMonHours)).toBe(false);
  });

  it('rejects a slot that ends after closing', () => {
    // 22:45Z = 17:45 Bogota Monday, 30 min => ends 18:15 local, after 18:00.
    const iv = TimeInterval.fromDuration(new Date('2026-01-05T22:45:00Z'), 30);
    expect(isWithinBusinessHours(iv, 'America/Bogota', bogotaMonHours)).toBe(false);
  });

  it('rejects a day with no configured hours', () => {
    // 2026-01-06 is Tuesday — no hours configured for weekday 2.
    const iv = TimeInterval.fromDuration(new Date('2026-01-06T14:00:00Z'), 30);
    expect(isWithinBusinessHours(iv, 'America/Bogota', bogotaMonHours)).toBe(false);
  });
});
