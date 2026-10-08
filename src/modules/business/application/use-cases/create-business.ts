import { Business } from '../../domain/business';
import { Membership } from '../../domain/membership';
import { ConflictError } from '../../../../shared/domain/errors';
import type {
  Clock,
  IdGenerator,
  UnitOfWork,
} from '../../../../shared/application/ports';
import type {
  BusinessRepository,
  MembershipRepository,
  AuditLogRepository,
} from '../ports';

export interface CreateBusinessInput {
  /** The authenticated user who will become the OWNER. From the token, not the body. */
  actorUserId: string;
  name: string;
  timezone?: string;
  slug?: string;
}

export interface CreateBusinessDeps {
  businesses: BusinessRepository;
  memberships: MembershipRepository;
  audit: AuditLogRepository;
  ids: IdGenerator;
  clock: Clock;
  uow: UnitOfWork;
}

export interface CreateBusinessResult {
  businessId: string;
  slug: string;
  membershipId: string;
}

/**
 * Creates a business and makes the caller its OWNER, atomically.
 * A unique slug is enforced; a collision is a ConflictError.
 */
export async function createBusiness(
  input: CreateBusinessInput,
  deps: CreateBusinessDeps,
): Promise<CreateBusinessResult> {
  const business = Business.create({
    id: deps.ids.generate(),
    name: input.name,
    ...(input.slug ? { slug: input.slug } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
  });

  return deps.uow.withTransaction(async (tx) => {
    const slugTaken = await deps.businesses.findBySlug(business.slug, tx);
    if (slugTaken) {
      throw new ConflictError('A business with this slug already exists');
    }

    await deps.businesses.save(business, tx);

    const membership = Membership.create({
      id: deps.ids.generate(),
      businessId: business.id,
      userId: input.actorUserId,
      role: 'OWNER',
      active: true,
    });
    await deps.memberships.save(membership, tx);

    await deps.audit.record(
      {
        businessId: business.id,
        actorUserId: input.actorUserId,
        action: 'business.created',
        targetType: 'business',
        targetId: business.id,
        metadata: { slug: business.slug },
      },
      tx,
    );

    return {
      businessId: business.id,
      slug: business.slug,
      membershipId: membership.id,
    };
  });
}
