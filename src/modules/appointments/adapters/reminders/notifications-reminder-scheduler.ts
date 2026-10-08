import type { ReminderScheduler } from '../../application/ports';
import { scheduleAppointmentReminder } from '../../../notifications/application/use-cases/schedule-appointment-reminder';
import type { NotificationsContainer } from '../../../notifications/container';

/** Default lead time for appointment reminders: 24 hours before start. */
const DEFAULT_LEAD_MINUTES = 24 * 60;

/**
 * Adapter binding the appointments module's ReminderScheduler port to the
 * notifications module. Keeps appointments decoupled from reminder internals.
 * Channel defaults to WHATSAPP (email is the dispatcher's fallback).
 */
export class NotificationsReminderScheduler implements ReminderScheduler {
  constructor(
    private readonly notifications: NotificationsContainer,
    private readonly leadMinutes: number = DEFAULT_LEAD_MINUTES,
  ) {}

  async scheduleForAppointment(input: {
    businessId: string;
    appointmentId: string;
    appointmentStartAt: Date;
  }): Promise<void> {
    await scheduleAppointmentReminder(
      {
        businessId: input.businessId,
        appointmentId: input.appointmentId,
        appointmentStartAt: input.appointmentStartAt,
        channel: 'WHATSAPP',
        leadMinutes: this.leadMinutes,
      },
      this.notifications,
    );
  }
}
