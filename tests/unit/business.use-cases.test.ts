import { describe, it, expect, beforeEach } from 'bun:test';
import { createBusiness } from '../../src/modules/business/application/use-cases/create-business';
import {
  inviteStaff,
  changeStaffRole,
  deactivateStaff,
  listStaff,
} from '../../src/modules/business/application/use-cases/manage-staff';
import { ConflictError, NotFoundError } from '../../src/shared/domain/errors';
import { Membership } from '../../src/modules/business/domain/membership';
import {
  FakeUnitOfWork,
  InMemoryBusinessRepository,
  InMemoryMembershipRepository,
  CapturingAuditLog,
} from './business-fakes';
import { InMemoryUserRepository, FakeHasher, FixedClock, SeqIdGenerator } from './auth-fakes';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function makeDeps() {
  return {
    businesses: new InMemoryBusinessRepository(),
    memberships: new InMemoryMembershipRepository(),
    users: new InMemoryUserRepository(),
    audit: new CapturingAuditLog(),
    hasher: new FakeHasher(),
    ids: new SeqIdGenerator(),
    clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
    uow: new FakeUnitOfWork(),
  };
}

describe('createBusiness', () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('creates the business and makes the caller an OWNER', async () => {
    const result = await createBusiness(
      { actorUserId: 'u1', name: 'Barber Shop', timezone: 'America/Bogota' },
      deps,
    );
    expect(result.slug).toBe('barber-shop');

    const business = await deps.businesses.findById(result.businessId);
    expect(business?.timezone).toBe('America/Bogota');

    const membership = await deps.memberships.findByUserAndBusiness(
      'u1',
      result.businessId,
    );
    expect(membership?.isOwner).toBe(true);
    expect(membership?.isActive).toBe(true);
    expect(deps.audit.entries[0]?.action).toBe('business.created');
  });

  it('rejects a duplicate slug', async () => {
    await createBusiness({ actorUserId: 'u1', name: 'Barber Shop' }, deps);
    await expect(
      createBusiness({ actorUserId: 'u2', name: 'Barber Shop' }, deps),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('inviteStaff', () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('creates a provisional user and binds them as STAFF', async () => {
    const result = await inviteStaff(
      {
        actorUserId: 'owner',
        businessId: 'b1',
        email: 'new@shop.com',
        fullName: 'New Hire',
        role: 'STAFF',
      },
      deps,
    );
    expect(result.created).toBe(true);
    const staff = await listStaff('b1', deps);
    expect(staff).toHaveLength(1);
    expect(staff[0]?.role).toBe('STAFF');
  });

  it('binds an existing user without creating a new one', async () => {
    const first = await inviteStaff(
      { actorUserId: 'owner', businessId: 'b1', email: 'x@shop.com', fullName: 'X', role: 'STAFF' },
      deps,
    );
    // Different business, same email → reuse the user, new membership.
    const second = await inviteStaff(
      { actorUserId: 'owner2', businessId: 'b2', email: 'x@shop.com', fullName: 'X', role: 'STAFF' },
      deps,
    );
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it('rejects re-inviting an existing member of the same business', async () => {
    await inviteStaff(
      { actorUserId: 'owner', businessId: 'b1', email: 'x@shop.com', fullName: 'X', role: 'STAFF' },
      deps,
    );
    await expect(
      inviteStaff(
        { actorUserId: 'owner', businessId: 'b1', email: 'x@shop.com', fullName: 'X', role: 'STAFF' },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('tenant isolation (IDOR)', () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('cannot change the role of a membership belonging to another business', async () => {
    // membership m-foreign lives in business B2
    await deps.memberships.save(
      Membership.create({ id: 'm-foreign', businessId: 'b2', userId: 'victim', role: 'STAFF' }),
    );
    // Attacker operates in business B1 but references the foreign membership id.
    await expect(
      changeStaffRole(
        { actorUserId: 'attacker', businessId: 'b1', membershipId: 'm-foreign', role: 'OWNER' },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Unchanged.
    const m = await deps.memberships.findById('m-foreign');
    expect(m?.isOwner).toBe(false);
  });

  it('cannot deactivate a membership belonging to another business', async () => {
    await deps.memberships.save(
      Membership.create({ id: 'm-foreign', businessId: 'b2', userId: 'victim', role: 'STAFF' }),
    );
    await expect(
      deactivateStaff(
        { actorUserId: 'attacker', businessId: 'b1', membershipId: 'm-foreign' },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    const m = await deps.memberships.findById('m-foreign');
    expect(m?.isActive).toBe(true);
  });
});

describe('last-owner protection', () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('cannot demote the last active owner', async () => {
    await deps.memberships.save(
      Membership.create({ id: 'owner-m', businessId: 'b1', userId: 'u1', role: 'OWNER' }),
    );
    await expect(
      changeStaffRole(
        { actorUserId: 'u1', businessId: 'b1', membershipId: 'owner-m', role: 'STAFF' },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('cannot deactivate the last active owner', async () => {
    await deps.memberships.save(
      Membership.create({ id: 'owner-m', businessId: 'b1', userId: 'u1', role: 'OWNER' }),
    );
    await expect(
      deactivateStaff({ actorUserId: 'u1', businessId: 'b1', membershipId: 'owner-m' }, deps),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows demoting an owner when another active owner remains', async () => {
    await deps.memberships.save(
      Membership.create({ id: 'owner-1', businessId: 'b1', userId: 'u1', role: 'OWNER' }),
    );
    await deps.memberships.save(
      Membership.create({ id: 'owner-2', businessId: 'b1', userId: 'u2', role: 'OWNER' }),
    );
    await changeStaffRole(
      { actorUserId: 'u1', businessId: 'b1', membershipId: 'owner-2', role: 'STAFF' },
      deps,
    );
    const m = await deps.memberships.findById('owner-2');
    expect(m?.role).toBe('STAFF');
  });
});
