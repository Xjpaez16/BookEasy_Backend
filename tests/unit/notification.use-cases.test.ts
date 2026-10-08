import { describe, it, expect } from 'bun:test';
import {
  Notification,
  reminderInstant,
} from '../../src/modules/notifications/domain/notification';
import { scheduleAppointmentReminder } from '../../src/modules/notifications/application/use-cases/schedule-appointment-reminder';
import { dispatchDueReminders } from '../../src/modules/notifications/application/use-cases/dispatch-due-reminders';
import { ValidationError } from '../../src/shared/domain/errors';
import {
  InMemoryNotificationRepository,
  InMemoryReminderQueue,
  RecordingWhatsApp,
  RecordingEmail,
  FakeContextLookup,
  sampleMessage,
} from './notification-fakes';
import { FixedClock, SeqIdGenerator } from './auth-fakes';

const NOW = new Date('2026-01-04T12:00:00Z');

describe('reminderInstant', () => {
  it('returns start - lead when in the future', () => {
    const start = new Date('2026-01-05T15:00:00Z');
    const at = reminderInstant(start, 24 * 60, NOW);
    expect(at?.toISOString()).toBe('2026-01-04T15:00:00.000Z');
  });
  it('returns null when the fire instant is already past', () => {
    const start = new Date('2026-01-04T12:30:00Z'); // 24h before is yesterday
    expect(reminderInstant(start, 24 * 60, NOW)).toBeNull();
  });
});

describe('Notification lifecycle', () => {
  it('markSent only from PENDING; markFailed records a short reason', () => {
    const n = Notification.schedule({
      id: 'n1',
      businessId: 'b1',
      appointmentId: 'a1',
      channel: 'WHATSAPP',
      scheduledAt: new Date('2026-01-05T00:00:00Z'),
    });
    n.markSent(NOW);
    expect(n.status).toBe('SENT');
    expect(() => n.markFailed('x')).toThrow(ValidationError);
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function scheduleDeps() {
  return {
    notifications: new InMemoryNotificationRepository(),
    queue: new InMemoryReminderQueue(),
    ids: new SeqIdGenerator(),
    clock: new FixedClock(NOW),
  };
}

describe('scheduleAppointmentReminder', () => {
  it('persists a PENDING notification and enqueues it', async () => {
    const deps = scheduleDeps();
    const res = await scheduleAppointmentReminder(
      {
        businessId: 'b1',
        appointmentId: 'a1',
        appointmentStartAt: new Date('2026-01-05T15:00:00Z'),
        channel: 'WHATSAPP',
        leadMinutes: 24 * 60,
      },
      deps,
    );
    expect(res.scheduled).toBe(true);
    expect(deps.queue.entries.size).toBe(1);
  });

  it('does not schedule when the fire instant is already past', async () => {
    const deps = scheduleDeps();
    const res = await scheduleAppointmentReminder(
      {
        businessId: 'b1',
        appointmentId: 'a1',
        appointmentStartAt: new Date('2026-01-04T12:10:00Z'),
        channel: 'WHATSAPP',
        leadMinutes: 24 * 60,
      },
      deps,
    );
    expect(res.scheduled).toBe(false);
    expect(deps.queue.entries.size).toBe(0);
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
async function seedDue(
  notifications: InMemoryNotificationRepository,
  queue: InMemoryReminderQueue,
  channel: 'WHATSAPP' | 'EMAIL' = 'WHATSAPP',
) {
  const n = Notification.schedule({
    id: 'n1',
    businessId: 'b1',
    appointmentId: 'a1',
    channel,
    scheduledAt: new Date('2026-01-04T11:00:00Z'), // due before NOW
  });
  await notifications.save(n);
  await queue.enqueue(n.id, n.scheduledAt);
}

describe('dispatchDueReminders', () => {
  it('sends a WhatsApp reminder and marks it SENT', async () => {
    const notifications = new InMemoryNotificationRepository();
    const queue = new InMemoryReminderQueue();
    await seedDue(notifications, queue);
    const whatsapp = new RecordingWhatsApp();
    const email = new RecordingEmail();

    const result = await dispatchDueReminders(10, {
      notifications,
      queue,
      whatsapp,
      email,
      context: new FakeContextLookup(sampleMessage),
      clock: new FixedClock(NOW),
    });

    expect(result).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(whatsapp.sent).toHaveLength(1);
    expect((await notifications.findById('n1'))?.status).toBe('SENT');
  });

  it('falls back to email when WhatsApp fails', async () => {
    const notifications = new InMemoryNotificationRepository();
    const queue = new InMemoryReminderQueue();
    await seedDue(notifications, queue);
    const whatsapp = new RecordingWhatsApp(true); // throws
    const email = new RecordingEmail();

    const result = await dispatchDueReminders(10, {
      notifications,
      queue,
      whatsapp,
      email,
      context: new FakeContextLookup(sampleMessage),
      clock: new FixedClock(NOW),
    });

    expect(result.sent).toBe(1);
    expect(email.sent).toHaveLength(1);
    expect((await notifications.findById('n1'))?.status).toBe('SENT');
  });

  it('skips a stale reminder (context resolves to null) and marks FAILED', async () => {
    const notifications = new InMemoryNotificationRepository();
    const queue = new InMemoryReminderQueue();
    await seedDue(notifications, queue);

    const result = await dispatchDueReminders(10, {
      notifications,
      queue,
      whatsapp: new RecordingWhatsApp(),
      email: new RecordingEmail(),
      context: new FakeContextLookup(null),
      clock: new FixedClock(NOW),
    });

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('records FAILED when both channels throw (email channel)', async () => {
    const notifications = new InMemoryNotificationRepository();
    const queue = new InMemoryReminderQueue();
    await seedDue(notifications, queue, 'EMAIL');

    const result = await dispatchDueReminders(10, {
      notifications,
      queue,
      whatsapp: new RecordingWhatsApp(),
      email: new RecordingEmail(true), // throws
      context: new FakeContextLookup(sampleMessage),
      clock: new FixedClock(NOW),
    });

    expect(result.failed).toBe(1);
    expect((await notifications.findById('n1'))?.status).toBe('FAILED');
  });
});
