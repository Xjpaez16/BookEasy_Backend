import type { TransactionContext } from '../../../../shared/application/ports';
import type { SubscriptionInitializer } from '../../application/ports';
import {
  ensureSubscription,
  type SubscriptionDeps,
} from '../../../subscriptions/application/use-cases/manage-subscription';

/**
 * Bridges the business module's `SubscriptionInitializer` port to the
 * subscriptions use case, so a new business gets its default FREE subscription
 * inside the same transaction. The business application layer stays decoupled
 * from the subscriptions module — only this adapter knows about both.
 */
export class SubscriptionInitializerAdapter implements SubscriptionInitializer {
  constructor(private readonly deps: SubscriptionDeps) {}

  async initialize(
    input: { businessId: string; actorUserId: string },
    tx: TransactionContext,
  ): Promise<void> {
    await ensureSubscription(input, this.deps, tx);
  }
}
