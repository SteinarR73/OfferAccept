import { Module } from '@nestjs/common';
import { SigningTokenService } from './services/signing-token.service';
import { SigningSessionService } from './services/signing-session.service';
import { SigningOtpService } from './services/signing-otp.service';
import { AcceptanceService } from './services/acceptance.service';
import { SigningContextService } from './services/signing-context.service';
import { SigningOtpOrchestrator } from './services/signing-otp.orchestrator';
import { SigningDecisionOrchestrator } from './services/signing-decision.orchestrator';
import { SigningController } from './signing.controller';
import { SigningEventsModule } from './signing-events.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { EnterpriseCoreModule } from '../enterprise/enterprise-core.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DealEventsModule } from '../deal-events/deal-events.module';

@Module({
  imports: [SigningEventsModule, CertificatesModule, EnterpriseCoreModule, NotificationsModule, DealEventsModule],
  controllers: [SigningController],
  providers: [
    SigningTokenService,
    SigningSessionService,
    SigningOtpService,
    AcceptanceService,
    SigningContextService,
    SigningOtpOrchestrator,
    SigningDecisionOrchestrator,
  ],
  // SigningEventService is exported via SigningEventsModule
  exports: [
    SigningContextService,
    SigningOtpOrchestrator,
    SigningDecisionOrchestrator,
  ],
})
export class SigningModule {}
