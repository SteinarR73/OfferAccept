import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { RateLimitModule } from '../../common/rate-limit/rate-limit.module';

@Module({
  imports: [RateLimitModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
