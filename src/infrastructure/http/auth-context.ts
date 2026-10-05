import { UnauthorizedError, ForbiddenError } from '../../shared/domain/errors';
import type { MembershipRole } from '../../modules/auth/domain/types';

/**
 * The authenticated principal for a request. business_id and role are
 * ALWAYS derived here from the verified token + membership — never read
 * from request body/query. Every tenant-scoped query must use this.
 */
export interface AuthContext {
  userId: string;
  businessId: string | null;
  role: MembershipRole | null;
}

/** Throws if the request is not authenticated. */
export function requireAuth(ctx: AuthContext | null): asserts ctx is AuthContext {
  if (!ctx) throw new UnauthorizedError('Authentication required');
}

/** Throws if there is no active business context (tenant). */
export function requireBusiness(
  ctx: AuthContext,
): asserts ctx is AuthContext & { businessId: string; role: MembershipRole } {
  if (!ctx.businessId || !ctx.role) {
    throw new ForbiddenError('No active business context');
  }
}

/** Throws if the caller's role is not in the allowed set. */
export function requireRole(ctx: AuthContext, ...allowed: MembershipRole[]): void {
  if (!ctx.role || !allowed.includes(ctx.role)) {
    throw new ForbiddenError('Insufficient role');
  }
}
