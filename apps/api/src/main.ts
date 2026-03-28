import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import type { Env } from './config/env';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['log', 'warn', 'error'],
    // rawBody: true makes the raw request body available via @RawBody() in controllers.
    // Required for Stripe webhook signature verification — Stripe signs the raw bytes,
    // not the parsed JSON. Without this, constructEvent() will throw a signature mismatch.
    rawBody: true,
  });

  // ── Reverse-proxy trust ──────────────────────────────────────────────────────
  // Read TRUST_PROXY from the validated ConfigService so it is covered by the
  // Zod env schema (startup fails in production if the variable is absent/false).
  const config = app.get(ConfigService<Env, true>);
  if (config.get('TRUST_PROXY', { infer: true })) {
    // Trust exactly one proxy hop. Increase to 2+ if the stack is
    // API-gateway → LB → app (each hop forwards X-Forwarded-For).
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // ── Security headers (helmet) ─────────────────────────────────────────────────
  // Applied before any route handler. Defaults are safe; CSP is intentionally
  // relaxed for the API (no HTML responses) but strict for the browser.
  app.use(
    helmet({
      contentSecurityPolicy: false, // API — no HTML; frontend sets its own CSP
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,       // 1 year
        includeSubDomains: true,
        // preload: true signals intent to be on the HSTS preload list.
        // ACTION REQUIRED before production: register the domain at https://hstspreload.org/
        preload: true,
      },
    }),
  );

  // ── Cookie parser ──────────────────────────────────────────────────────────────
  // Required to read HttpOnly cookies in controller/guard handlers.
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  app.useGlobalFilters(new DomainExceptionFilter());

  // RequestIdInterceptor is registered as an APP_INTERCEPTOR in AppModule so it
  // can receive TraceContext via DI. No manual registration needed here.

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    // Exact origin match — no wildcard. 'credentials: true' requires a non-wildcard origin.
    origin: config.get('WEB_BASE_URL', { infer: true }),
    credentials: true,
    // Restrict to methods the app actually uses. Browsers cache preflight for
    // up to maxAge seconds; being explicit reduces the attack surface for
    // future method additions that haven't been security-reviewed.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Only headers the browser client or API clients actually send.
    // Any other header in a CORS request will be denied at the preflight stage.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Api-Key'],
    // Expose X-Request-ID so clients can log/trace individual requests.
    exposedHeaders: ['X-Request-ID'],
  });

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  logger.log(`API running on http://localhost:${port}/api/v1`);
}

bootstrap();
