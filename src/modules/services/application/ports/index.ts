import type { TransactionContext } from '../../../../shared/application/ports';
import type { Service } from '../../domain/service';

export interface ServiceRepository {
  /** Fetch a service by id, scoped to a business (tenant isolation). */
  findById(
    businessId: string,
    id: string,
    tx?: TransactionContext,
  ): Promise<Service | null>;
  /** List services for a business. Excludes soft-deleted unless includeDeleted. */
  listByBusiness(
    businessId: string,
    opts?: { includeDeleted?: boolean; onlyActive?: boolean },
    tx?: TransactionContext,
  ): Promise<Service[]>;
  save(service: Service, tx?: TransactionContext): Promise<void>;
}
