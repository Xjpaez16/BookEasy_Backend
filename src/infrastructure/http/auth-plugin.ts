import { Elysia } from 'elysia';
import type { TokenService } from '../../shared/application/ports';
import type { MembershipRepository } from '../../modules/business/application/ports';
import type { MembershipRole } from '../../modules/auth/domain/types';
import { UnauthorizedError, ForbiddenError } from '../../shared/domain/errors';
import type { AuthContext } from './auth-context';

/**
 * Extracts the bearer access token from the Authorization header.
 * Returns null when absent (so routes can decide whether auth is required).
 */
function bearer(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

export interface AuthPluginDeps {
  tokens: TokenService;
  memberships: MembershipRepository;
}

/**
 * Elysia plugin that resolves the AuthContext for each request.
 *
 * The access token is identity-only (`sub`). The tenant (`businessId` + role)
 * is ALWAYS derived server-side from the user's ACTIVE memberships — never
 * trusted from the request body/query. When the user belongs to multiple
 * businesses, the client picks one with the `X-Business-Id` header, which is
 * treated as a mere SELECTOR: the resolved context still comes from the
 * matching active membership row, so a header naming a business the user is
 * not an active member of is ignored (defends against IDOR).
 *
 * `auth` is null when no/invalid credentials are present; route guards
 * (assertAuth / assertBusiness / assertRole) enforce access.
 */
// Return type intentionally inferred: annotating the Elysia plugin instance
// conflicts with exactOptionalPropertyTypes (same reason as buildApp).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function authPlugin(deps: AuthPluginDeps) {
  return new Elysia({ name: 'auth-context' }).derive(
    { as: 'global' },
    async ({ request }): Promise<{ auth: AuthContext | null }> => {
      const token = bearer(request.headers.get('authorization'));
      if (!token) return { auth: null };

      let claims;
      try {
        claims = await deps.tokens.verifyAccessToken(token);
      } catch {
        return { auth: null };
      }

      const userId = claims.sub;
      const memberships = (await deps.memberships.listByUser(userId)).filter(
        (m) => m.active,
      );

      let businessId: string | null = null;
      let role: MembershipRole | null = null;

      if (memberships.length > 0) {
        const requested = request.headers.get('x-business-id');
        const selected = requested
          ? memberships.find((m) => m.businessId === requested)
          : memberships.length === 1
            ? memberships[0]
            : undefined;
        if (selected) {
          businessId = selected.businessId;
          role = selected.role;
        }
      }

      return { auth: { userId, businessId, role } };
    },
  );
}

/** Narrowing helpers for route handlers. */
export function assertAuth(auth: AuthContext | null): asserts auth is AuthContext {
  if (!auth) throw new UnauthorizedError('Authentication required');
}

export function assertBusiness(
  auth: AuthContext,
): asserts auth is AuthContext & { businessId: string; role: MembershipRole } {
  if (!auth.businessId || !auth.role) {
    throw new ForbiddenError('No active business context');
  }
}

export function assertRole(auth: AuthContext, ...allowed: MembershipRole[]): void {
  if (!auth.role || !allowed.includes(auth.role)) {
    throw new ForbiddenError('Insufficient role');
  }
}
