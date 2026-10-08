import { Service } from '../../domain/service';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { Clock, IdGenerator } from '../../../../shared/application/ports';
import type { AuditLogRepository } from '../../../business/application/ports';
import type { ServiceRepository } from '../ports';

export interface ServiceView {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}

function toView(service: Service): ServiceView {
  const s = service.snapshot();
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.durationMinutes,
    priceMinor: s.priceMinor,
    currency: s.currency,
    active: s.active,
  };
}

export interface ServiceDeps {
  services: ServiceRepository;
  audit: AuditLogRepository;
  ids: IdGenerator;
  clock: Clock;
}

export interface CreateServiceInput {
  actorUserId: string;
  businessId: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceMinor?: number;
  currency?: string;
}

export async function createService(
  input: CreateServiceInput,
  deps: ServiceDeps,
): Promise<ServiceView> {
  const service = Service.create({
    id: deps.ids.generate(),
    businessId: input.businessId,
    name: input.name,
    description: input.description ?? null,
    durationMinutes: input.durationMinutes,
    ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
  });
  await deps.services.save(service);
  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: 'service.created',
    targetType: 'service',
    targetId: service.id,
  });
  return toView(service);
}

export interface ListServicesInput {
  businessId: string;
  onlyActive?: boolean;
}

export async function listServices(
  input: ListServicesInput,
  deps: { services: ServiceRepository },
): Promise<ServiceView[]> {
  const rows = await deps.services.listByBusiness(input.businessId, {
    onlyActive: input.onlyActive ?? false,
  });
  return rows.map(toView);
}

export interface UpdateServiceInput {
  actorUserId: string;
  businessId: string;
  serviceId: string;
  name?: string;
  description?: string | null;
  durationMinutes?: number;
  priceMinor?: number;
  currency?: string;
  active?: boolean;
}

export async function updateService(
  input: UpdateServiceInput,
  deps: ServiceDeps,
): Promise<ServiceView> {
  const service = await deps.services.findById(input.businessId, input.serviceId);
  if (!service) throw new NotFoundError('Service not found');

  service.update({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.durationMinutes !== undefined
      ? { durationMinutes: input.durationMinutes }
      : {}),
    ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  });
  await deps.services.save(service);
  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: 'service.updated',
    targetType: 'service',
    targetId: service.id,
  });
  return toView(service);
}

export interface DeleteServiceInput {
  actorUserId: string;
  businessId: string;
  serviceId: string;
}

export async function deleteService(
  input: DeleteServiceInput,
  deps: ServiceDeps,
): Promise<void> {
  const service = await deps.services.findById(input.businessId, input.serviceId);
  if (!service) throw new NotFoundError('Service not found');
  service.softDelete(deps.clock.now());
  await deps.services.save(service);
  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: 'service.deleted',
    targetType: 'service',
    targetId: service.id,
  });
}
