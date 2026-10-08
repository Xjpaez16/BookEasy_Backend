import { NotFoundError } from '../../../../shared/domain/errors';
import type {
  Clock,
  IdGenerator,
  TransactionContext,
  UnitOfWork,
} from '../../../../shared/application/ports';
import type { AuditLogRepository } from '../../../business/application/ports';
import { Subscription } from '../../domain/subscription';
import type { SubscriptionPlan } from '../../domain/subscription';
import type { SubscriptionRepository } from '../ports';

export interface SubscriptionDeps {
  subscriptions: SubscriptionRepository;
  audit: AuditLogRepository;
  ids: IdGenerator;
  clock: Clock;
  uow: UnitOfWork;
}

/**
 * Create the default FREE/ACTIVE subscription for a business if none exists.
 * Idempotent — safe to call at business creation and on retries. Can run
 * inside an existing transaction (passed `tx`) so it's atomic with that write.
 */
export async function ensureSubscription(
  input: { businessId: string; actorUserId: string },
  deps: SubscriptionDeps,
  tx?: TransactionContext,
): Promise<Subscription> {
  const run = async (ctx: TransactionContext): Promise<Subscription> => {
    const existing = await deps.subscriptions.findByBusiness(
      input.businessId,
      ctx,
    );
    if (existing) return existing;

    const sub = Subscription.create({
      id: deps.ids.generate(),
      businessId: input.businessId,
      plan: 'FREE',
      now: deps.clock.now(),
    });
    await deps.subscriptions.save(sub, ctx);
    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'subscription.created',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { plan: sub.plan },
      },
      ctx,
    );
    return sub;
  };

  if (tx) return run(tx);
  return deps.uow.withTransaction(run);
}

export async function getSubscription(
  input: { businessId: string },
  deps: Pick<SubscriptionDeps, 'subscriptions'>,
): Promise<Subscription> {
  const sub = await deps.subscriptions.findByBusiness(input.businessId);
  if (!sub) throw new NotFoundError('Subscription not found');
  return sub;
}

export async function changePlan(
  input: { businessId: string; actorUserId: string; plan: SubscriptionPlan },
  deps: SubscriptionDeps,
): Promise<Subscription> {
  return deps.uow.withTransaction(async (tx) => {
    const sub = await deps.subscriptions.findByBusiness(input.businessId, tx);
    if (!sub) throw new NotFoundError('Subscription not found');

    const previousPlan = sub.plan;
    sub.changePlan(input.plan, deps.clock.now());
    await deps.subscriptions.update(sub, tx);

    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'subscription.plan_changed',
        targetType: 'subscription',
        targetId: sub.id,
        metadata: { from: previousPlan, to: input.plan },
      },
      tx,
    );
    return sub;
  });
}

export async function cancelSubscription(
  input: { businessId: string; actorUserId: string },
  deps: SubscriptionDeps,
): Promise<Subscription> {
  return deps.uow.withTransaction(async (tx) => {
    const sub = await deps.subscriptions.findByBusiness(input.businessId, tx);
    if (!sub) throw new NotFoundError('Subscription not found');

    sub.cancel(deps.clock.now());
    await deps.subscriptions.update(sub, tx);

    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'subscription.cancelled',
        targetType: 'subscription',
        targetId: sub.id,
      },
      tx,
    );
    return sub;
  });
}
