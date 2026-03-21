import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { File } from '@prisma/client';
import { STORAGE_PORT, StoragePort } from '../../common/storage/storage.port';
import { FileRepository } from './file.repository';
import {
  FileTooLargeError,
  InvalidMimeTypeError,
  FileHashMismatchError,
  FileNotFoundError,
} from '../../common/errors/domain.errors';

// ─── FileService ───────────────────────────────────────────────────────────────
// Two-step presigned upload flow:
//
//   Step 1 — generatePresignUrl():
//     - Validates MIME type and file size against hard limits
//     - Pre-generates fileId so the S3 key embeds it without a second update
//     - Creates a PENDING File record, issues a presigned PUT URL
//     - Presigned URL TTL: 5 minutes (PRESIGN_TTL_SECONDS)
//     - The presigned URL is NEVER logged (contains time-limited credentials)
//
//   Step 2 — completeUpload():
//     - Looks up the file scoped to the caller's org (org enforced in DB query)
//     - Checks S3 metadata SHA-256 when the bucket has checksums enabled;
//       otherwise trusts the client-provided hash (background job can re-verify)
//     - Hash mismatch → deletes PENDING record + throws FileHashMismatchError
//     - markReady uses WHERE status = PENDING (atomic replay protection):
//       a second call returns null → FileNotFoundError, not a silent no-op
//
// getDownloadUrl():
//     - Scoped to caller's org; returns 1-hour presigned GET URL
//
// Security constants:
//   - MAX_FILE_BYTES    25 MB
//   - PRESIGN_TTL_SECONDS  300 s (5 min)
//   - DOWNLOAD_TTL_SECONDS 3600 s (1 h)

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

const PRESIGN_TTL_SECONDS = 300;    // 5 minutes
const DOWNLOAD_TTL_SECONDS = 3600;  // 1 hour

export interface PresignResult {
  fileId: string;
  uploadUrl: string;  // presigned PUT URL — caller must not log or persist this
  expiresAt: Date;
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly repo: FileRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async generatePresignUrl(
    organizationId: string,
    uploadedByUserId: string,
    filename: string,
    mime: string,
    size: number,
  ): Promise<PresignResult> {
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new InvalidMimeTypeError(mime);
    }

    if (size > MAX_FILE_BYTES) {
      throw new FileTooLargeError(MAX_FILE_BYTES);
    }

    const fileId = crypto.randomUUID();
    const s3Key = `${organizationId}/${fileId}/${filename}`;

    // Issue presigned URL BEFORE creating the DB record so that if S3 errors
    // we don't leave an orphaned PENDING row.
    const { uploadUrl, expiresAt } = await this.storage.getPresignedUploadUrl(
      s3Key,
      mime,
      size,
      PRESIGN_TTL_SECONDS,
    );

    // sha256 is unknown until the client uploads — stored as '' while PENDING.
    await this.repo.create({
      id: fileId,
      organizationId,
      uploadedByUserId,
      filename,
      mime,
      size,
      sha256: '',
      s3Key,
    });

    // Log the fileId but NEVER the uploadUrl — it contains time-limited S3 credentials.
    this.logger.log(`Presign issued: fileId=${fileId} org=${organizationId} user=${uploadedByUserId}`);

    return { fileId, uploadUrl, expiresAt };
  }

  async completeUpload(
    organizationId: string,
    fileId: string,
    clientSha256: string,
  ): Promise<File> {
    // Org scope enforced in the DB query — never trust service-level filtering alone.
    const file = await this.repo.findByIdAndOrg(fileId, organizationId);

    if (!file) {
      throw new FileNotFoundError();
    }

    // Verify hash via S3 metadata (available when bucket has checksums configured).
    // Returns null when not configured — trust client hash; background job re-verifies.
    const serverSha256 = await this.storage.getObjectSha256(file.s3Key);

    if (serverSha256 !== null && serverSha256 !== clientSha256) {
      this.logger.warn(`SHA-256 mismatch: fileId=${fileId}`);
      // Don't log client/server hashes — treat as internal detail.
      await this.repo.deletePendingFile(fileId);
      throw new FileHashMismatchError();
    }

    // markReady only touches rows WHERE status = PENDING.
    // A second call (replay) finds 0 rows → returns null → FileNotFoundError.
    const ready = await this.repo.markReady(fileId, organizationId, clientSha256);

    if (!ready) {
      // File was already READY or DELETED — treat as not found (don't reveal state).
      throw new FileNotFoundError();
    }

    this.logger.log(`Upload confirmed: fileId=${fileId} org=${organizationId}`);

    return ready;
  }

  async getDownloadUrl(organizationId: string, fileId: string): Promise<string> {
    const file = await this.repo.findByIdAndOrg(fileId, organizationId);

    if (!file || file.status !== 'READY') {
      throw new FileNotFoundError();
    }

    // Presigned download URL — caller must not log or cache beyond its TTL.
    return this.storage.getPresignedDownloadUrl(file.s3Key, DOWNLOAD_TTL_SECONDS);
  }
}
