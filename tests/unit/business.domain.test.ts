import { describe, it, expect } from 'bun:test';
import {
  Business,
  slugify,
  assertValidTimezone,
} from '../../src/modules/business/domain/business';
import { Membership } from '../../src/modules/business/domain/membership';
import { ValidationError } from '../../src/shared/domain/errors';

describe('slugify', () => {
  it('strips diacritics and lowercases', () => {
    expect(slugify('Peluquería José')).toBe('peluqueria-jose');
  });
  it('collapses non-alphanumerics into single hyphens', () => {
    expect(slugify('  Hair & Nails!!  ')).toBe('hair-nails');
  });
  it('rejects a name with no alphanumerics', () => {
    expect(() => slugify('***')).toThrow(ValidationError);
  });
});

describe('assertValidTimezone', () => {
  it('accepts a valid IANA zone', () => {
    expect(assertValidTimezone('America/Bogota')).toBe('America/Bogota');
  });
  it('rejects an unknown zone', () => {
    expect(() => assertValidTimezone('Mars/Phobos')).toThrow(ValidationError);
  });
});

describe('Business.create', () => {
  it('derives a slug from the name and defaults timezone to UTC', () => {
    const b = Business.create({ id: 'b1', name: 'Barber Shop' });
    expect(b.slug).toBe('barber-shop');
    expect(b.timezone).toBe('UTC');
  });
  it('rejects a name shorter than 2 chars', () => {
    expect(() => Business.create({ id: 'b1', name: 'A' })).toThrow(ValidationError);
  });
  it('changeTimezone validates the new zone', () => {
    const b = Business.create({ id: 'b1', name: 'Shop' });
    expect(() => b.changeTimezone('Nope/Nowhere')).toThrow(ValidationError);
    b.changeTimezone('Europe/Madrid');
    expect(b.timezone).toBe('Europe/Madrid');
  });
});

describe('Membership.create', () => {
  it('defaults to active', () => {
    const m = Membership.create({
      id: 'm1',
      businessId: 'b1',
      userId: 'u1',
      role: 'STAFF',
    });
    expect(m.isActive).toBe(true);
    expect(m.isOwner).toBe(false);
  });
  it('rejects an invalid role', () => {
    expect(() =>
      Membership.create({
        id: 'm1',
        businessId: 'b1',
        userId: 'u1',
        // @ts-expect-error testing invalid role
        role: 'ADMIN',
      }),
    ).toThrow(ValidationError);
  });
  it('deactivate / activate toggle active state', () => {
    const m = Membership.create({
      id: 'm1',
      businessId: 'b1',
      userId: 'u1',
      role: 'OWNER',
    });
    m.deactivate();
    expect(m.isActive).toBe(false);
    m.activate();
    expect(m.isActive).toBe(true);
  });
});
