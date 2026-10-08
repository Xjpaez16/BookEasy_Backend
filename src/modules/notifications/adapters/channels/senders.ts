import type { AppConfig } from '../../../../config/env';
import type {
  WhatsAppSender,
  ReminderEmailSender,
  ReminderMessage,
} from '../../application/ports';

function formatBody(m: ReminderMessage): string {
  return `Recordatorio: tienes una cita de "${m.serviceName}" en ${m.businessName} el ${m.startAtIso}.`;
}

/**
 * WhatsApp Business Cloud API sender. Posts a text message to the Graph API.
 * Throws on non-2xx so the dispatcher can fall back to email. Never logs the
 * API token.
 */
export class WhatsAppCloudSender implements WhatsAppSender {
  constructor(private readonly config: AppConfig) {}

  async sendReminder(message: ReminderMessage): Promise<void> {
    const { WHATSAPP_API_URL, WHATSAPP_API_TOKEN, WHATSAPP_PHONE_ID } = this.config;
    if (!WHATSAPP_API_URL || !WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_ID) {
      throw new Error('WhatsApp is not configured');
    }
    const url = `${WHATSAPP_API_URL.replace(/\/$/, '')}/${WHATSAPP_PHONE_ID}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to,
        type: 'text',
        text: { body: formatBody(message) },
      }),
    });
    if (!res.ok) {
      // Do not include the response body verbatim — it may echo request data.
      throw new Error(`WhatsApp send failed with status ${res.status}`);
    }
  }
}

/**
 * Email reminder sender. In the MVP this logs in dev and is the fallback when
 * WhatsApp is unavailable. Swap for a real SMTP/API adapter in production via
 * the same port. Never logs secrets.
 */
export class ConsoleReminderEmailSender implements ReminderEmailSender {
  constructor(private readonly isProduction: boolean) {}

  async sendReminder(message: ReminderMessage): Promise<void> {
    if (this.isProduction) {
      console.warn(`[email] reminder queued for ${message.to} (console sender in prod!)`);
      return;
    }
    console.warn(`[email:dev] reminder to=${message.to} body="${formatBody(message)}"`);
  }
}
