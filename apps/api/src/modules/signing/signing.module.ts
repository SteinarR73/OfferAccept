import { Module } from '@nestjs/common';
import { SigningTokenService } from './services/signing-token.service';
import { SigningSessionService } from './services/signing-session.service';
import { SigningOtpService } from './services/signing-otp.service';
import { AcceptanceService } from './services/acceptance.service';
import { SigningFlowService } from './services/signing-flow.service';
import { SigningController } from './signing.controller';
import { SigningEventsModule } from './signing-events.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { EnterpriseCoreModule } from '../enterprise/enterprise-core.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SigningEventsModule, CertificatesModule, EnterpriseCoreModule, NotificationsModule],
  controllers: [SigningController],
  providers: [
    SigningTokenService,
    SigningSessionService,
    SigningOtpService,
    AcceptanceService,
    SigningFlowService,
  ],
  // SigningEventService is exported via SigningEventsModule
  exports: [SigningFlowService],
})
export class SigningModule {}
