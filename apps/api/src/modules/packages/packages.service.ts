import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, AuditEventType, PackageType } from '@prisma/client';
import { z } from 'zod';

// ─── Package types ─────────────────────────────────────────────────────────────
// PACKAGE_TYPES mirrors the PackageType Prisma enum exactly.
// Source of truth for DB enforcement:  prisma/schema.prisma PackageType enum
// Source of truth for Zod enforcement: derived from Object.values(PackageType)
//   below, so adding a value to the Prisma enum and running `prisma generate`
//   automatically widens the Zod schema — no manual sync required.
//
// PACKAGE_TYPES is kept as a named export so other modules can enumerate
// available packages (e.g. billing, UI) without depending on the Prisma client
// internals.
export const PACKAGE_TYPES = Object.values(PackageType) as [PackageType, ...PackageType[]];

// ─── Audit event types ─────────────────────────────────────────────────────────
// AUDIT_EVENT_TYPES mirrors the AuditEventType Prisma enum.
// The Zod enum below is derived from it for the same auto-sync reason.
// Declaring as a const gives callers a stable reference without importing
// the Prisma client directly.
export const AUDIT_EVENT_TYPES = Object.values(AuditEventType) as [AuditEventType, ...AuditEventType[]];

// ─── Zod schemas ───────────────────────────────────────────────────────────────

export const ActivatePackageSchema = z.object({
  packageType: z.enum(PACKAGE_TYPES, {
    errorMap: () => ({
      message: `packageType must be one of: ${PACKAGE_TYPES.join(', ')}.`,
    }),
  }),
});

export type ActivatePackageDto = z.infer<typeof ActivatePackageSchema>;

// ─── Typed audit payloads ──────────────────────────────────────────────────────
// One payload interface per AuditEventType value.
// AuditEventPayloadMap is the single source of truth for what each event stores.
//
// Convention:
//   - Every payload must include enough context to reconstruct the "what happened"
//     without joining other tables (entityId + entityType on the row itself handle
//     the "which row", payload carries the "what changed").
//   - Use the Prisma enum types (PackageType, etc.) not raw strings.
//
// ADDING A NEW EVENT TYPE:
//   1. Add the value to AuditEventType enum in schema.prisma + migration.
//   2. Add the interface here.
//   3. Add an entry to AuditEventPayloadMap.
//   4. The _exhaustivePayloadMap constant below will fail to compile until you do.

interface PackageActivatedPayload {
  packageType: PackageType;
  packageId:   string;       // id of the created UserPackage row
}

// Payload shape for AI call audit events (written by AiService).
// Stored as JSONB in AuditEvent.payload; no foreign keys.
interface AiRequestPayload {
  model:     string;
  operation: string;
  tokensIn:  number;
  tokensOut: number;
  latencyMs: number;
  success:   boolean;
}

export type AuditEventPayloadMap = {
  // key = Prisma enum member name (TypeScript side of @map)
  package_activated: PackageActivatedPayload;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ai_request:        AiRequestPayload;
};

// Compile-time exhaustiveness check: if a new AuditEventType member is added
// without a matching AuditEventPayloadMap entry, this assignment fails to compile.
const _exhaustivePayloadMap: { [K in AuditEventType]: AuditEventPayloadMap[K] } =
  {} as AuditEventPayloadMap;
void _exhaustivePayloadMap;

// Type-safe factory: the compiler verifies that `data` has the exact shape
// required for the given event type. Cast to unknown then Prisma Json is required
// because Prisma's Json type does not accept typed interfaces directly.
function buildPayload<T extends AuditEventType>(
  _type: T,
  data: AuditEventPayloadMap[T],
): AuditEventPayloadMap[T] {
  return data;
}

// ─── Response shapes ───────────────────────────────────────────────────────────

export interface UserPackageRow {
  id:          string;
  userId:      string;
  packageType: PackageType;
  createdAt:   Date;
}

export interface ActivatePackageResult {
  packageId:    string;
  auditEventId: string;
  packageType:  PackageType;
  createdAt:    Date;
}

// ─── PackagesService ───────────────────────────────────────────────────────────

@Injectable()
export class PackagesService {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // Activates a package for a user and records a structured AuditEvent, both
  // inside a single interactive transaction.
  //
  // Interactive transaction (async callback) is used instead of the batch form
  // so that pkg.id is available when constructing the audit payload and entityId.
  //
  // Invariant: a UserPackage row is NEVER created without a matching AuditEvent
  // row — the transaction rolls both back together on failure.
  async activate(userId: string, dto: ActivatePackageDto): Promise<ActivatePackageResult> {
    const { pkg, audit } = await this.db.$transaction(async (tx) => {
      const pkg = await tx.userPackage.create({
        data: { userId, packageType: dto.packageType },
      });

      const audit = await tx.auditEvent.create({
        data: {
          type:       AuditEventType.package_activated,
          actorId:    userId,
          entityType: 'user_package',
          entityId:   pkg.id,
          payload:    buildPayload(AuditEventType.package_activated, {
            packageType: dto.packageType,
            packageId:   pkg.id,
          }) as object,
        },
      });

      return { pkg, audit };
    });

    return {
      packageId:    pkg.id,
      auditEventId: audit.id,
      packageType:  pkg.packageType,
      createdAt:    pkg.createdAt,
    };
  }

  // Returns all packages activated by the given user, newest first.
  // Uses an explicit select to prevent accidental column exposure if the model grows.
  async listForUser(userId: string): Promise<UserPackageRow[]> {
    return this.db.userPackage.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, userId: true, packageType: true, createdAt: true },
    });
  }
}
