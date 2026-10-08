import { NotFoundError } from '../../../../shared/domain/errors';
import type { Clock } from '../../../../shared/application/ports';
import type {
  BusinessRepository,
  AuditLogRepository,
} from '../ports';

export interface BusinessDetails {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

/**
 * Reads a business the caller belongs to. The caller's `businessId` MUST come
 * from their AuthContext; this use case only serves that exact tenant.
 */
export async function getBusiness(
  businessId: string,
  deps: { businesses: BusinessRepository },
): Promise<BusinessDetails> {
  const business = await deps.businesses.findById(businessId);
  if (!business) throw new NotFoundError('Business not found');
  const s = business.snapshot();
  return { id: s.id, name: s.name, slug: s.slug, timezone: s.timezone };
}

export interface UpdateBusinessInput {
  actorUserId: string;
  businessId: string;
  name?: string;
  timezone?: string;
}

export interface UpdateBusinessDeps {
  businesses: BusinessRepository;
  audit: AuditLogRepository;
  clock: Clock;
}

/** Updates a business's name and/or timezone. OWNER-only (enforced at HTTP). */
export async function updateBusiness(
  input: UpdateBusinessInput,
  deps: UpdateBusinessDeps,
): Promise<BusinessDetails> {
  const business = await deps.businesses.findById(input.businessId);
  if (!business) throw new NotFoundError('Business not found');

  if (input.name !== undefined) business.rename(input.name);
  if (input.timezone !== undefined) business.changeTimezone(input.timezone);

  await deps.businesses.save(business);
  await deps.audit.record({
    businessId: business.id,
    actorUserId: input.actorUserId,
    action: 'business.updated',
    targetType: 'business',
    targetId: business.id,
  });

  const s = business.snapshot();
  return { id: s.id, name: s.name, slug: s.slug, timezone: s.timezone };
}
