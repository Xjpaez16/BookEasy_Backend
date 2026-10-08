import { ValidationError } from '../../../shared/domain/errors';
import type { MembershipRole } from '../../auth/domain/types';

export type { MembershipRole };

export interface MembershipProps {
  id: string;
  businessId: string;
  userId: string;
  role: MembershipRole;
  active: boolean;
}

/**
 * Membership aggregate: binds a user to a business with a role.
 *
 * This is the ONLY source of a request's tenant context. `business_id` and
 * `role` for an authenticated principal are always derived from an active
 * membership here, never from client input.
 */
export class Membership {
  private constructor(private props: MembershipProps) {}

  static create(props: {
    id: string;
    businessId: string;
    userId: string;
    role: MembershipRole;
    active?: boolean;
  }): Membership {
    if (!props.businessId) throw new ValidationError('businessId is required');
    if (!props.userId) throw new ValidationError('userId is required');
    if (props.role !== 'OWNER' && props.role !== 'STAFF') {
      throw new ValidationError('Invalid membership role');
    }
    return new Membership({
      id: props.id,
      businessId: props.businessId,
      userId: props.userId,
      role: props.role,
      active: props.active ?? true,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get businessId(): string {
    return this.props.businessId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get role(): MembershipRole {
    return this.props.role;
  }
  get isActive(): boolean {
    return this.props.active;
  }
  get isOwner(): boolean {
    return this.props.role === 'OWNER';
  }

  changeRole(role: MembershipRole): void {
    if (role !== 'OWNER' && role !== 'STAFF') {
      throw new ValidationError('Invalid membership role');
    }
    this.props.role = role;
  }

  deactivate(): void {
    this.props.active = false;
  }

  activate(): void {
    this.props.active = true;
  }

  snapshot(): Readonly<MembershipProps> {
    return { ...this.props };
  }
}
