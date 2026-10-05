import { User, normalizeEmail } from '../../domain/user';
import { ConflictError } from '../../../../shared/domain/errors';
import type {
  Clock,
  IdGenerator,
  PasswordHasher,
} from '../../../../shared/application/ports';
import type {
  UserRepository,
  VerificationTokenStore,
  EmailSender,
} from '../ports';
import { crypto } from '../../../../infrastructure/security/token-utils';

const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface RegisterUserInput {
  email: string;
  password: string;
  fullName: string;
}

export interface RegisterUserDeps {
  users: UserRepository;
  hasher: PasswordHasher;
  ids: IdGenerator;
  clock: Clock;
  verificationTokens: VerificationTokenStore;
  email: EmailSender;
}

export interface RegisterUserResult {
  userId: string;
}

/**
 * Registers a new user. Fails if the email is already taken. Issues a hashed
 * email-verification token and sends it. The raw token never touches the DB.
 */
export async function registerUser(
  input: RegisterUserInput,
  deps: RegisterUserDeps,
): Promise<RegisterUserResult> {
  const email = normalizeEmail(input.email);

  const existing = await deps.users.findByEmail(email);
  if (existing) {
    // Do not reveal account existence beyond a generic conflict.
    throw new ConflictError('Email is already registered');
  }

  const passwordHash = await deps.hasher.hash(input.password);
  const user = User.create({
    id: deps.ids.generate(),
    email,
    passwordHash,
    fullName: input.fullName.trim(),
    emailVerifiedAt: null,
  });
  await deps.users.save(user);

  const rawToken = crypto.randomToken();
  await deps.verificationTokens.issue({
    userId: user.id,
    purpose: 'EMAIL_VERIFICATION',
    tokenHash: crypto.sha256(rawToken),
    ttlSeconds: EMAIL_VERIFICATION_TTL_SECONDS,
  });
  await deps.email.sendEmailVerification(user.email, rawToken);

  return { userId: user.id };
}
