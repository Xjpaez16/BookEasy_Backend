export type MembershipRole = 'OWNER' | 'STAFF';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}
