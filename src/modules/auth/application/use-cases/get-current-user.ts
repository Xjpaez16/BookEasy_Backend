import { NotFoundError } from '../../../../shared/domain/errors';
import type { UserRepository } from '../ports';

export interface CurrentUserView {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}

export interface GetCurrentUserDeps {
  users: UserRepository;
}

/**
 * Returns the authenticated user's public profile. `userId` comes from the
 * verified access token (resolved by the auth plugin), never from the client.
 * Lets the frontend hydrate the session after login/refresh, since the login
 * response carries only the access token, not the user object.
 */
export async function getCurrentUser(
  userId: string,
  deps: GetCurrentUserDeps,
): Promise<CurrentUserView> {
  const user = await deps.users.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    emailVerified: user.isEmailVerified,
  };
}
