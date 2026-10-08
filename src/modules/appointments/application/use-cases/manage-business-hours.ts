import { assertBusinessHour, type BusinessHour } from '../../domain/business-hours';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { Clock } from '../../../../shared/application/ports';
import type { AuditLogRepository, BusinessRepository } from '../../../business/application/ports';
import type { BusinessHoursRepository } from '../ports';

export interface SetBusinessHoursInput {
  actorUserId: string;
  businessId: string;
  hours: BusinessHour[];
}

export interface SetBusinessHoursDeps {
  hours: BusinessHoursRepository;
  businesses: BusinessRepository;
  audit: AuditLogRepository;
  clock: Clock;
}

/** Replaces a business's weekly opening hours. OWNER-only (enforced at HTTP). */
export async function setBusinessHours(
  input: SetBusinessHoursInput,
  deps: SetBusinessHoursDeps,
): Promise<BusinessHour[]> {
  const business = await deps.businesses.findById(input.businessId);
  if (!business) throw new NotFoundError('Business not found');

  const validated = input.hours.map(assertBusinessHour);
  await deps.hours.replaceForBusiness(input.businessId, validated);

  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: 'business_hours.updated',
    targetType: 'business',
    targetId: input.businessId,
  });

  return deps.hours.listByBusiness(input.businessId);
}

export async function getBusinessHours(
  businessId: string,
  deps: { hours: BusinessHoursRepository },
): Promise<BusinessHour[]> {
  return deps.hours.listByBusiness(businessId);
}
