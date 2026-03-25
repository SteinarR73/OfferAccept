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
import { StorageModule } from './common/storage/storage.module';
import { FilesModule } from './modules/files/files.module';
import { JobsModule } from './modules/jobs/job.module';
import { EnterpriseHttpModule } from './modules/enterprise/enterprise-http.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DealEventsModule } from './modules/deal-events/deal-events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    RateLimitModule,
    EmailModule,
    StorageModule,    // global: provides STORAGE_PORT
    AuthModule,       // global: provides JwtService + JwtAuthGuard
    AuthFeatureModule, // provides POST /auth/login
    HealthModule,
    OrganizationsModule,
    OffersModule,
    SigningModule,
    CertificatesModule,
    BillingModule,
    SupportModule,
    FilesModule,
    JobsModule,
    DealEventsModule,    // global: provides DealEventService everywhere
    EnterpriseHttpModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
