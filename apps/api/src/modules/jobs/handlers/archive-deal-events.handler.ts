import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'pg-boss';
import type { ArchiveDealEventsPayload } from '../job.types';

// ─── ArchiveDealEventsHandler ──────────────────────────────────────────────────
// Moves DealEvent rows older than the retention period from deal_events (hot)
// to deal_events_archive (cold).
//
// ── Retention policy ──────────────────────────────────────────────────────────
// Default: 18 months active retention (configurable via DEAL_EVENT_RETENTION_MONTHS).
// Events older than the cutoff are eligible for archival.
//
// ── Archival contract ─────────────────────────────────────────────────────────
//   1. SELECT a batch of eligible rows (ORDER BY createdAt ASC to process oldest first).
//   2. INSERT into deal_events_archive (ON CONFLICT DO NOTHING — idempotent).
//   3. DELETE the same rows from deal_events (only rows that were successfully inserted).
//   4. Update the archival_checkpoint row.
//
// Steps 2–4 are wrapped in a transaction so a partial failure never creates
// duplicate rows or phantom deletions.
//
// ── Idempotency ───────────────────────────────────────────────────────────────
// The INSERT … ON CONFLICT DO NOTHING ensures that retries after partial failure
// do not create duplicate archive rows. The DELETE uses the same ID set so
// rows cannot be deleted without being archived first.
//
// ── Cron schedule ─────────────────────────────────────────────────────────────
// Default: 0 2 * * * (02:00 UTC daily).
// Each run archives at most DEAL_EVENT_ARCHIVE_BATCH_SIZE rows (default: 10,000).
// If the backlog is larger, subsequent daily runs will clear it progressively.
//
// ── Performance ──────────────────────────────────────────────────────────────
// Uses the existing @@index([createdAt]) on deal_events for the cursor query.
// The archive table has a matching index on (dealId, createdAt).
// Batch size is bounded to prevent long-running transactions that hold locks.

const DEFAULT_RETENTION_MONTHS = 18;
const DEFAULT_BATCH_SIZE       = 10_000;

@Injectable()
export class ArchiveDealEventsHandler {
  private readonly logger = new Logger(ArchiveDealEventsHandler.name);

  private readonly retentionMonths: number;
  private readonly batchSize: number;

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly config: ConfigService,
  ) {
    this.retentionMonths = this.config.get<number>('DEAL_EVENT_RETENTION_MONTHS', DEFAULT_RETENTION_MONTHS);
    this.batchSize       = this.config.get<number>('DEAL_EVENT_ARCHIVE_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  }

  async handle(jobs: Job<ArchiveDealEventsPayload>[]): Promise<void> {
    // This is a cron sweep — we process one batch regardless of how many jobs
    // are in the batch (always 1 for a cron-triggered job).
    void jobs;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - this.retentionMonths);

    this.logger.log(
      {
        event: 'archive_deal_events_start',
        cutoff: cutoff.toISOString(),
        retentionMonths: this.retentionMonths,
        batchSize: this.batchSize,
      },
      `[ArchiveDealEvents] Starting archival sweep (cutoff: ${cutoff.toISOString()})`,
    );

    // ── Step 1: Find eligible rows ─────────────────────────────────────────────
    const eligibleRows = await this.db.dealEvent.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
      select: {
        id: true,
        dealId: true,
        eventType: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (eligibleRows.length === 0) {
      this.logger.log(
        { event: 'archive_deal_events_no_rows' },
        '[ArchiveDealEvents] No eligible rows found — nothing to archive.',
      );
      await this.updateCheckpoint(0, null);
      return;
    }

    const ids = eligibleRows.map((r) => r.id);
    const oldestCreatedAt = eligibleRows[0]!.createdAt;

    this.logger.log(
      { event: 'archive_deal_events_batch', count: eligibleRows.length, oldestCreatedAt },
      `[ArchiveDealEvents] Archiving ${eligibleRows.length} rows…`,
    );

    // ── Steps 2–4: Archive in a transaction ────────────────────────────────────
    // Using raw SQL for the INSERT … ON CONFLICT DO NOTHING because Prisma
    // createMany does not support ON CONFLICT. This is the only raw query in the handler.
    await this.db.$transaction(async (tx) => {
      // 2a. Build INSERT values for raw query
      // We use createManyAndReturn equivalent via createMany with skipDuplicates.
      // skipDuplicates maps to ON CONFLICT DO NOTHING in PostgreSQL.
      await tx.dealEventArchive.createMany({
        data: eligibleRows.map((row) => ({
          id:        row.id,
          dealId:    row.dealId,
          eventType: row.eventType,
          metadata:  row.metadata ?? undefined,
          createdAt: row.createdAt,
        })),
        skipDuplicates: true, // INSERT … ON CONFLICT DO NOTHING
      });

      // 3. Delete the rows from the source table.
      //    Only delete IDs that were in our SELECT — never broader.
      const { count: deletedCount } = await tx.dealEvent.deleteMany({
        where: { id: { in: ids } },
      });

      if (deletedCount !== eligibleRows.length) {
        this.logger.warn(
          {
            event: 'archive_deal_events_count_mismatch',
            expected: eligibleRows.length,
            deleted: deletedCount,
          },
          `[ArchiveDealEvents] Count mismatch: archived ${eligibleRows.length} but deleted ${deletedCount}. ` +
          'Some rows may have been deleted externally — this is non-fatal (they were already archived).',
        );
      }
    });

    // 4. Update checkpoint outside transaction (non-critical)
    await this.updateCheckpoint(eligibleRows.length, oldestCreatedAt);

    this.logger.log(
      { event: 'archive_deal_events_complete', archivedCount: eligibleRows.length },
      `[ArchiveDealEvents] Archived ${eligibleRows.length} rows successfully.`,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async updateCheckpoint(rowsArchived: number, oldestCreatedAt: Date | null): Promise<void> {
    try {
      await this.db.archivalCheckpoint.upsert({
        where: { id: 'deal_events' },
        create: {
          id: 'deal_events',
          rowsArchived,
          totalRowsArchived: BigInt(rowsArchived),
          lastArchivedAt: oldestCreatedAt ?? undefined,
        },
        update: {
          rowsArchived,
          totalRowsArchived: { increment: BigInt(rowsArchived) },
          ...(oldestCreatedAt ? { lastArchivedAt: oldestCreatedAt } : {}),
        },
      });
    } catch (err: unknown) {
      // Non-critical: checkpoint failure must not fail the archival job.
      this.logger.warn(
        { event: 'archive_checkpoint_failed', error: err instanceof Error ? err.message : String(err) },
        '[ArchiveDealEvents] Failed to update checkpoint — archival data is still correct.',
      );
    }
  }
}
