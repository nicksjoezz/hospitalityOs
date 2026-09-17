import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

function corsOrigin(raw: string): boolean | string[] {
  const v = (raw ?? '').trim();
  if (v === '' || v === '*') return true; // reflect any (dev / single-origin)
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    // Capture the raw request body so we can verify WhatsApp webhook signatures.
    rawBody: true,
  });
  app.setGlobalPrefix('api/v1');

  // Security headers + gzip. CSP is relaxed so the served SPA and Socket.IO work.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());

  const origin = corsOrigin(process.env.CORS_ORIGINS ?? '*');
  app.enableCors({ origin, credentials: true });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `HospitalityOS API listening on http://localhost:${port}/api/v1 (CORS: ${process.env.CORS_ORIGINS ?? '*'})`,
  );
}

void bootstrap();
