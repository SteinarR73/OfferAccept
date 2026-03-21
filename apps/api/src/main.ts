import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['log', 'warn', 'error'],
  });

  // ── Reverse-proxy trust ──────────────────────────────────────────────────────
  // If behind a load balancer / nginx, trust the first hop so req.secure and
  // X-Forwarded-Proto work correctly for cookie Secure flag detection.
  // trusted-proxy.util.ts controls X-Forwarded-For trust for IP extraction.
  if (process.env.TRUST_PROXY === 'true') {
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
        preload: true,
      },
    }),
  );

  // ── Cookie parser ──────────────────────────────────────────────────────────────
  // Required to read HttpOnly cookies in controller/guard handlers.
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  app.useGlobalFilters(new DomainExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api/v1`);
}

bootstrap();
