import { ValidationError } from '../../../shared/domain/errors';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derives a URL-safe slug from a business name. Lowercase, hyphen-separated,
 * ASCII only. Diacritics are stripped so "Peluquería José" -> "peluqueria-jose".
 */
export function slugify(raw: string): string {
  const slug = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  if (!slug) {
    throw new ValidationError('Business name must contain at least one alphanumeric character');
  }
  return slug;
}

/**
 * Validates an IANA timezone identifier using the host Intl database.
 * Falls back to a permissive shape check if Intl is unavailable.
 */
export function assertValidTimezone(tz: string): string {
  const value = tz.trim();
  if (!value) throw new ValidationError('Timezone is required');
  try {
    // Throws RangeError for an unknown timezone.
    new Intl.DateTimeFormat('en-US', { timeZone: value });
  } catch {
    throw new ValidationError(`Invalid timezone: ${value}`);
  }
  return value;
}

export interface BusinessProps {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

/**
 * Business aggregate (the tenant root). Holds identity, display name,
 * URL slug and the business timezone. All appointment timestamps are stored
 * in UTC; this timezone is how they are presented to the business.
 */
export class Business {
  private constructor(private props: BusinessProps) {}

  static create(props: {
    id: string;
    name: string;
    slug?: string;
    timezone?: string;
  }): Business {
    const name = props.name.trim();
    if (name.length < 2 || name.length > 200) {
      throw new ValidationError('Business name must be between 2 and 200 characters');
    }
    const slug = props.slug ? Business.assertSlug(props.slug) : slugify(name);
    const timezone = assertValidTimezone(props.timezone ?? 'UTC');
    return new Business({ id: props.id, name, slug, timezone });
  }

  private static assertSlug(raw: string): string {
    const slug = raw.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.length > 120) {
      throw new ValidationError('Invalid business slug');
    }
    return slug;
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get slug(): string {
    return this.props.slug;
  }
  get timezone(): string {
    return this.props.timezone;
  }

  rename(name: string): void {
    const next = name.trim();
    if (next.length < 2 || next.length > 200) {
      throw new ValidationError('Business name must be between 2 and 200 characters');
    }
    this.props.name = next;
  }

  changeTimezone(tz: string): void {
    this.props.timezone = assertValidTimezone(tz);
  }

  snapshot(): Readonly<BusinessProps> {
    return { ...this.props };
  }
}
