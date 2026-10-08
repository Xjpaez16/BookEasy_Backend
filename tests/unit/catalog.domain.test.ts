import { describe, it, expect } from 'bun:test';
import { Service } from '../../src/modules/services/domain/service';
import {
  Customer,
  normalizePhone,
  normalizeOptionalEmail,
} from '../../src/modules/customers/domain/customer';
import { ValidationError } from '../../src/shared/domain/errors';

describe('Service.create', () => {
  it('defaults price to 0 and currency to USD', () => {
    const s = Service.create({
      id: 's1',
      businessId: 'b1',
      name: 'Haircut',
      durationMinutes: 30,
    });
    const snap = s.snapshot();
    expect(snap.priceMinor).toBe(0);
    expect(snap.currency).toBe('USD');
    expect(s.isActive).toBe(true);
  });
  it('rejects a non-positive or fractional duration', () => {
    expect(() =>
      Service.create({ id: 's1', businessId: 'b1', name: 'X', durationMinutes: 0 }),
    ).toThrow(ValidationError);
    expect(() =>
      Service.create({ id: 's1', businessId: 'b1', name: 'X', durationMinutes: 30.5 }),
    ).toThrow(ValidationError);
  });
  it('rejects a negative or fractional price (minor units only)', () => {
    expect(() =>
      Service.create({
        id: 's1',
        businessId: 'b1',
        name: 'X',
        durationMinutes: 30,
        priceMinor: -1,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      Service.create({
        id: 's1',
        businessId: 'b1',
        name: 'X',
        durationMinutes: 30,
        priceMinor: 9.99,
      }),
    ).toThrow(ValidationError);
  });
  it('softDelete deactivates and is idempotent', () => {
    const s = Service.create({ id: 's1', businessId: 'b1', name: 'X', durationMinutes: 30 });
    s.softDelete(new Date());
    expect(s.isDeleted).toBe(true);
    expect(s.isActive).toBe(false);
    expect(() => s.update({ name: 'Y' })).toThrow(ValidationError);
  });
});

describe('Customer contact normalization', () => {
  it('compacts a phone and rejects an invalid one', () => {
    expect(normalizePhone('+57 (300) 123-4567')).toBe('+573001234567');
    expect(normalizePhone('')).toBeNull();
    expect(() => normalizePhone('abc')).toThrow(ValidationError);
  });
  it('lowercases a valid email and rejects a malformed one', () => {
    expect(normalizeOptionalEmail('A@B.CO')).toBe('a@b.co');
    expect(normalizeOptionalEmail(null)).toBeNull();
    expect(() => normalizeOptionalEmail('nope')).toThrow(ValidationError);
  });
});

describe('Customer.create', () => {
  it('requires a name but allows no contact info', () => {
    const c = Customer.create({ id: 'c1', businessId: 'b1', fullName: 'Jane Doe' });
    const snap = c.snapshot();
    expect(snap.phone).toBeNull();
    expect(snap.email).toBeNull();
  });
  it('rejects an empty name', () => {
    expect(() =>
      Customer.create({ id: 'c1', businessId: 'b1', fullName: '   ' }),
    ).toThrow(ValidationError);
  });
});
