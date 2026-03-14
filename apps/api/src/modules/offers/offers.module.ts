import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './services/offers.service';
import { SendOfferService } from './services/send-offer.service';

@Module({
  controllers: [OffersController],
  providers: [OffersService, SendOfferService],
  // SendOfferService exported for use by SupportModule (revoke / resend-link actions)
  exports: [SendOfferService],
})
export class OffersModule {}
