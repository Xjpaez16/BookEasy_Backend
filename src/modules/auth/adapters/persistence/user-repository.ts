import { eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { User } from '../../domain/user';
import type { UserRepository } from '../../application/ports';

/** Drizzle-backed UserRepository. Maps rows <-> domain User. */
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const s = user.snapshot();
    await this.db
      .insert(schema.users)
      .values({
        id: s.id,
        email: s.email,
        passwordHash: s.passwordHash,
        fullName: s.fullName,
        emailVerifiedAt: s.emailVerifiedAt,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          passwordHash: s.passwordHash,
          fullName: s.fullName,
          emailVerifiedAt: s.emailVerifiedAt,
          updatedAt: new Date(),
        },
      });
  }

  private toDomain(row: typeof schema.users.$inferSelect): User {
    return User.create({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      fullName: row.fullName,
      emailVerifiedAt: row.emailVerifiedAt,
    });
  }
}
