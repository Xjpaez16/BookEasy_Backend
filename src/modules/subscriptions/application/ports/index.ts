import type { TransactionContext } from '../../../../shared/application/ports';
import type { Subscription } from '../../domain/subscription';

export interface SubscriptionRepository {
  /** Fetch the single subscription for a business, or null if none exists yet. */
  findByBusiness(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<Subscription | null>;

  /** Insert a new subscription. */
  save(subscription: Subscription, tx?: TransactionContext): Promise<void>;

  /** Persist changes to an existing subscription (plan/status/price/period). */
  update(subscription: Subscription, tx?: TransactionContext): Promise<void>;
}
