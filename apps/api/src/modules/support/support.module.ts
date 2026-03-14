import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { OffersModule } from '../offers/offers.module';
import { SigningModule } from '../signing/signing.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [
    OffersModule,       // provides SendOfferService (revoke + resend-link)
    SigningModule,      // provides SigningFlowService (issueOtpForSession)
    CertificatesModule, // provides CertificateService (verify)
  ],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
