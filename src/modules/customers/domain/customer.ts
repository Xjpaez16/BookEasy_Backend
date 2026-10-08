import { ValidationError } from '../../../shared/domain/errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-ish: optional +, 7–15 digits, allowing spaces/dashes/parens on input.
const PHONE_RE = /^\+?[0-9]{7,15}$/;

/** Normalizes a phone to digits (+ optional leading +). Null when empty. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s\-()]/g, '');
  if (!PHONE_RE.test(compact)) {
    throw new ValidationError('Invalid phone number');
  }
  return compact;
}

/** Validates/normalizes an optional email. Null when empty. */
export function normalizeOptionalEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (!EMAIL_RE.test(email) || email.length > 320) {
    throw new ValidationError('Invalid email address');
  }
  return email;
}

export interface CustomerProps {
  id: string;
  businessId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  deletedAt: Date | null;
}

/**
 * Customer aggregate: a person a business serves. Contact details are
 * optional but validated when present. Soft-deleted customers are retained
 * (appointment history references them) and excluded from active listings.
 */
export class Customer {
  private constructor(private props: CustomerProps) {}

  static create(props: {
    id: string;
    businessId: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    deletedAt?: Date | null;
  }): Customer {
    if (!props.businessId) throw new ValidationError('businessId is required');
    const fullName = props.fullName.trim();
    if (fullName.length < 1 || fullName.length > 200) {
      throw new ValidationError('Customer name must be between 1 and 200 characters');
    }
    return new Customer({
      id: props.id,
      businessId: props.businessId,
      fullName,
      phone: normalizePhone(props.phone),
      email: normalizeOptionalEmail(props.email),
      notes: props.notes?.trim() || null,
      deletedAt: props.deletedAt ?? null,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get businessId(): string {
    return this.props.businessId;
  }
  get isDeleted(): boolean {
    return this.props.deletedAt !== null;
  }

  update(changes: {
    fullName?: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
  }): void {
    if (this.props.deletedAt) {
      throw new ValidationError('Cannot update a deleted customer');
    }
    if (changes.fullName !== undefined) {
      const fullName = changes.fullName.trim();
      if (fullName.length < 1 || fullName.length > 200) {
        throw new ValidationError('Customer name must be between 1 and 200 characters');
      }
      this.props.fullName = fullName;
    }
    if (changes.phone !== undefined) this.props.phone = normalizePhone(changes.phone);
    if (changes.email !== undefined) {
      this.props.email = normalizeOptionalEmail(changes.email);
    }
    if (changes.notes !== undefined) this.props.notes = changes.notes?.trim() || null;
  }

  softDelete(at: Date): void {
    if (this.props.deletedAt) return; // idempotent
    this.props.deletedAt = at;
  }

  snapshot(): Readonly<CustomerProps> {
    return { ...this.props };
  }
}
