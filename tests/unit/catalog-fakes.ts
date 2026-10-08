import { Service } from '../../src/modules/services/domain/service';
import { Customer } from '../../src/modules/customers/domain/customer';
import type { ServiceRepository } from '../../src/modules/services/application/ports';
import type { CustomerRepository } from '../../src/modules/customers/application/ports';

/** Tenant-scoped in-memory ServiceRepository (findById honours businessId). */
export class InMemoryServiceRepository implements ServiceRepository {
  rows: Service[] = [];

  async findById(businessId: string, id: string): Promise<Service | null> {
    return (
      this.rows.find((s) => s.id === id && s.businessId === businessId) ?? null
    );
  }
  async listByBusiness(
    businessId: string,
    opts?: { includeDeleted?: boolean; onlyActive?: boolean },
  ): Promise<Service[]> {
    return this.rows.filter((s) => {
      if (s.businessId !== businessId) return false;
      if (!opts?.includeDeleted && s.isDeleted) return false;
      if (opts?.onlyActive && !s.isActive) return false;
      return true;
    });
  }
  async save(service: Service): Promise<void> {
    const idx = this.rows.findIndex((s) => s.id === service.id);
    if (idx >= 0) this.rows[idx] = service;
    else this.rows.push(service);
  }
}

/** Tenant-scoped in-memory CustomerRepository. */
export class InMemoryCustomerRepository implements CustomerRepository {
  rows: Customer[] = [];

  async findById(businessId: string, id: string): Promise<Customer | null> {
    return (
      this.rows.find((c) => c.id === id && c.businessId === businessId) ?? null
    );
  }
  async listByBusiness(
    businessId: string,
    opts?: { search?: string },
  ): Promise<Customer[]> {
    const term = opts?.search?.trim().toLowerCase();
    return this.rows.filter((c) => {
      if (c.businessId !== businessId) return false;
      if (c.isDeleted) return false;
      if (term) {
        const s = c.snapshot();
        const hay = `${s.fullName} ${s.phone ?? ''} ${s.email ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }
  async save(customer: Customer): Promise<void> {
    const idx = this.rows.findIndex((c) => c.id === customer.id);
    if (idx >= 0) this.rows[idx] = customer;
    else this.rows.push(customer);
  }
}
