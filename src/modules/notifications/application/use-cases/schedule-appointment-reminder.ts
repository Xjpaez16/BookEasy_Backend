import {
  Notification,
  reminderInstant,
  type NotificationChannel,
} from '../../domain/notification';
import type { Clock, IdGenerator } from '../../../../shared/application/ports';
import type { NotificationRepository, ReminderQueue } from '../ports';

export interface ScheduleReminderInput {
  businessId: string;
  appointmentId: string;
  appointmentStartAt: Date;
  channel: NotificationChannel;
  /** Minutes before the appointment to fire the reminder (e.g. 1440 = 24h). */
  leadMinutes: number;
}

export interface ScheduleReminderDeps {
  notifications: NotificationRepository;
  queue: ReminderQueue;
  ids: IdGenerator;
  clock: Clock;
}

export interface ScheduleReminderResult {
  scheduled: boolean;
  notificationId?: string;
  fireAt?: string;
}

/**
 * Schedules a reminder for an appointment. No-op (scheduled=false) when the
 * reminder instant is already in the past. Persists a PENDING notification and
 * enqueues its id in the durable due-time index.
 */
export async function scheduleAppointmentReminder(
  input: ScheduleReminderInput,
  deps: ScheduleReminderDeps,
): Promise<ScheduleReminderResult> {
  const fireAt = reminderInstant(
    input.appointmentStartAt,
    input.leadMinutes,
    deps.clock.now(),
  );
  if (!fireAt) return { scheduled: false };

  const notification = Notification.schedule({
    id: deps.ids.generate(),
    businessId: input.businessId,
    appointmentId: input.appointmentId,
    channel: input.channel,
    scheduledAt: fireAt,
    payload: { kind: 'APPOINTMENT_REMINDER' },
  });
  await deps.notifications.save(notification);
  await deps.queue.enqueue(notification.id, fireAt);

  return { scheduled: true, notificationId: notification.id, fireAt: fireAt.toISOString() };
}
