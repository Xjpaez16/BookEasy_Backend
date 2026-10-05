import type { EmailSender } from '../../modules/auth/application/ports';

/**
 * Development email sender: logs a link instead of sending. Swap for an SMTP
 * adapter in production via the same EmailSender port. Never logs secrets in
 * production builds.
 */
export class ConsoleEmailSender implements EmailSender {
  constructor(private readonly isProduction: boolean) {}

  async sendEmailVerification(to: string, token: string): Promise<void> {
    this.log('EMAIL_VERIFICATION', to, token);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    this.log('PASSWORD_RESET', to, token);
  }

  private log(kind: string, to: string, token: string): void {
    if (this.isProduction) {
      // In production this adapter must be replaced by a real sender.
      console.warn(`[email] ${kind} queued for ${to} (console sender in prod!)`);
      return;
    }
    console.warn(`[email:dev] ${kind} to=${to} token=${token}`);
  }
}
