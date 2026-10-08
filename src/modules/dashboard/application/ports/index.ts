import type { TransactionContext } from '../../../../shared/application/ports';

/** Count of appointments grouped by lifecycle status within a window. */
export interface StatusBreakdown {
  SCHEDULED: number;
  COMPLETED: number;
  CANCELLED: number;
  NO_SHOW: number;
}

export interface AppointmentSummaryRow {
  id: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  startAt: Date;
  endAt: Date;
  status: keyof StatusBreakdown;
}

/**
 * Read-only aggregation port for the dashboard. All methods are tenant-scoped
 * by business_id; the UTC window bounds come from the use case (which converts
 * the business-local "today" to UTC).
 */
export interface DashboardMetricsRepository {
  /** Count of appointments whose start falls in [from, to) grouped by status. */
  statusBreakdown(
    businessId: string,
    from: Date,
    to: Date,
    tx?: TransactionContext,
  ): Promise<StatusBreakdown>;

  /** SCHEDULED appointments with start >= now, ordered ascending, capped. */
  upcoming(
    businessId: string,
    now: Date,
    limit: number,
    tx?: TransactionContext,
  ): Promise<AppointmentSummaryRow[]>;

  /** Count of non-deleted customers. */
  activeCustomerCount(businessId: string, tx?: TransactionContext): Promise<number>;

  /** Count of active, non-deleted services. */
  activeServiceCount(businessId: string, tx?: TransactionContext): Promise<number>;
}
