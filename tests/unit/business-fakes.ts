import { Business } from '../../src/modules/business/domain/business';
import { Membership } from '../../src/modules/business/domain/membership';
import type {
  BusinessRepository,
  MembershipRepository,
  MembershipView,
  AuditLogRepository,
  AuditEntry,
} from '../../src/modules/business/application/ports';
import type {
  UnitOfWork,
  TransactionContext,
} from '../../src/shared/application/ports';

/** Pass-through UoW: runs the work with a dummy context (no real tx needed). */
export class FakeUnitOfWork implements UnitOfWork {
  async withTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    const ctx: TransactionContext = { _brand: 'TransactionContext' };
    return work(ctx);
  }
}

export class InMemoryBusinessRepository implements BusinessRepository {
  private byId = new Map<string, Business>();
  private bySlug = new Map<string, string>();

  async findById(id: string): Promise<Business | null> {
    return this.byId.get(id) ?? null;
  }
  async findBySlug(slug: string): Promise<Business | null> {
    const id = this.bySlug.get(slug);
    return id ? (this.byId.get(id) ?? null) : null;
  }
  async save(business: Business): Promise<void> {
    this.byId.set(business.id, business);
    this.bySlug.set(business.slug, business.id);
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  rows: Membership[] = [];

  async findById(id: string): Promise<Membership | null> {
    return this.rows.find((m) => m.id === id) ?? null;
  }
  async findByUserAndBusiness(
    userId: string,
    businessId: string,
  ): Promise<Membership | null> {
    return (
      this.rows.find((m) => m.userId === userId && m.businessId === businessId) ??
      null
    );
  }
  async listByUser(userId: string): Promise<MembershipView[]> {
    return this.rows.filter((m) => m.userId === userId).map(toView);
  }
  async listByBusiness(businessId: string): Promise<MembershipView[]> {
    return this.rows.filter((m) => m.businessId === businessId).map(toView);
  }
  async countActiveOwners(businessId: string): Promise<number> {
    return this.rows.filter(
      (m) => m.businessId === businessId && m.isOwner && m.isActive,
    ).length;
  }
  async save(membership: Membership): Promise<void> {
    const idx = this.rows.findIndex((m) => m.id === membership.id);
    if (idx >= 0) this.rows[idx] = membership;
    else this.rows.push(membership);
  }
}

export class CapturingAuditLog implements AuditLogRepository {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

function toView(m: Membership): MembershipView {
  const s = m.snapshot();
  return {
    id: s.id,
    businessId: s.businessId,
    userId: s.userId,
    role: s.role,
    active: s.active,
  };
}
