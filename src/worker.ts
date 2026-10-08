import { createNotificationsContainer } from './modules/notifications/container';
import { dispatchDueReminders } from './modules/notifications/application/use-cases/dispatch-due-reminders';

/**
 * Reminder worker: a standalone process that polls the durable reminder queue
 * and dispatches due reminders. Runs independently of the HTTP server (own
 * process / container). Scaling out = running more copies; the queue claim is
 * atomic so copies never double-send.
 */

const POLL_INTERVAL_MS = Number(process.env.REMINDER_POLL_MS ?? 15_000);
const BATCH_LIMIT = Number(process.env.REMINDER_BATCH ?? 50);

async function tick(container: ReturnType<typeof createNotificationsContainer>): Promise<void> {
  const result = await dispatchDueReminders(BATCH_LIMIT, container);
  if (result.claimed > 0) {
    console.warn(
      `[worker] claimed=${result.claimed} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
    );
  }
}

async function main(): Promise<void> {
  const container = createNotificationsContainer();
  let running = true;

  const stop = (signal: string): void => {
    console.warn(`[worker] received ${signal}, shutting down`);
    running = false;
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  console.warn('[worker] reminder worker started');
  while (running) {
    try {
      await tick(container);
    } catch (err) {
      // Never let one bad tick kill the loop.
      console.error('[worker] tick error', err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.warn('[worker] stopped');
  process.exit(0);
}

void main();
