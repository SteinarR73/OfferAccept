import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { OffersModule } from './modules/offers/offers.module';
import { SigningModule } from './modules/signing/signing.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { BillingModule } from './modules/billing/billing.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule } from './common/auth/auth.module';
import { AuthFeatureModule } from './modules/auth/auth.module';
import { SupportModule } from './modules/support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    RateLimitModule,
    EmailModule,
    AuthModule,       // global: provides JwtService + JwtAuthGuard
    AuthFeatureModule, // provides POST /auth/login
    HealthModule,
    OrganizationsModule,
    OffersModule,
    SigningModule,
    CertificatesModule,
    BillingModule,
    SupportModule,
  ],
})
export class AppModule {}
