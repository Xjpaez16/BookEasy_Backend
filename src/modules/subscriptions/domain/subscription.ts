import { ConflictError, ValidationError } from '../../../shared/domain/errors';

export type SubscriptionPlan = 'FREE' | 'PRO';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

/**
 * Per-plan limits enforced across the product (staff seats, services).
 * A limit of `null` means unlimited. Kept in the domain so enforcement is a
 * pure, testable business rule rather than scattered across adapters.
 */
export interface PlanLimits {
  readonly maxStaff: number | null;
  readonly maxServices: number | null;
  readonly whatsappReminders: boolean;
}

const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: { maxStaff: 2, maxServices: 10, whatsappReminders: false },
  PRO: { maxStaff: null, maxServices: null, whatsappReminders: true },
};

/** Default price per plan, in integer minor units (e.g. cents). */
const PLAN_PRICE_MINOR: Record<SubscriptionPlan, number> = {
  FREE: 0,
  PRO: 2900,
};

export function planLimits(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export interface SubscriptionProps {
  readonly id: string;
  readonly businessId: string;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly priceMinor: number;
  readonly currency: string;
  readonly currentPeriodEnd: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Allowed status transitions. Terminal CANCELLED can only be revived via a fresh plan change. */
const STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  ACTIVE: ['PAST_DUE', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'CANCELLED'],
  CANCELLED: ['ACTIVE'],
};

/**
 * Subscription aggregate. One per business (enforced by a unique index).
 * Money is stored in integer minor units — never floating point.
 */
export class Subscription {
  private constructor(private props: SubscriptionProps) {}

  static create(input: {
    id: string;
    businessId: string;
    plan?: SubscriptionPlan;
    currency?: string;
    now: Date;
  }): Subscription {
    const plan = input.plan ?? 'FREE';
    const currency = (input.currency ?? 'USD').toUpperCase();
    if (!CURRENCY_RE.test(currency)) {
      throw new ValidationError('currency must be a 3-letter ISO code');
    }
    return new Subscription({
      id: input.id,
      businessId: input.businessId,
      plan,
      status: 'ACTIVE',
      priceMinor: PLAN_PRICE_MINOR[plan],
      currency,
      currentPeriodEnd: plan === 'FREE' ? null : periodEnd(input.now),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Rehydrate from persistence without re-running creation rules. */
  static fromPersistence(props: SubscriptionProps): Subscription {
    return new Subscription({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get businessId(): string {
    return this.props.businessId;
  }
  get plan(): SubscriptionPlan {
    return this.props.plan;
  }
  get status(): SubscriptionStatus {
    return this.props.status;
  }
  get priceMinor(): number {
    return this.props.priceMinor;
  }
  get currency(): string {
    return this.props.currency;
  }
  get currentPeriodEnd(): Date | null {
    return this.props.currentPeriodEnd;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get limits(): PlanLimits {
    return planLimits(this.props.plan);
  }

  /** True while the business may use paid features. */
  get isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  /**
   * Change the plan. Reactivates the subscription (a plan change is an intent
   * to keep using the product) and recomputes price + billing period.
   */
  changePlan(plan: SubscriptionPlan, now: Date): void {
    if (plan === this.props.plan && this.props.status === 'ACTIVE') {
      throw new ConflictError('Subscription is already on this plan');
    }
    this.props = {
      ...this.props,
      plan,
      status: 'ACTIVE',
      priceMinor: PLAN_PRICE_MINOR[plan],
      currentPeriodEnd: plan === 'FREE' ? null : periodEnd(now),
      updatedAt: now,
    };
  }

  /** Mark the subscription cancelled (keeps the record; no physical delete). */
  cancel(now: Date): void {
    this.transition('CANCELLED', now);
  }

  /** Billing dunning: payment failed. */
  markPastDue(now: Date): void {
    this.transition('PAST_DUE', now);
  }

  private transition(next: SubscriptionStatus, now: Date): void {
    const allowed = STATUS_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new ValidationError(
        `Cannot transition subscription from ${this.props.status} to ${next}`,
      );
    }
    this.props = { ...this.props, status: next, updatedAt: now };
  }

  toJSON(): SubscriptionProps & { limits: PlanLimits } {
    return { ...this.props, limits: this.limits };
  }
}

/** One billing period = 30 days from `now`, UTC. */
function periodEnd(now: Date): Date {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
}
