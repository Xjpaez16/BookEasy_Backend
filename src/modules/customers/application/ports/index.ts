import type { TransactionContext } from '../../../../shared/application/ports';
import type { Customer } from '../../domain/customer';

export interface CustomerRepository {
  /** Fetch a customer by id, scoped to a business (tenant isolation). */
  findById(
    businessId: string,
    id: string,
    tx?: TransactionContext,
  ): Promise<Customer | null>;
  /**
   * List customers for a business. Excludes soft-deleted. `search` filters
   * by name/phone/email substring (case-insensitive).
   */
  listByBusiness(
    businessId: string,
    opts?: { search?: string },
    tx?: TransactionContext,
  ): Promise<Customer[]>;
  save(customer: Customer, tx?: TransactionContext): Promise<void>;
}
