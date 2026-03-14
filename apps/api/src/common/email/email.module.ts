import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PORT, EmailPort } from './email.port';
import { DevEmailAdapter } from './dev-email.adapter';
import { ResendEmailAdapter } from './resend-email.adapter';

// ─── EmailModule ───────────────────────────────────────────────────────────────
// Global module providing the EMAIL_PORT injection token.
//
// Adapter selection (EMAIL_PROVIDER env var):
//   dev    → DevEmailAdapter  — logs to console, stores in memory; never real email
//   resend → ResendEmailAdapter — sends via Resend API; requires RESEND_API_KEY
//
// DevEmailAdapter is always registered as a NestJS provider so tests can inject
// it directly via module.get(DevEmailAdapter) to access test helpers
// (getLastCode, getLastOfferLink, etc.) regardless of which adapter is active.
//
// Callers only inject EMAIL_PORT — they never import adapters directly.

@Global()
@Module({
  providers: [
    DevEmailAdapter,
    {
      provide: EMAIL_PORT,
      useFactory: (config: ConfigService, devAdapter: DevEmailAdapter): EmailPort => {
        const provider = config.get<string>('EMAIL_PROVIDER', 'dev');
        const logger = new Logger('EmailModule');

        if (provider === 'resend') {
          const apiKey = config.getOrThrow<string>('RESEND_API_KEY');
          const fromEmail = config.getOrThrow<string>('EMAIL_FROM');
          logger.log(`Email provider: Resend (from: ${fromEmail})`);
          return new ResendEmailAdapter({ apiKey, fromEmail });
        }

        logger.log('Email provider: DevEmailAdapter (dev/test — no real email sent)');
        return devAdapter;
      },
      inject: [ConfigService, DevEmailAdapter],
    },
  ],
  exports: [EMAIL_PORT, DevEmailAdapter],
})
export class EmailModule {}
