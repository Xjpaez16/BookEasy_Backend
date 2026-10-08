import { Membership, type MembershipRole } from '../../domain/membership';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/errors';
import { User, normalizeEmail } from '../../../auth/domain/user';
import type {
  Clock,
  IdGenerator,
  PasswordHasher,
  UnitOfWork,
} from '../../../../shared/application/ports';
import type { UserRepository } from '../../../auth/application/ports';
import type {
  MembershipRepository,
  MembershipView,
  AuditLogRepository,
} from '../ports';
import { crypto } from '../../../../infrastructure/security/token-utils';

export interface StaffMember {
  membershipId: string;
  userId: string;
  role: MembershipRole;
  active: boolean;
}

/** Lists staff for the caller's business (tenant-scoped). */
export async function listStaff(
  businessId: string,
  deps: { memberships: MembershipRepository },
): Promise<StaffMember[]> {
  const rows = await deps.memberships.listByBusiness(businessId);
  return rows.map((r: MembershipView) => ({
    membershipId: r.id,
    userId: r.userId,
    role: r.role,
    active: r.active,
  }));
}

export interface InviteStaffInput {
  actorUserId: string;
  businessId: string;
  email: string;
  fullName: string;
  role: MembershipRole;
}

export interface InviteStaffDeps {
  users: UserRepository;
  memberships: MembershipRepository;
  audit: AuditLogRepository;
  hasher: PasswordHasher;
  ids: IdGenerator;
  clock: Clock;
  uow: UnitOfWork;
}

export interface InviteStaffResult {
  membershipId: string;
  userId: string;
  created: boolean;
}

/**
 * Adds a staff member to the caller's business. If no user exists for the
 * email, a provisional account is created with a random password (the person
 * completes it via password-reset). An existing user is simply bound to the
 * business. Re-inviting an existing member is a ConflictError.
 */
export async function inviteStaff(
  input: InviteStaffInput,
  deps: InviteStaffDeps,
): Promise<InviteStaffResult> {
  if (input.role !== 'OWNER' && input.role !== 'STAFF') {
    throw new ValidationError('Invalid role');
  }
  const email = normalizeEmail(input.email);

  return deps.uow.withTransaction(async (tx) => {
    let user = await deps.users.findByEmail(email, tx);
    let created = false;

    if (!user) {
      const randomPassword = crypto.randomToken();
      const passwordHash = await deps.hasher.hash(randomPassword);
      user = User.create({
        id: deps.ids.generate(),
        email,
        passwordHash,
        fullName: input.fullName.trim(),
        emailVerifiedAt: null,
      });
      await deps.users.save(user, tx);
      created = true;
    }

    const existing = await deps.memberships.findByUserAndBusiness(
      user.id,
      input.businessId,
      tx,
    );
    if (existing) {
      throw new ConflictError('User is already a member of this business');
    }

    const membership = Membership.create({
      id: deps.ids.generate(),
      businessId: input.businessId,
      userId: user.id,
      role: input.role,
      active: true,
    });
    await deps.memberships.save(membership, tx);

    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'staff.invited',
        targetType: 'membership',
        targetId: membership.id,
        metadata: { role: input.role, created },
      },
      tx,
    );

    return { membershipId: membership.id, userId: user.id, created };
  });
}

export interface ChangeStaffRoleInput {
  actorUserId: string;
  businessId: string;
  membershipId: string;
  role: MembershipRole;
}

export interface MembershipMutationDeps {
  memberships: MembershipRepository;
  audit: AuditLogRepository;
  clock: Clock;
  uow: UnitOfWork;
}

/**
 * Changes a staff member's role. Guards against demoting the last active
 * OWNER (which would orphan the tenant). Tenant isolation: the membership
 * must belong to the caller's business.
 */
export async function changeStaffRole(
  input: ChangeStaffRoleInput,
  deps: MembershipMutationDeps,
): Promise<void> {
  await deps.uow.withTransaction(async (tx) => {
    const membership = await deps.memberships.findById(input.membershipId, tx);
    if (!membership || membership.businessId !== input.businessId) {
      throw new NotFoundError('Membership not found');
    }

    if (membership.isOwner && input.role === 'STAFF') {
      const owners = await deps.memberships.countActiveOwners(input.businessId, tx);
      if (owners <= 1) {
        throw new ConflictError('Cannot demote the last owner of the business');
      }
    }

    membership.changeRole(input.role);
    await deps.memberships.save(membership, tx);

    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'staff.role_changed',
        targetType: 'membership',
        targetId: membership.id,
        metadata: { role: input.role },
      },
      tx,
    );
  });
}

export interface DeactivateStaffInput {
  actorUserId: string;
  businessId: string;
  membershipId: string;
}

/**
 * Deactivates a staff member (soft removal — membership history is kept).
 * Guards against removing the last active OWNER. Owners cannot deactivate
 * their own last-owner membership.
 */
export async function deactivateStaff(
  input: DeactivateStaffInput,
  deps: MembershipMutationDeps,
): Promise<void> {
  await deps.uow.withTransaction(async (tx) => {
    const membership = await deps.memberships.findById(input.membershipId, tx);
    if (!membership || membership.businessId !== input.businessId) {
      throw new NotFoundError('Membership not found');
    }
    if (!membership.isActive) return; // idempotent

    if (membership.isOwner) {
      const owners = await deps.memberships.countActiveOwners(input.businessId, tx);
      if (owners <= 1) {
        throw new ConflictError('Cannot remove the last owner of the business');
      }
    }

    membership.deactivate();
    await deps.memberships.save(membership, tx);

    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'staff.deactivated',
        targetType: 'membership',
        targetId: membership.id,
      },
      tx,
    );
  });
}
