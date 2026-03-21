// ─── Storage Port ──────────────────────────────────────────────────────────────
// Interface (port) for object storage. Inject the concrete adapter via the DI
// token 'STORAGE_PORT'. StorageModule selects the implementation at startup
// based on the STORAGE_PROVIDER environment variable.
//
// Upload flow (presigned PUT):
//   1. Call getPresignedUploadUrl() to get a time-limited S3 PUT URL.
//   2. Client uploads file bytes directly to S3 using that URL (no API proxy).
//   3. After upload, server verifies the file's SHA-256 via headObject.
//
// Security notes:
//   - Presigned upload URLs expire after ttlSeconds (default 300 / 5 min).
//   - Keys are org-scoped: {organizationId}/{fileId}/{filename}.
//   - SSE-S3 server-side encryption is required for S3Adapter.
//   - DevStorageAdapter is for local/test only — never use in production.

export interface PresignedUploadResult {
  uploadUrl: string;   // pre-signed PUT URL — send directly from client
  expiresAt: Date;
}

export interface StoragePort {
  getPresignedUploadUrl(
    key: string,
    mimeType: string,
    maxBytes: number,
    ttlSeconds: number,
  ): Promise<PresignedUploadResult>;

  getPresignedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;

  /** Returns the SHA-256 hex digest of the stored object, or null if it doesn't exist. */
  getObjectSha256(key: string): Promise<string | null>;

  delete(key: string): Promise<void>;
}

export const STORAGE_PORT = 'STORAGE_PORT';
