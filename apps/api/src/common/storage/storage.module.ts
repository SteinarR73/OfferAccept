import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PORT, StoragePort } from './storage.port';
import { DevStorageAdapter } from './dev-storage.adapter';
import { S3Adapter } from './s3.adapter';

// ─── StorageModule ─────────────────────────────────────────────────────────────
// Global module providing the STORAGE_PORT injection token.
//
// Adapter selection (STORAGE_PROVIDER env var):
//   dev → DevStorageAdapter — in-memory; never real S3; safe for local/test
//   s3  → S3Adapter         — uses AWS S3; requires credentials in env
//
// DevStorageAdapter is always registered as a NestJS provider so tests can
// inject it via module.get(DevStorageAdapter) to use test helpers
// (storeBuffer, getSha256, clear) regardless of which adapter is active.
//
// Callers inject STORAGE_PORT only — never import adapters directly.

@Global()
@Module({
  providers: [
    DevStorageAdapter,
    {
      provide: STORAGE_PORT,
      useFactory: (config: ConfigService, devAdapter: DevStorageAdapter): StoragePort => {
        const provider = config.get<string>('STORAGE_PROVIDER', 'dev');
        const logger = new Logger('StorageModule');

        // Runtime guard — belt-and-suspenders on top of the Zod env validation.
        // The env schema already blocks STORAGE_PROVIDER=dev in production,
        // but this explicit throw makes the failure impossible to miss if the
        // validation is ever bypassed or the module is constructed in tests
        // with a manually crafted config.
        if (process.env['NODE_ENV'] === 'production' && provider === 'dev') {
          throw new Error(
            '[StorageModule] STORAGE_PROVIDER=dev is not allowed in production. ' +
            'Set STORAGE_PROVIDER=s3 and provide AWS credentials.',
          );
        }

        if (provider === 's3') {
          const region = config.getOrThrow<string>('AWS_REGION');
          const accessKeyId = config.getOrThrow<string>('AWS_ACCESS_KEY_ID');
          const secretAccessKey = config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY');
          const bucketName = config.getOrThrow<string>('S3_BUCKET_NAME');
          logger.log(`Storage provider: S3 (bucket: ${bucketName}, region: ${region})`);
          return new S3Adapter({ region, accessKeyId, secretAccessKey, bucketName });
        }

        logger.log('Storage provider: DevStorageAdapter (dev/test — no real S3)');
        return devAdapter;
      },
      inject: [ConfigService, DevStorageAdapter],
    },
  ],
  exports: [STORAGE_PORT, DevStorageAdapter],
})
export class StorageModule {}
