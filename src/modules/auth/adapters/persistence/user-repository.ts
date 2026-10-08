import { eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { User } from '../../domain/user';
import type { UserRepository } from '../../application/ports';

/** Drizzle-backed UserRepository. Maps rows <-> domain User. */
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string, tx?: TransactionContext): Promise<User | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string, tx?: TransactionContext): Promise<User | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async save(user: User, tx?: TransactionContext): Promise<void> {
    const s = user.snapshot();
    await txDb(this.db, tx)
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
