import { Controller, Get, Logger, Param, UseGuards, Req, Res, Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import * as archiver from 'archiver';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { CertificateService } from './certificate.service';
import { CertificatePdfService } from './certificate-pdf.service';
import { extractClientIp } from '../../common/proxy/trusted-proxy.util';
import { TraceContext } from '../../common/trace/trace.context';
import { STORAGE_PORT, type StoragePort } from '../../common/storage/storage.port';

// ─── CertificatesController ────────────────────────────────────────────────────
// Mixed access: some routes are public (no auth), others require a JWT.
//
// Guard is applied per-route (not at class level) to allow the public verify
// endpoint to coexist with authenticated endpoints in the same controller.
//
// GET /certificates/:id           → JWT-required — metadata + stored hash
// GET /certificates/:id/verify    → PUBLIC — full integrity result (no sensitive data)
// GET /certificates/:id/export    → JWT-required — full payload + canonicalJson
//
// Authorization model (enforced at service level, not only here):
//   - Authenticated endpoints: caller must belong to the same org as the offer,
//     or have the INTERNAL_SUPPORT role. Cross-tenant access is rejected.
//   - Public verify endpoint: returns only integrity check results (hashes +
//     booleans). No offer content, no email addresses, no acceptance statement.
//
// The public verify endpoint is intentionally read-only and free of sensitive data:
//   - No acceptance statement text (verbatim statement is internal)
//   - No IP addresses or user agent strings
//   - No raw email addresses
//   - Only hashes, booleans, and anomaly descriptions

@Controller('certificates')
export class CertificatesController {
  private readonly logger = new Logger(CertificatesController.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly certificates: CertificateService,
    private readonly pdfService: CertificatePdfService,
    private readonly rateLimiter: RateLimitService,
    private readonly traceContext: TraceContext,
    config: ConfigService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {
    this.webBaseUrl = config.getOrThrow<string>('WEB_BASE_URL');
  }

  // Streams a ZIP archive containing all certificate PDFs for the caller's organization.
  //
  // IMPORTANT: This route must be defined BEFORE @Get(':id') so that the literal
  // path segment 'bulk-export' is not captured as an :id parameter.
  //
  // Each PDF is named `certificate-{id}.pdf`. The ZIP also includes a
  // `manifest.json` listing all certificates with their metadata.
  // Certificates are processed sequentially to avoid memory pressure.
  //
  // Rate limited to 3 exports per hour per organization.
  // Access is scoped to the caller's organization.
  @Get('bulk-export')
  @UseGuards(JwtAuthGuard)
  async bulkExport(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = extractClientIp(req);
    await this.rateLimiter.check('bulk_cert_export', `${user.orgId}:${ip}`);

    // Load all certificate IDs for this org — only metadata, no payload yet
    const certs = await this.certificates.listOrgCertificates(user.orgId);

    const filename = `certificates-${user.orgId}-${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver.default('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    // Manifest array — populated as each certificate is processed
    const manifest: Array<{
      certificateId: string;
      certificateHash: string;
      issuedAt: string;
      dealTitle: string;
      recipientEmail: string;
    }> = [];

    for (const cert of certs) {
      try {
        const exported = await this.certificates.exportPayload(
          cert.id,
          user.orgId,
          user.role,
        );
        const pdfBytes = await this.pdfService.generate({
          certificateId: exported.certificateId,
          certificateHash: exported.certificateHash,
          issuedAt: exported.issuedAt,
          payload: exported.payload,
        });

        archive.append(Buffer.from(pdfBytes), {
          name: `certificate-${cert.id}.pdf`,
        });

        manifest.push({
          certificateId:  exported.certificateId,
          certificateHash: exported.certificateHash,
          issuedAt:       exported.issuedAt,
          dealTitle:      exported.payload.offer.title,
          recipientEmail: exported.payload.recipient.verifiedEmail,
        });
      } catch (err) {
        this.logger.warn(JSON.stringify({
          event: 'bulk_export_cert_skip',
          certificateId: cert.id,
          reason: err instanceof Error ? err.message : String(err),
        }));
      }
    }

    // Add manifest as the last file in the archive
    archive.append(
      Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), certificates: manifest }, null, 2), 'utf-8'),
      { name: 'manifest.json' },
    );

    this.logger.log(JSON.stringify({
      event: 'bulk_cert_export',
      orgId: user.orgId,
      traceId: this.traceContext.get(),
      certificateCount: manifest.length,
      skippedCount: certs.length - manifest.length,
    }));

    await archive.finalize();
  }

  // Returns certificate metadata for authenticated callers (sender, support).
  // Does not recompute the hash — returns stored hash.
  // Access is scoped to the owning organization. INTERNAL_SUPPORT may access any.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getCertificate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const exported = await this.certificates.exportPayload(id, user.orgId, user.role);
    return {
      certificateId: exported.certificateId,
      certificateHash: exported.certificateHash,
      issuedAt: exported.issuedAt,
      verificationUrl: `${this.webBaseUrl}/verify/${id}`,
      offer: exported.payload.offer,
      recipient: exported.payload.recipient,
      sender: exported.payload.sender,
    };
  }

  // Public endpoint — no authentication required.
  //
  // Allows any third party with a certificateId to independently verify that:
  //   1. The certificate hash still matches evidence in the database
  //   2. The offer snapshot content is unchanged since sending
  //   3. The signing event chain has not been tampered with
  //
  // Does NOT expose:
  //   - Acceptance statement (verbatim legal text — internal use only)
  //   - IP addresses or user agents
  //   - Raw email addresses
  //   - Certificate payload content (use GET /export for that, authenticated)
  //
  // To fully independently verify, a third party should:
  //   1. Call GET /certificates/:id/export (authenticated) to get the payload
  //   2. Compute SHA-256 of deepSortKeys(JSON.stringify(payload)) themselves
  //   3. Compare their computed hash to this endpoint's reconstructedHash
  @Get(':id/verify')
  async verifyCertificate(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = extractClientIp(req);
    // Rate-limit by IP — public endpoint, protects against bulk scraping
    await this.rateLimiter.check('cert_verify', ip);

    // Expose rate limit state so callers can back off gracefully
    const { remaining, resetAt } = await this.rateLimiter.peek('cert_verify', ip);
    res.setHeader('X-RateLimit-Limit', '10');
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt.getTime() / 1000)));

    const result = await this.certificates.verify(id);

    this.logger.log(JSON.stringify({
      event: 'certificate_verify',
      traceId: this.traceContext.get(),
      certificateId: id,
      valid: result.valid,
      anomalyCount: result.anomaliesDetected.length,
    }));

    // Return verification result with no sensitive internal data
    return {
      certificateId: result.certificateId,
      verificationUrl: `${this.webBaseUrl}/verify/${result.certificateId}`,
      valid: result.valid,
      certificateHashMatch: result.certificateHashMatch,
      reconstructedHash: result.reconstructedHash,
      storedHash: result.storedHash,
      snapshotIntegrity: result.snapshotIntegrity,
      eventChainIntegrity: result.eventChainValid,
      anomaliesDetected: result.anomaliesDetected,
      // Legal document versions governing this certificate.
      // Versions are not sensitive — they are public document identifiers.
      metadata: result.metadata,
    };
  }

  // Returns the full canonical payload + the exact JSON string that was hashed.
  // Suitable for archiving or third-party independent verification.
  // Access is scoped to the owning organization. INTERNAL_SUPPORT may access any.
  @Get(':id/export')
  @UseGuards(JwtAuthGuard)
  async exportCertificate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const result = await this.certificates.exportPayload(id, user.orgId, user.role);
    return { ...result, verificationUrl: `${this.webBaseUrl}/verify/${id}` };
  }

  // Returns a PDF version of the acceptance certificate for archival.
  // Suitable for document management systems and email archives.
  // Access is scoped to the owning organization. INTERNAL_SUPPORT may access any.
  //
  // The PDF is NOT an electronic signature document — it clearly identifies itself
  // as an acceptance record. No signature graphics are included.
  // Returns a PDF version of the acceptance certificate for archival.
  //
  // Serve strategy (prefer pre-generated):
  //   1. Check if AcceptanceCertificate.pdfStorageKey is set (async job completed).
  //      If yes → redirect to a short-lived presigned S3 download URL.
  //   2. If not yet available (job pending/failed) → generate on-demand and stream.
  //      This guarantees the endpoint always responds even during job lag.
  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    // Check if the PDF has already been generated and stored asynchronously.
    const pdfStorageKey = await this.certificates.getPdfStorageKey(id, user.orgId, user.role);

    if (pdfStorageKey) {
      // Serve via presigned URL — offloads bandwidth from the API process.
      const filename = `certificate-${id}.pdf`;
      const downloadUrl = await this.storage.getPresignedDownloadUrl(
        pdfStorageKey,
        300, // 5 minutes
        filename,
      );
      res.redirect(302, downloadUrl);
      return;
    }

    // PDF not yet generated — fall back to on-demand generation.
    const exported = await this.certificates.exportPayload(id, user.orgId, user.role);

    const pdfBytes = await this.pdfService.generate({
      certificateId: exported.certificateId,
      certificateHash: exported.certificateHash,
      issuedAt: exported.issuedAt,
      payload: exported.payload,
    });

    const filename = `certificate-${exported.certificateId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.byteLength);
    res.end(Buffer.from(pdfBytes));
  }
}
