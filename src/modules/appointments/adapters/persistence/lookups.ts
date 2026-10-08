import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import type { ServiceLookup, CustomerLookup, StaffLookup } from '../../application/ports';

/** Reads just what the appointment use cases need from the services table. */
export class DrizzleServiceLookup implements ServiceLookup {
  constructor(private readonly db: Database) {}

  async find(
    businessId: string,
    serviceId: string,
    tx?: TransactionContext,
  ): Promise<
    | { id: string; durationMinutes: number; priceMinor: number; currency: string; active: boolean; deleted: boolean }
    | null
  > {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.services)
      .where(and(eq(schema.services.businessId, businessId), eq(schema.services.id, serviceId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      durationMinutes: row.durationMinutes,
      priceMinor: row.priceMinor,
      currency: row.currency,
      active: row.active,
      deleted: row.deletedAt !== null,
    };
  }
}

export class DrizzleCustomerLookup implements CustomerLookup {
  constructor(private readonly db: Database) {}

  async exists(
    businessId: string,
    customerId: string,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const rows = await txDb(this.db, tx)
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.businessId, businessId),
          eq(schema.customers.id, customerId),
          isNull(schema.customers.deletedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}

export class DrizzleStaffLookup implements StaffLookup {
  constructor(private readonly db: Database) {}

  async isActiveMember(
    businessId: string,
    membershipId: string,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const rows = await txDb(this.db, tx)
      .select({ id: schema.businessMembers.id })
      .from(schema.businessMembers)
      .where(
        and(
          eq(schema.businessMembers.businessId, businessId),
          eq(schema.businessMembers.id, membershipId),
          eq(schema.businessMembers.active, true),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
