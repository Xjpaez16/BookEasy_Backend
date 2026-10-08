import type { TransactionContext } from '../../../../shared/application/ports';
import type { Notification, NotificationChannel } from '../../domain/notification';

export interface NotificationRepository {
  save(notification: Notification, tx?: TransactionContext): Promise<void>;
  findById(id: string, tx?: TransactionContext): Promise<Notification | null>;
  /** PENDING notifications whose scheduledAt <= `cutoff`, oldest first, capped. */
  findDue(cutoff: Date, limit: number, tx?: TransactionContext): Promise<Notification[]>;
}

/**
 * A durable due-time index. The queue holds notification ids keyed by their
 * scheduled epoch; the worker pops ids that are due. Backed by a Redis sorted
 * set so scheduling survives restarts and multiple workers can share it.
 */
export interface ReminderQueue {
  enqueue(notificationId: string, scheduledAt: Date): Promise<void>;
  /** Atomically claims up to `limit` ids whose score <= now. */
  claimDue(now: Date, limit: number): Promise<string[]>;
  remove(notificationId: string): Promise<void>;
}

/** Message a channel sender delivers for an appointment reminder. */
export interface ReminderMessage {
  to: string;
  businessName: string;
  startAtIso: string;
  serviceName: string;
}

export interface WhatsAppSender {
  sendReminder(message: ReminderMessage): Promise<void>;
}

export interface ReminderEmailSender {
  sendReminder(message: ReminderMessage): Promise<void>;
}

/** Read side the dispatcher needs to build the message for a notification. */
export interface ReminderContextLookup {
  /**
   * Resolves the recipient + display fields for an appointment's reminder.
   * Returns null when the appointment/customer no longer qualifies (deleted,
   * cancelled) so a stale reminder is skipped rather than sent.
   */
  resolve(
    businessId: string,
    appointmentId: string,
    channel: NotificationChannel,
    tx?: TransactionContext,
  ): Promise<ReminderMessage | null>;
}
