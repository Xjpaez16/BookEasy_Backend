import { ValidationError } from '../../../shared/domain/errors';

const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_DURATION_MINUTES = 24 * 60; // a single service cannot exceed one day

/** Validates an ISO-4217-shaped currency code (3 uppercase letters). */
export function assertCurrency(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!CURRENCY_RE.test(code)) {
    throw new ValidationError('Currency must be a 3-letter ISO code');
  }
  return code;
}

export interface ServiceProps {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  active: boolean;
  deletedAt: Date | null;
}

/**
 * Service aggregate: a bookable offering of a business (duration + price).
 *
 * Money is stored as integer MINOR units (e.g. cents) — never a float.
 * Soft-deleted services are retained (historical appointments reference them)
 * but excluded from active listings.
 */
export class Service {
  private constructor(private props: ServiceProps) {}

  static create(props: {
    id: string;
    businessId: string;
    name: string;
    description?: string | null;
    durationMinutes: number;
    priceMinor?: number;
    currency?: string;
    active?: boolean;
    deletedAt?: Date | null;
  }): Service {
    if (!props.businessId) throw new ValidationError('businessId is required');
    const name = props.name.trim();
    if (name.length < 1 || name.length > 200) {
      throw new ValidationError('Service name must be between 1 and 200 characters');
    }
    Service.assertDuration(props.durationMinutes);
    const priceMinor = props.priceMinor ?? 0;
    Service.assertPrice(priceMinor);
    return new Service({
      id: props.id,
      businessId: props.businessId,
      name,
      description: props.description?.trim() || null,
      durationMinutes: props.durationMinutes,
      priceMinor,
      currency: assertCurrency(props.currency ?? 'USD'),
      active: props.active ?? true,
      deletedAt: props.deletedAt ?? null,
    });
  }

  private static assertDuration(minutes: number): void {
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_DURATION_MINUTES) {
      throw new ValidationError('Duration must be a positive integer up to 1440 minutes');
    }
  }

  private static assertPrice(priceMinor: number): void {
    if (!Number.isInteger(priceMinor) || priceMinor < 0) {
      throw new ValidationError('Price must be a non-negative integer in minor units');
    }
  }

  get id(): string {
    return this.props.id;
  }
  get businessId(): string {
    return this.props.businessId;
  }
  get isActive(): boolean {
    return this.props.active;
  }
  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }
  get durationMinutes(): number {
    return this.props.durationMinutes;
  }

  update(changes: {
    name?: string;
    description?: string | null;
    durationMinutes?: number;
    priceMinor?: number;
    currency?: string;
    active?: boolean;
  }): void {
    if (this.props.deletedAt) {
      throw new ValidationError('Cannot update a deleted service');
    }
    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (name.length < 1 || name.length > 200) {
        throw new ValidationError('Service name must be between 1 and 200 characters');
      }
      this.props.name = name;
    }
    if (changes.description !== undefined) {
      this.props.description = changes.description?.trim() || null;
    }
    if (changes.durationMinutes !== undefined) {
      Service.assertDuration(changes.durationMinutes);
      this.props.durationMinutes = changes.durationMinutes;
    }
    if (changes.priceMinor !== undefined) {
      Service.assertPrice(changes.priceMinor);
      this.props.priceMinor = changes.priceMinor;
    }
    if (changes.currency !== undefined) {
      this.props.currency = assertCurrency(changes.currency);
    }
    if (changes.active !== undefined) {
      this.props.active = changes.active;
    }
  }

  softDelete(at: Date): void {
    if (this.props.deletedAt) return; // idempotent
    this.props.deletedAt = at;
    this.props.active = false;
  }

  snapshot(): Readonly<ServiceProps> {
    return { ...this.props };
  }
}
