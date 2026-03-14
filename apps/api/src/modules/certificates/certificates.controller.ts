import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CertificateService } from './certificate.service';

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
  constructor(private readonly certificates: CertificateService) {}

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
  async verifyCertificate(@Param('id') id: string) {
    const result = await this.certificates.verify(id);

    // Return verification result with no sensitive internal data
    return {
      certificateId: result.certificateId,
      valid: result.valid,
      certificateHashMatch: result.certificateHashMatch,
      reconstructedHash: result.reconstructedHash,
      storedHash: result.storedHash,
      snapshotIntegrity: result.snapshotIntegrity,
      eventChainIntegrity: result.eventChainValid,
      anomaliesDetected: result.anomaliesDetected,
    };
  }

  // Returns the full canonical payload + the exact JSON string that was hashed.
  // Suitable for archiving or third-party independent verification.
  // Access is scoped to the owning organization. INTERNAL_SUPPORT may access any.
  @Get(':id/export')
  @UseGuards(JwtAuthGuard)
  async exportCertificate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.certificates.exportPayload(id, user.orgId, user.role);
  }
}
