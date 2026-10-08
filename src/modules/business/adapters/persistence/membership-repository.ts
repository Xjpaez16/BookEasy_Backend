import { and, eq, count } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { Membership } from '../../domain/membership';
import type {
  MembershipRepository,
  MembershipView,
} from '../../application/ports';

type Row = typeof schema.businessMembers.$inferSelect;

/** Drizzle-backed MembershipRepository. All reads are tenant-scoped. */
export class DrizzleMembershipRepository implements MembershipRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string, tx?: TransactionContext): Promise<Membership | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findByUserAndBusiness(
    userId: string,
    businessId: string,
    tx?: TransactionContext,
  ): Promise<Membership | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.businessMembers)
      .where(
        and(
          eq(schema.businessMembers.userId, userId),
          eq(schema.businessMembers.businessId, businessId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async listByUser(userId: string, tx?: TransactionContext): Promise<MembershipView[]> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.userId, userId));
    return rows.map(this.toView);
  }

  async listByBusiness(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<MembershipView[]> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.businessMembers)
      .where(eq(schema.businessMembers.businessId, businessId));
    return rows.map(this.toView);
  }

  async countActiveOwners(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<number> {
    const rows = await txDb(this.db, tx)
      .select({ value: count() })
      .from(schema.businessMembers)
      .where(
        and(
          eq(schema.businessMembers.businessId, businessId),
          eq(schema.businessMembers.role, 'OWNER'),
          eq(schema.businessMembers.active, true),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  async save(membership: Membership, tx?: TransactionContext): Promise<void> {
    const s = membership.snapshot();
    await txDb(this.db, tx)
      .insert(schema.businessMembers)
      .values({
        id: s.id,
        businessId: s.businessId,
        userId: s.userId,
        role: s.role,
        active: s.active,
      })
      .onConflictDoUpdate({
        target: schema.businessMembers.id,
        set: { role: s.role, active: s.active },
      });
  }

  private toDomain(row: Row): Membership {
    return Membership.create({
      id: row.id,
      businessId: row.businessId,
      userId: row.userId,
      role: row.role,
      active: row.active,
    });
  }

  private toView(row: Row): MembershipView {
    return {
      id: row.id,
      businessId: row.businessId,
      userId: row.userId,
      role: row.role,
      active: row.active,
    };
  }
}
