import type { PasswordHasher } from '../../shared/application/ports';

/**
 * Argon2id password hasher backed by Bun's native crypto.
 * Parameters follow OWASP guidance (64 MiB, 3 iterations).
 */
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return Bun.password.hash(plain, {
      algorithm: 'argon2id',
      memoryCost: 65536,
      timeCost: 3,
    });
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await Bun.password.verify(plain, hash);
    } catch {
      // Malformed hash → treat as a failed verification, never throw to caller.
      return false;
    }
  }
}
