import { describe, it, expect } from 'bun:test';
import { TimeInterval, Appointment } from '../../src/modules/appointments/domain/appointment';
import { ValidationError } from '../../src/shared/domain/errors';

const d = (iso: string): Date => new Date(iso);

describe('TimeInterval', () => {
  it('rejects an end that is not after start', () => {
    expect(() => TimeInterval.create(d('2026-01-01T10:00:00Z'), d('2026-01-01T10:00:00Z'))).toThrow(
      ValidationError,
    );
  });

  it('builds from a positive duration', () => {
    const iv = TimeInterval.fromDuration(d('2026-01-01T10:00:00Z'), 30);
    expect(iv.durationMinutes()).toBe(30);
    expect(iv.endAt.toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });

  it('rejects a non-positive duration', () => {
    expect(() => TimeInterval.fromDuration(d('2026-01-01T10:00:00Z'), 0)).toThrow(ValidationError);
  });

  it('detects overlapping intervals', () => {
    const a = TimeInterval.create(d('2026-01-01T10:00:00Z'), d('2026-01-01T11:00:00Z'));
    const b = TimeInterval.create(d('2026-01-01T10:30:00Z'), d('2026-01-01T11:30:00Z'));
    expect(a.overlaps(b)).toBe(true);
    expect(b.overlaps(a)).toBe(true);
  });

  it('treats back-to-back intervals as non-overlapping (half-open)', () => {
    const a = TimeInterval.create(d('2026-01-01T10:00:00Z'), d('2026-01-01T11:00:00Z'));
    const b = TimeInterval.create(d('2026-01-01T11:00:00Z'), d('2026-01-01T12:00:00Z'));
    expect(a.overlaps(b)).toBe(false);
  });
});

describe('Appointment lifecycle', () => {
  const base = {
    id: 'a1',
    businessId: 'b1',
    customerId: 'c1',
    serviceId: 's1',
    staffId: 'st1',
    interval: TimeInterval.fromDuration(d('2026-01-01T10:00:00Z'), 30),
    status: 'SCHEDULED' as const,
    priceMinor: 1000,
    currency: 'USD',
  };

  it('cancels a scheduled appointment', () => {
    const appt = Appointment.create({ ...base });
    appt.cancel();
    expect(appt.status).toBe('CANCELLED');
  });

  it('refuses to modify a non-scheduled appointment', () => {
    const appt = Appointment.create({ ...base });
    appt.complete();
    expect(() => appt.cancel()).toThrow(ValidationError);
  });

  it('rejects a negative price', () => {
    expect(() => Appointment.create({ ...base, priceMinor: -1 })).toThrow(ValidationError);
  });
});
