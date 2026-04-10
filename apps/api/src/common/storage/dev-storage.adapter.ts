import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { StoragePort, PresignedUploadResult } from './storage.port';

// ─── DevStorageAdapter ─────────────────────────────────────────────────────────
// In-memory storage adapter for local development and unit tests.
// NEVER use in production.
//
// Presigned URLs are fake — they point to a localhost endpoint that doesn't
// actually exist. Tests that exercise the full upload flow should either:
//   a) Use the test helper methods (storeBuffer / getSha256) directly, or
//   b) Stub the upload step and call completeUpload with the real hash.
//
// Test helpers:
//   devAdapter.storeBuffer(key, buffer)  — simulates a completed S3 upload
//   devAdapter.getSha256(key)            — returns the stored hash (or null)
//   devAdapter.clear()                   — resets all stored state

@Injectable()
export class DevStorageAdapter implements StoragePort {
  private readonly store = new Map<string, { buffer: Buffer; sha256: string; mimeType: string }>();
  private readonly logger = new Logger(DevStorageAdapter.name);

  async getPresignedUploadUrl(
    key: string,
    _mimeType: string,
    _maxBytes: number,
    ttlSeconds: number,
  ): Promise<PresignedUploadResult> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const fakeUrl = `http://localhost:19999/dev-storage/${encodeURIComponent(key)}`;

    this.logger.debug(`[DEV] Presigned upload URL for key: ${key}`);

    return { uploadUrl: fakeUrl, expiresAt };
  }

  async getPresignedDownloadUrl(key: string, _ttlSeconds: number, _filename: string): Promise<string> {
    return `http://localhost:19999/dev-storage/${encodeURIComponent(key)}`;
  }

  async getObjectSha256(key: string): Promise<string | null> {
    return this.store.get(key)?.sha256 ?? null;
  }

  async getObjectMimeType(key: string): Promise<string | null> {
    return this.store.get(key)?.mimeType ?? null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.logger.debug(`[DEV] Deleted key: ${key}`);
  }

  async putBuffer(key: string, mimeType: string, buffer: Buffer): Promise<void> {
    this.storeBuffer(key, buffer, mimeType);
    this.logger.debug(`[DEV] Stored buffer for key: ${key} (${buffer.byteLength} bytes)`);
  }

  // ── Test helpers ─────────────────────────────────────────────────────────────

  /** Simulate a completed S3 upload. Computes and stores the SHA-256 of the buffer. */
  storeBuffer(key: string, buffer: Buffer, mimeType = 'application/octet-stream'): string {
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    this.store.set(key, { buffer, sha256, mimeType });
    return sha256;
  }

  /** Returns the stored SHA-256 for a key, or null if the key doesn't exist. */
  getSha256(key: string): string | null {
    return this.store.get(key)?.sha256 ?? null;
  }

  /** Returns the stored buffer for a key (for download simulation in tests). */
  getBuffer(key: string): Buffer | null {
    return this.store.get(key)?.buffer ?? null;
  }

  /** Clears all stored files. Call between tests. */
  clear(): void {
    this.store.clear();
  }
}
