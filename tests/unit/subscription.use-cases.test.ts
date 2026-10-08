import { describe, it, expect } from 'bun:test';
import {
  Subscription,
  planLimits,
} from '../../src/modules/subscriptions/domain/subscription';
import {
  ensureSubscription,
  getSubscription,
  changePlan,
  cancelSubscription,
  type SubscriptionDeps,
} from '../../src/modules/subscriptions/application/use-cases/manage-subscription';
import { createBusiness } from '../../src/modules/business/application/use-cases/create-business';
import { SubscriptionInitializerAdapter } from '../../src/modules/business/adapters/subscriptions/subscription-initializer';
import { InMemorySubscriptionRepository } from './subscription-fakes';
import {
  FakeUnitOfWork,
  InMemoryBusinessRepository,
  InMemoryMembershipRepository,
  CapturingAuditLog,
} from './business-fakes';
import { FixedClock, SeqIdGenerator } from './auth-fakes';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function makeDeps(): SubscriptionDeps & {
  subscriptions: InMemorySubscriptionRepository;
  audit: CapturingAuditLog;
} {
  return {
    subscriptions: new InMemorySubscriptionRepository(),
    audit: new CapturingAuditLog(),
    ids: new SeqIdGenerator(),
    clock: new FixedClock(NOW),
    uow: new FakeUnitOfWork(),
  };
}

describe('Subscription domain', () => {
  it('creates a FREE/ACTIVE subscription with no billing period', () => {
    const sub = Subscription.create({ id: 's1', businessId: 'b1', now: NOW });
    expect(sub.plan).toBe('FREE');
    expect(sub.status).toBe('ACTIVE');
    expect(sub.priceMinor).toBe(0);
    expect(sub.currentPeriodEnd).toBeNull();
    expect(sub.isActive).toBe(true);
  });

  it('exposes plan limits (FREE is capped, PRO is unlimited)', () => {
    expect(planLimits('FREE').maxStaff).toBe(2);
    expect(planLimits('FREE').whatsappReminders).toBe(false);
    expect(planLimits('PRO').maxStaff).toBeNull();
    expect(planLimits('PRO').whatsappReminders).toBe(true);
  });

  it('upgrading to PRO sets price and a billing period', () => {
    const sub = Subscription.create({ id: 's1', businessId: 'b1', now: NOW });
    sub.changePlan('PRO', NOW);
    expect(sub.plan).toBe('PRO');
    expect(sub.priceMinor).toBe(2900);
    expect(sub.currentPeriodEnd).not.toBeNull();
  });

  it('rejects a no-op change to the same active plan', () => {
    const sub = Subscription.create({ id: 's1', businessId: 'b1', now: NOW });
    expect(() => sub.changePlan('FREE', NOW)).toThrow();
  });

  it('cannot transition CANCELLED → PAST_DUE', () => {
    const sub = Subscription.create({ id: 's1', businessId: 'b1', now: NOW });
    sub.cancel(NOW);
    expect(sub.status).toBe('CANCELLED');
    expect(() => sub.markPastDue(NOW)).toThrow();
  });

  it('a plan change reactivates a cancelled subscription', () => {
    const sub = Subscription.create({ id: 's1', businessId: 'b1', now: NOW });
    sub.cancel(NOW);
    sub.changePlan('PRO', NOW);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.plan).toBe('PRO');
  });
});

describe('ensureSubscription', () => {
  it('creates a FREE subscription and audits it', async () => {
    const deps = makeDeps();
    const sub = await ensureSubscription(
      { businessId: 'b1', actorUserId: 'u1' },
      deps,
    );
    expect(sub.plan).toBe('FREE');
    expect(deps.subscriptions.get('b1')).toBeDefined();
    expect(deps.audit.entries.some((e) => e.action === 'subscription.created')).toBe(
      true,
    );
  });

  it('is idempotent — a second call returns the same subscription', async () => {
    const deps = makeDeps();
    const first = await ensureSubscription(
      { businessId: 'b1', actorUserId: 'u1' },
      deps,
    );
    const second = await ensureSubscription(
      { businessId: 'b1', actorUserId: 'u1' },
      deps,
    );
    expect(second.id).toBe(first.id);
    expect(
      deps.audit.entries.filter((e) => e.action === 'subscription.created').length,
    ).toBe(1);
  });
});

describe('changePlan / cancel', () => {
  it('changes the plan and audits from→to', async () => {
    const deps = makeDeps();
    await ensureSubscription({ businessId: 'b1', actorUserId: 'u1' }, deps);
    const sub = await changePlan(
      { businessId: 'b1', actorUserId: 'u1', plan: 'PRO' },
      deps,
    );
    expect(sub.plan).toBe('PRO');
    const audit = deps.audit.entries.find(
      (e) => e.action === 'subscription.plan_changed',
    );
    expect(audit?.metadata).toMatchObject({ from: 'FREE', to: 'PRO' });
  });

  it('getSubscription throws NotFound when none exists', async () => {
    const deps = makeDeps();
    await expect(getSubscription({ businessId: 'nope' }, deps)).rejects.toThrow();
  });

  it('cancels and audits', async () => {
    const deps = makeDeps();
    await ensureSubscription({ businessId: 'b1', actorUserId: 'u1' }, deps);
    const sub = await cancelSubscription(
      { businessId: 'b1', actorUserId: 'u1' },
      deps,
    );
    expect(sub.status).toBe('CANCELLED');
    expect(
      deps.audit.entries.some((e) => e.action === 'subscription.cancelled'),
    ).toBe(true);
  });
});

describe('createBusiness provisions a subscription', () => {
  it('a new business is born with a FREE/ACTIVE subscription', async () => {
    const subs = new InMemorySubscriptionRepository();
    const audit = new CapturingAuditLog();
    const clock = new FixedClock(NOW);
    const ids = new SeqIdGenerator();
    const uow = new FakeUnitOfWork();

    const businessDeps = {
      businesses: new InMemoryBusinessRepository(),
      memberships: new InMemoryMembershipRepository(),
      audit,
      ids,
      clock,
      uow,
      subscriptions: new SubscriptionInitializerAdapter({
        subscriptions: subs,
        audit,
        ids,
        clock,
        uow,
      }),
    };

    const result = await createBusiness(
      { actorUserId: 'u1', name: 'Barbería Central' },
      businessDeps,
    );

    const sub = subs.get(result.businessId);
    expect(sub).toBeDefined();
    expect(sub?.plan).toBe('FREE');
    expect(sub?.status).toBe('ACTIVE');
  });
});
