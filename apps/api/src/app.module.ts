import { Module, NestModule, MiddlewareConsumer, RequestMethod, APP_INTERCEPTOR } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CsrfOriginMiddleware } from './common/middleware/csrf-origin.middleware';
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
import { TraceModule } from './common/trace/trace.module';
import { AccountModule } from './modules/account/account.module';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';

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
    TraceModule,    // global: provides TraceContext to all modules
    AccountModule,
  ],
  providers: [
    // Register RequestIdInterceptor through DI so it can receive TraceContext.
    // Using APP_INTERCEPTOR instead of app.useGlobalInterceptors(new X()) is required
    // because the latter instantiates the class outside of NestJS's DI container,
    // making constructor injection impossible.
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply CSRF origin check to all state-mutating routes globally.
    // The middleware's own logic gates on cookie presence and Origin header,
    // so public/Bearer-authenticated endpoints are not affected.
    consumer
      .apply(CsrfOriginMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
