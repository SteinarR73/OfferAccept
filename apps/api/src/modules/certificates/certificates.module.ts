import { Module } from '@nestjs/common';
import { CertificatePayloadBuilder } from './certificate-payload.builder';
import { CertificateService } from './certificate.service';
import { CertificatesController } from './certificates.controller';
import { SigningEventsModule } from '../signing/signing-events.module';
import { DealEventsModule } from '../deal-events/deal-events.module';

@Module({
  imports: [SigningEventsModule, DealEventsModule],
  controllers: [CertificatesController],
  providers: [CertificatePayloadBuilder, CertificateService],
  exports: [CertificateService],
})
export class CertificatesModule {}
