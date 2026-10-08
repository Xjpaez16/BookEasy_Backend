import { ValidationError } from '../../../shared/domain/errors';

export type NotificationChannel = 'WHATSAPP' | 'EMAIL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationProps {
  id: string;
  businessId: string;
  appointmentId: string | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  scheduledAt: Date;
  sentAt: Date | null;
  payload: Record<string, unknown> | null;
  error: string | null;
}

/**
 * Notification aggregate: one scheduled delivery (an appointment reminder in
 * the MVP). Lifecycle: PENDING -> SENT | FAILED. The worker transitions it;
 * the domain guards the valid transitions and keeps no secrets in `payload`.
 */
export class Notification {
  private constructor(private props: NotificationProps) {}

  static schedule(props: {
    id: string;
    businessId: string;
    appointmentId: string;
    channel: NotificationChannel;
    scheduledAt: Date;
    payload?: Record<string, unknown> | null;
  }): Notification {
    if (!props.businessId) throw new ValidationError('businessId is required');
    if (Number.isNaN(props.scheduledAt.getTime())) {
      throw new ValidationError('Invalid scheduledAt');
    }
    return new Notification({
      id: props.id,
      businessId: props.businessId,
      appointmentId: props.appointmentId,
      channel: props.channel,
      status: 'PENDING',
      scheduledAt: props.scheduledAt,
      sentAt: null,
      payload: props.payload ?? null,
      error: null,
    });
  }

  static rehydrate(props: NotificationProps): Notification {
    return new Notification({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get businessId(): string {
    return this.props.businessId;
  }
  get channel(): NotificationChannel {
    return this.props.channel;
  }
  get status(): NotificationStatus {
    return this.props.status;
  }
  get scheduledAt(): Date {
    return this.props.scheduledAt;
  }
  get appointmentId(): string | null {
    return this.props.appointmentId;
  }
  get payload(): Record<string, unknown> | null {
    return this.props.payload;
  }

  markSent(at: Date): void {
    if (this.props.status !== 'PENDING') {
      throw new ValidationError(`Cannot send a notification in status ${this.props.status}`);
    }
    this.props.status = 'SENT';
    this.props.sentAt = at;
    this.props.error = null;
  }

  markFailed(reason: string): void {
    if (this.props.status === 'SENT') {
      throw new ValidationError('Cannot fail an already-sent notification');
    }
    this.props.status = 'FAILED';
    // Keep a short, non-sensitive reason only.
    this.props.error = reason.slice(0, 500);
  }

  snapshot(): Readonly<NotificationProps> {
    return { ...this.props };
  }
}

/**
 * Computes when an appointment reminder should fire: `leadMinutes` before the
 * appointment start. Returns null when that instant is already in the past
 * relative to `now` (no point scheduling a reminder for a past moment).
 */
export function reminderInstant(
  appointmentStart: Date,
  leadMinutes: number,
  now: Date,
): Date | null {
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0) {
    throw new ValidationError('leadMinutes must be a non-negative integer');
  }
  const at = new Date(appointmentStart.getTime() - leadMinutes * 60_000);
  return at.getTime() > now.getTime() ? at : null;
}
