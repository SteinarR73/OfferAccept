// Observability must be initialised before any other imports so Sentry/OTel can
// instrument all subsequently loaded modules (HTTP, database drivers, etc.).
import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable the default NestJS console logger — nestjs-pino provides it via
    // app.useLogger() below. Suppressing here avoids duplicated boot logs.
    bufferLogs: true,
    // rawBody: true makes the raw request body available via @RawBody() in controllers.
    // Required for Stripe webhook signature verification — Stripe signs the raw bytes,
    // not the parsed JSON. Without this, constructEvent() will throw a signature mismatch.
    rawBody: true,
  });

  // ── Pino logger ───────────────────────────────────────────────────────────────
  // Swap NestJS's default logger for the pino-backed one from LoggerModule.
  // All `new Logger(context)` calls throughout the app now route through pino,
  // producing structured JSON in production and pretty-printed lines in dev.
  app.useLogger(app.get(Logger));

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
        // preload intentionally omitted until the domain is registered at
        // https://hstspreload.org/ and TLS has been stable for 30+ days.
        // Once registered, add: preload: true
      },
    }),
  );

  // ── Cookie parser ──────────────────────────────────────────────────────────────
  // Required to read HttpOnly cookies in controller/guard handlers.
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  // DomainExceptionFilter is registered as APP_FILTER in AppModule so it receives
  // MetricsService via DI. No manual useGlobalFilters() call needed here.

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
  app.get(Logger).log(`API running on http://localhost:${port}/api/v1`);
}

bootstrap();
