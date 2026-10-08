import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createService,
  listServices,
  updateService,
  deleteService,
} from '../../src/modules/services/application/use-cases/manage-services';
import {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
} from '../../src/modules/customers/application/use-cases/manage-customers';
import { NotFoundError } from '../../src/shared/domain/errors';
import {
  InMemoryServiceRepository,
  InMemoryCustomerRepository,
} from './catalog-fakes';
import { CapturingAuditLog } from './business-fakes';
import { FixedClock, SeqIdGenerator } from './auth-fakes';

const B1 = 'biz-1';
const B2 = 'biz-2';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function serviceDeps() {
  return {
    services: new InMemoryServiceRepository(),
    audit: new CapturingAuditLog(),
    ids: new SeqIdGenerator(),
    clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
  };
}
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function customerDeps() {
  return {
    customers: new InMemoryCustomerRepository(),
    audit: new CapturingAuditLog(),
    ids: new SeqIdGenerator(),
    clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
  };
}

describe('services use cases', () => {
  let deps: ReturnType<typeof serviceDeps>;
  beforeEach(() => {
    deps = serviceDeps();
  });

  it('creates, updates and lists only non-deleted', async () => {
    const created = await createService(
      {
        actorUserId: 'u1',
        businessId: B1,
        name: 'Haircut',
        durationMinutes: 30,
        priceMinor: 1500,
        currency: 'usd',
      },
      deps,
    );
    expect(created.currency).toBe('USD');

    await updateService(
      { actorUserId: 'u1', businessId: B1, serviceId: created.id, priceMinor: 2000 },
      deps,
    );
    const afterUpdate = await listServices({ businessId: B1 }, deps);
    expect(afterUpdate[0]?.priceMinor).toBe(2000);

    await deleteService(
      { actorUserId: 'u1', businessId: B1, serviceId: created.id },
      deps,
    );
    const afterDelete = await listServices({ businessId: B1 }, deps);
    expect(afterDelete).toHaveLength(0);
  });

  it('tenant isolation: cannot update a service of another business', async () => {
    const created = await createService(
      { actorUserId: 'u1', businessId: B1, name: 'Haircut', durationMinutes: 30 },
      deps,
    );
    // Attacker in B2 references B1's service id.
    await expect(
      updateService(
        { actorUserId: 'attacker', businessId: B2, serviceId: created.id, priceMinor: 1 },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Listing in B2 never sees B1's service.
    expect(await listServices({ businessId: B2 }, deps)).toHaveLength(0);
  });
});

describe('customers use cases', () => {
  let deps: ReturnType<typeof customerDeps>;
  beforeEach(() => {
    deps = customerDeps();
  });

  it('creates, searches and soft-deletes', async () => {
    await createCustomer(
      { actorUserId: 'u1', businessId: B1, fullName: 'Jane Doe', phone: '+573001234567' },
      deps,
    );
    const created = await createCustomer(
      { actorUserId: 'u1', businessId: B1, fullName: 'John Smith' },
      deps,
    );

    expect(await listCustomers({ businessId: B1, search: 'jane' }, deps)).toHaveLength(1);
    expect(await listCustomers({ businessId: B1, search: '3001234' }, deps)).toHaveLength(1);

    await deleteCustomer(
      { actorUserId: 'u1', businessId: B1, customerId: created.id },
      deps,
    );
    expect(await listCustomers({ businessId: B1 }, deps)).toHaveLength(1);
  });

  it('tenant isolation: cannot read/update a customer of another business', async () => {
    const created = await createCustomer(
      { actorUserId: 'u1', businessId: B1, fullName: 'Jane Doe' },
      deps,
    );
    await expect(
      updateCustomer(
        { actorUserId: 'attacker', businessId: B2, customerId: created.id, fullName: 'Hacked' },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await listCustomers({ businessId: B2 }, deps)).toHaveLength(0);
  });
});
