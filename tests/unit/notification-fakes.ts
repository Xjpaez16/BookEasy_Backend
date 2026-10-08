import { Notification } from '../../src/modules/notifications/domain/notification';
import type {
  NotificationRepository,
  ReminderQueue,
  WhatsAppSender,
  ReminderEmailSender,
  ReminderContextLookup,
  ReminderMessage,
} from '../../src/modules/notifications/application/ports';

export class InMemoryNotificationRepository implements NotificationRepository {
  rows = new Map<string, Notification>();
  async save(n: Notification): Promise<void> {
    this.rows.set(n.id, n);
  }
  async findById(id: string): Promise<Notification | null> {
    return this.rows.get(id) ?? null;
  }
  async findDue(cutoff: Date, limit: number): Promise<Notification[]> {
    return [...this.rows.values()]
      .filter((n) => n.status === 'PENDING' && n.scheduledAt.getTime() <= cutoff.getTime())
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, limit);
  }
}

export class InMemoryReminderQueue implements ReminderQueue {
  entries = new Map<string, number>();
  async enqueue(id: string, scheduledAt: Date): Promise<void> {
    this.entries.set(id, scheduledAt.getTime());
  }
  async claimDue(now: Date, limit: number): Promise<string[]> {
    const due = [...this.entries.entries()]
      .filter(([, score]) => score <= now.getTime())
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit)
      .map(([id]) => id);
    for (const id of due) this.entries.delete(id);
    return due;
  }
  async remove(id: string): Promise<void> {
    this.entries.delete(id);
  }
}

export class RecordingWhatsApp implements WhatsAppSender {
  sent: ReminderMessage[] = [];
  constructor(private readonly fail = false) {}
  async sendReminder(m: ReminderMessage): Promise<void> {
    if (this.fail) throw new Error('whatsapp down');
    this.sent.push(m);
  }
}

export class RecordingEmail implements ReminderEmailSender {
  sent: ReminderMessage[] = [];
  constructor(private readonly fail = false) {}
  async sendReminder(m: ReminderMessage): Promise<void> {
    if (this.fail) throw new Error('email down');
    this.sent.push(m);
  }
}

export class FakeContextLookup implements ReminderContextLookup {
  constructor(private readonly message: ReminderMessage | null) {}
  async resolve(): Promise<ReminderMessage | null> {
    return this.message;
  }
}

export const sampleMessage: ReminderMessage = {
  to: '+573001234567',
  businessName: 'Barber Shop',
  startAtIso: '2026-01-05T15:00:00.000Z',
  serviceName: 'Haircut',
};
