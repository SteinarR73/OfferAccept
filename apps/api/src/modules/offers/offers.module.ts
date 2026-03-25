import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersService } from './services/offers.service';
import { SendOfferService } from './services/send-offer.service';
import { DealStatusService } from './services/deal-status.service';
import { DealEventsModule } from '../deal-events/deal-events.module';

@Module({
  imports: [DealEventsModule],
  controllers: [OffersController],
  providers: [OffersService, SendOfferService, DealStatusService],
  // SendOfferService exported for use by SupportModule (revoke / resend-link actions)
  exports: [SendOfferService, DealStatusService],
})
export class OffersModule {}
