import type { IncomingMessage } from 'node:http';
import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CsrfOriginMiddleware } from './common/middleware/csrf-origin.middleware';
import { buildLogSanitizer } from './common/logging/log-sanitizer';
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
import { AdminModule } from './modules/admin/admin.module';
import { PackagesModule } from './modules/packages/packages.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { AiModule } from './common/ai/ai.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { ApiRateLimitGuard } from './common/rate-limit/api-rate-limit.guard';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Pino structured logger. Replaces NestJS's default console logger.
    // All existing `new Logger(context)` calls transparently use pino.
    // HTTP requests are logged by pino-http with requestId correlation.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
        // Pretty-print in development; JSON in production for log aggregators.
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        // Layer 1 — path-based redaction: removes known credential header fields
        // before they can appear in HTTP access log entries.
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
          censor: '[Redacted]',
        },
        // Layer 2 — pattern-based sanitization: walks every log object and
        // replaces credential-pattern matches (Stripe keys, Gemini API keys,
        // bearer tokens, PEM headers) with [REDACTED:<rule>] tokens.
        // Covers values that land in error messages, request bodies, SDK
        // responses, or any dynamically keyed field that path-redaction misses.
        formatters: {
          log: buildLogSanitizer(),
        },
        // Attach requestId (from X-Request-ID header or generated UUID) to every
        // HTTP log line. Correlates access logs with application logs.
        // pino-http sets req.id after processing RequestIdInterceptor; cast through
        // IncomingMessage (which lacks the id extension) to avoid the mismatch.
        customProps: (req: IncomingMessage) => ({ requestId: (req as IncomingMessage & { id?: string }).id }),
        // Suppress noisy health-probe access logs in production.
        autoLogging: {
          ignore: (req: { url?: string }) =>
            !!req.url?.startsWith('/api/v1/health') || !!req.url?.startsWith('/api/v1/metrics'),
        },
      },
    }),
    DatabaseModule,
    MetricsModule,
    AiModule,
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
    AdminModule,
    PackagesModule,
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
    // Global per-IP rate limit: 100 requests per minute.
    // Registered as APP_GUARD so it runs inside NestJS's exception-filter chain,
    // ensuring RateLimitExceededError is translated to 429 by DomainExceptionFilter.
    // Admin users (OWNER, INTERNAL_SUPPORT) and health probes are exempt.
    {
      provide: APP_GUARD,
      useClass: ApiRateLimitGuard,
    },
    // Registered as APP_FILTER (not app.useGlobalFilters(new ...)) so NestJS
    // resolves DomainExceptionFilter through the DI container, enabling MetricsService
    // injection for api_error_rate counter tracking.
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
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
