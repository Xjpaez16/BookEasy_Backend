import { ValidationError } from '../../../shared/domain/errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalizes and validates an email address. Lowercase + trimmed. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 320) {
    throw new ValidationError('Invalid email address');
  }
  return email;
}

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  emailVerifiedAt: Date | null;
}

/**
 * User aggregate. Holds identity + credential invariants only.
 * Hashing itself is a port (PasswordHasher) — the domain stores the hash.
 */
export class User {
  private constructor(private props: UserProps) {}

  static create(props: UserProps): User {
    if (!props.passwordHash) {
      throw new ValidationError('Password hash is required');
    }
    if (!props.fullName.trim()) {
      throw new ValidationError('Full name is required');
    }
    return new User({ ...props, email: normalizeEmail(props.email) });
  }

  get id(): string {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get fullName(): string {
    return this.props.fullName;
  }
  get isEmailVerified(): boolean {
    return this.props.emailVerifiedAt !== null;
  }

  verifyEmail(at: Date): void {
    if (this.props.emailVerifiedAt) return;
    this.props.emailVerifiedAt = at;
  }

  changePassword(newHash: string): void {
    if (!newHash) throw new ValidationError('Password hash is required');
    this.props.passwordHash = newHash;
  }

  snapshot(): Readonly<UserProps> {
    return { ...this.props };
  }
}
