import { Customer } from '../../domain/customer';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { Clock, IdGenerator } from '../../../../shared/application/ports';
import type { AuditLogRepository } from '../../../business/application/ports';
import type { CustomerRepository } from '../ports';

export interface CustomerView {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

function toView(customer: Customer): CustomerView {
  const s = customer.snapshot();
  return {
    id: s.id,
    fullName: s.fullName,
    phone: s.phone,
    email: s.email,
    notes: s.notes,
  };
}

export interface CustomerDeps {
  customers: CustomerRepository;
  audit: AuditLogRepository;
  ids: IdGenerator;
  clock: Clock;
}

export interface CreateCustomerInput {
  actorUserId: string;
  businessId: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export async function createCustomer(
  input: CreateCustomerInput,
  deps: CustomerDeps,
): Promise<CustomerView> {
  const customer = Customer.create({
    id: deps.ids.generate(),
    businessId: input.businessId,
    fullName: input.fullName,
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: input.notes ?? null,
  });
  await deps.customers.save(customer);
  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: 'customer.created',
    targetType: 'customer',
    targetId: customer.id,
  });
  return toView(customer);
}

export interface ListCustomersInput {
  businessId: string;
  search?: string;
}

export async function listCustomers(
  input: ListCustomersInput,
  deps: { customers: CustomerRepository },
): Promise<CustomerView[]> {
  const rows = await deps.customers.listByBusiness(input.businessId, {
    ...(input.search ? { search: input.search } : {}),
  });
  return rows.map(toView);
}

export interface UpdateCustomerInput {
  actorUserId: string;
  businessId: string;
  customerId: string;
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export async function updateCustomer(
  input: UpdateCustomerInput,
  deps: CustomerDeps,
): Promise<CustomerView> {
  const customer = await deps.customers.findById(input.businessId, input.customerId);
  if (!customer) throw new NotFoundError('Customer not found');

  customer.update({
    ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
  await deps.customers.save(customer);
  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: 'customer.updated',
    targetType: 'customer',
    targetId: customer.id,
  });
  return toView(customer);
}

export interface DeleteCustomerInput {
  actorUserId: string;
  businessId: string;
  customerId: string;
}

export async function deleteCustomer(
  input: DeleteCustomerInput,
  deps: CustomerDeps,
): Promise<void> {
  const customer = await deps.customers.findById(input.businessId, input.customerId);
  if (!customer) throw new NotFoundError('Customer not found');
  customer.softDelete(deps.clock.now());
  await deps.customers.save(customer);
  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: 'customer.deleted',
    targetType: 'customer',
    targetId: customer.id,
  });
}
