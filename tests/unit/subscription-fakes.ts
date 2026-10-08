import type { SubscriptionRepository } from '../../src/modules/subscriptions/application/ports';
import { Subscription } from '../../src/modules/subscriptions/domain/subscription';

/** In-memory, business-scoped subscription store (one per business). */
export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private byBusiness = new Map<string, Subscription>();

  async findByBusiness(businessId: string): Promise<Subscription | null> {
    return this.byBusiness.get(businessId) ?? null;
  }

  async save(sub: Subscription): Promise<void> {
    if (this.byBusiness.has(sub.businessId)) {
      throw new Error('duplicate subscription for business');
    }
    this.byBusiness.set(sub.businessId, sub);
  }

  async update(sub: Subscription): Promise<void> {
    this.byBusiness.set(sub.businessId, sub);
  }

  /** Test helper. */
  get(businessId: string): Subscription | undefined {
    return this.byBusiness.get(businessId);
  }
}
