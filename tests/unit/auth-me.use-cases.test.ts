import { describe, it, expect } from 'bun:test';
import { User } from '../../src/modules/auth/domain/user';
import { getCurrentUser } from '../../src/modules/auth/application/use-cases/get-current-user';
import { NotFoundError } from '../../src/shared/domain/errors';
import { InMemoryUserRepository } from './auth-fakes';

function seedUser(repo: InMemoryUserRepository, emailVerified: boolean): string {
  const user = User.create({
    id: '11111111-1111-1111-1111-111111111111',
    email: 'owner@shop.com',
    passwordHash: 'hash',
    fullName: 'Owner Uno',
    emailVerifiedAt: emailVerified ? new Date() : null,
  });
  void repo.save(user);
  return user.id;
}

describe('getCurrentUser', () => {
  it('returns the public profile for an existing user', async () => {
    const users = new InMemoryUserRepository();
    const id = seedUser(users, true);
    const view = await getCurrentUser(id, { users });
    expect(view).toEqual({
      id,
      email: 'owner@shop.com',
      fullName: 'Owner Uno',
      emailVerified: true,
    });
  });

  it('reflects an unverified email', async () => {
    const users = new InMemoryUserRepository();
    const id = seedUser(users, false);
    const view = await getCurrentUser(id, { users });
    expect(view.emailVerified).toBe(false);
  });

  it('throws NotFound when the user does not exist', async () => {
    const users = new InMemoryUserRepository();
    await expect(
      getCurrentUser('99999999-9999-9999-9999-999999999999', { users }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
