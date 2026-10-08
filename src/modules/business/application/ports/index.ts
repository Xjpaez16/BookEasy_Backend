import type { TransactionContext } from '../../../../shared/application/ports';
import type { Business } from '../../domain/business';
import type { Membership, MembershipRole } from '../../domain/membership';

export interface BusinessRepository {
  findById(id: string, tx?: TransactionContext): Promise<Business | null>;
  findBySlug(slug: string, tx?: TransactionContext): Promise<Business | null>;
  save(business: Business, tx?: TransactionContext): Promise<void>;
}

export interface MembershipView {
  id: string;
  businessId: string;
  userId: string;
  role: MembershipRole;
  active: boolean;
}

export interface MembershipRepository {
  findById(id: string, tx?: TransactionContext): Promise<Membership | null>;
  /** The membership binding a user to a specific business, if any. */
  findByUserAndBusiness(
    userId: string,
    businessId: string,
    tx?: TransactionContext,
  ): Promise<Membership | null>;
  /** All memberships for a user (used to resolve their default tenant). */
  listByUser(userId: string, tx?: TransactionContext): Promise<MembershipView[]>;
  /** Staff listing for a business (tenant-scoped). */
  listByBusiness(businessId: string, tx?: TransactionContext): Promise<MembershipView[]>;
  /** Count of ACTIVE owners in a business — guards last-owner removal. */
  countActiveOwners(businessId: string, tx?: TransactionContext): Promise<number>;
  save(membership: Membership, tx?: TransactionContext): Promise<void>;
}

export interface AuditEntry {
  businessId: string | null;
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail for sensitive operations. Never records secrets
 * or sensitive payloads — only identifiers and the action taken.
 */
export interface AuditLogRepository {
  record(entry: AuditEntry, tx?: TransactionContext): Promise<void>;
}
