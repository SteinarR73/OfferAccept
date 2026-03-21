import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, File, FileStatus } from '@prisma/client';

// ─── FileRepository ────────────────────────────────────────────────────────────
// All DB queries for the files domain.
//
// Org scoping is enforced at the query level (WHERE organizationId = ?) in
// every read/write that touches a specific file. Never rely on the service to
// filter by org after the fact — defense-in-depth against coding errors.

@Injectable()
export class FileRepository {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  async create(data: {
    id: string;            // caller pre-generates so s3Key can embed it
    organizationId: string;
    uploadedByUserId?: string;
    filename: string;
    mime: string;
    size: number;
    sha256: string;
    s3Key: string;
  }): Promise<File> {
    return this.db.file.create({ data });
  }

  /**
   * Fetch a file scoped to the given org.
   * Returns null if the file doesn't exist OR belongs to a different org.
   * Never returns files across org boundaries.
   */
  async findByIdAndOrg(fileId: string, organizationId: string): Promise<File | null> {
    return this.db.file.findFirst({ where: { id: fileId, organizationId } });
  }

  /**
   * Atomically mark a PENDING file as READY with its verified SHA-256.
   * Uses WHERE status = PENDING so a second call (replay) touches 0 rows
   * and the caller can detect it returned null → FileNotFoundError.
   */
  async markReady(fileId: string, organizationId: string, sha256: string): Promise<File | null> {
    const result = await this.db.file.updateMany({
      where: { id: fileId, organizationId, status: FileStatus.PENDING },
      data: { status: FileStatus.READY, sha256 },
    });

    if (result.count === 0) return null;

    // Re-fetch so the caller gets the full updated row.
    return this.db.file.findUnique({ where: { id: fileId } });
  }

  /**
   * Hard-delete a PENDING file (e.g. on hash mismatch).
   * Only removes rows that are still PENDING — never deletes READY files.
   */
  async deletePendingFile(fileId: string): Promise<void> {
    await this.db.file
      .delete({ where: { id: fileId, status: FileStatus.PENDING } })
      .catch(() => {/* already gone — best effort */});
  }
}
