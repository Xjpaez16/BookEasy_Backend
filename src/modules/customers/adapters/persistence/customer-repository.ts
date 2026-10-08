import { and, eq, isNull, or, ilike, desc } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { Customer } from '../../domain/customer';
import type { CustomerRepository } from '../../application/ports';

type Row = typeof schema.customers.$inferSelect;

/** Drizzle-backed CustomerRepository. Every query is scoped by business_id. */
export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(private readonly db: Database) {}

  async findById(
    businessId: string,
    id: string,
    tx?: TransactionContext,
  ): Promise<Customer | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.customers)
      .where(
        and(eq(schema.customers.businessId, businessId), eq(schema.customers.id, id)),
      )
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async listByBusiness(
    businessId: string,
    opts?: { search?: string },
    tx?: TransactionContext,
  ): Promise<Customer[]> {
    const conditions = [
      eq(schema.customers.businessId, businessId),
      isNull(schema.customers.deletedAt),
    ];
    const term = opts?.search?.trim();
    if (term) {
      const like = `%${term}%`;
      const match = or(
        ilike(schema.customers.fullName, like),
        ilike(schema.customers.phone, like),
        ilike(schema.customers.email, like),
      );
      if (match) conditions.push(match);
    }

    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.customers)
      .where(and(...conditions))
      .orderBy(desc(schema.customers.createdAt));
    return rows.map((r) => this.toDomain(r));
  }

  async save(customer: Customer, tx?: TransactionContext): Promise<void> {
    const s = customer.snapshot();
    await txDb(this.db, tx)
      .insert(schema.customers)
      .values({
        id: s.id,
        businessId: s.businessId,
        fullName: s.fullName,
        phone: s.phone,
        email: s.email,
        notes: s.notes,
        deletedAt: s.deletedAt,
      })
      .onConflictDoUpdate({
        target: schema.customers.id,
        set: {
          fullName: s.fullName,
          phone: s.phone,
          email: s.email,
          notes: s.notes,
          deletedAt: s.deletedAt,
          updatedAt: new Date(),
        },
      });
  }

  private toDomain(row: Row): Customer {
    return Customer.create({
      id: row.id,
      businessId: row.businessId,
      fullName: row.fullName,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      deletedAt: row.deletedAt,
    });
  }
}
