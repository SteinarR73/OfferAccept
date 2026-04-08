import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

/** DPA document version served at /legal/dpa. Bump when the document changes. */
export const CURRENT_DPA_VERSION = '1.0';

// ─── DpaService ────────────────────────────────────────────────────────────────
// Handles DPA acceptance recording and status retrieval.
//
// DPA agreements are append-only — executing again against a new version creates
// a new row. The "current" status is derived from the most recent row where
// dpaVersion = CURRENT_DPA_VERSION.

@Injectable()
export class DpaService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /**
   * Record a DPA acceptance for the given organisation.
   * Always inserts a new row — never updates or deletes existing records.
   */
  async accept(params: {
    organizationId: string;
    acceptedByUserId: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<DpaStatusResponse> {
    const row = await this.prisma.dpaAgreement.create({
      data: {
        organizationId:   params.organizationId,
        dpaVersion:       CURRENT_DPA_VERSION,
        acceptedByUserId: params.acceptedByUserId,
        ipAddress:        params.ipAddress,
        userAgent:        params.userAgent,
      },
      select: {
        id:               true,
        dpaVersion:       true,
        acceptedAt:       true,
        acceptedByUserId: true,
      },
    });

    return {
      accepted:         true,
      currentVersion:   CURRENT_DPA_VERSION,
      acceptedVersion:  row.dpaVersion,
      acceptedAt:       row.dpaVersion === CURRENT_DPA_VERSION ? row.acceptedAt : null,
      acceptedByUserId: row.acceptedByUserId,
      agreementId:      row.id,
    };
  }

  /**
   * Return the DPA status for the given organisation.
   * `accepted` is true only if the current version has been agreed to.
   */
  async getStatus(organizationId: string): Promise<DpaStatusResponse> {
    const latest = await this.prisma.dpaAgreement.findFirst({
      where: { organizationId, dpaVersion: CURRENT_DPA_VERSION },
      orderBy: { acceptedAt: 'desc' },
      select: {
        id:               true,
        dpaVersion:       true,
        acceptedAt:       true,
        acceptedByUserId: true,
      },
    });

    if (!latest) {
      return {
        accepted:         false,
        currentVersion:   CURRENT_DPA_VERSION,
        acceptedVersion:  null,
        acceptedAt:       null,
        acceptedByUserId: null,
        agreementId:      null,
      };
    }

    return {
      accepted:         true,
      currentVersion:   CURRENT_DPA_VERSION,
      acceptedVersion:  latest.dpaVersion,
      acceptedAt:       latest.acceptedAt,
      acceptedByUserId: latest.acceptedByUserId,
      agreementId:      latest.id,
    };
  }
}

// ─── Response shape ────────────────────────────────────────────────────────────

export interface DpaStatusResponse {
  /** Whether the current DPA version has been accepted by this organisation. */
  accepted: boolean;
  /** The version of the DPA document currently in force. */
  currentVersion: string;
  /** The version the org most recently accepted (null if never accepted). */
  acceptedVersion: string | null;
  /** ISO timestamp of the most recent acceptance of the current version. */
  acceptedAt: Date | null;
  /** userId of the person who accepted. */
  acceptedByUserId: string | null;
  /** Row id of the DpaAgreement record created/found. */
  agreementId: string | null;
}
