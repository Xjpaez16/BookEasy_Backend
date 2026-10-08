import type { Clock } from '../../../../shared/application/ports';
import type {
  NotificationRepository,
  ReminderQueue,
  WhatsAppSender,
  ReminderEmailSender,
  ReminderContextLookup,
} from '../ports';

export interface DispatchDeps {
  notifications: NotificationRepository;
  queue: ReminderQueue;
  whatsapp: WhatsAppSender;
  email: ReminderEmailSender;
  context: ReminderContextLookup;
  clock: Clock;
}

export interface DispatchResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Worker tick: claims due reminder ids, loads each notification, resolves the
 * recipient, sends via its channel (WhatsApp with email fallback), and marks
 * the outcome. Idempotent per id — a notification already SENT/FAILED is
 * skipped. A send failure is recorded (FAILED) but does not abort the batch.
 */
export async function dispatchDueReminders(
  limit: number,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const now = deps.clock.now();
  const ids = await deps.queue.claimDue(now, limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const id of ids) {
    const notification = await deps.notifications.findById(id);
    if (!notification || notification.status !== 'PENDING') {
      skipped += 1;
      continue;
    }

    if (!notification.appointmentId) {
      notification.markFailed('Notification has no appointment');
      await deps.notifications.save(notification);
      failed += 1;
      continue;
    }

    const message = await deps.context.resolve(
      notification.businessId,
      notification.appointmentId,
      notification.channel,
    );
    if (!message) {
      // Appointment cancelled/deleted, or no contact for the channel: skip.
      notification.markFailed('Reminder no longer applicable or missing contact');
      await deps.notifications.save(notification);
      skipped += 1;
      continue;
    }

    try {
      if (notification.channel === 'WHATSAPP') {
        try {
          await deps.whatsapp.sendReminder(message);
        } catch {
          // WhatsApp failed → fall back to email when we have an address.
          await deps.email.sendReminder(message);
        }
      } else {
        await deps.email.sendReminder(message);
      }
      notification.markSent(deps.clock.now());
      await deps.notifications.save(notification);
      sent += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'send failed';
      notification.markFailed(reason);
      await deps.notifications.save(notification);
      failed += 1;
    }
  }

  return { claimed: ids.length, sent, failed, skipped };
}
