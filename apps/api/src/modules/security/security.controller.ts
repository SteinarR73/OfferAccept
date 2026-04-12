import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

// ─── SecurityController ───────────────────────────────────────────────────────
// Public endpoints that expose machine-readable security and evidence model
// metadata. No authentication required — these are intended for third-party
// verification tools, legal due diligence, and developer documentation.
//
// All routes under /security (mapped at module level to /public/security).

@Controller('public/security')
export class SecurityController {
  // GET /public/security/evidence-model
  //
  // Returns a stable, machine-readable description of the OfferAccept evidence
  // model. Allows verification tools to:
  //   - Confirm which hash algorithm is in use
  //   - Discover the public verification endpoint
  //   - Understand the canonical hash specification
  //   - Enumerate the expected signing event chain
  //
  // Response shape is versioned — add new fields without removing existing ones.
  // Breaking changes require a new version path (e.g. /v2/public/security/evidence-model).

  @Get('evidence-model')
  @HttpCode(HttpStatus.OK)
  getEvidenceModel() {
    return {
      version: '1.0',
      lastUpdated: '2026-04-12',
      product: 'OfferAccept',
      hashAlgorithm: 'SHA-256',
      hashEncoding: 'hex-lowercase',
      verificationEndpoints: {
        public: 'GET /api/v1/certificates/:id/verify',
        authenticated: 'GET /api/v1/certificates/:id/export',
      },
      canonicalHashSpec: {
        description:
          'Certificate hash is computed by deep-sorting all keys alphabetically (recursive), ' +
          'serializing with JSON.stringify (no whitespace), and computing SHA-256 of the ' +
          'resulting UTF-8 string. null values are included; arrays retain original order.',
        implementation: 'deepSortKeys + JSON.stringify + crypto.createHash("sha256")',
        inputFields: [
          'certificateId',
          'issuedAt',
          'issuer',
          'issuerVersion',
          'offer',
          'sender',
          'recipient',
          'documents',
          'acceptance',
        ],
      },
      canonicalHashFiveField: {
        description:
          'Lightweight fingerprint: SHA-256 of deepSortKeys({acceptedAt, dealId, ipAddress, ' +
          'recipientEmail, userAgent}) serialized with JSON.stringify.',
        storedAs: 'canonicalHash on AcceptanceCertificate',
        purpose: 'Allows third-party verification without accessing the full certificate payload',
      },
      eventChainDefinition: {
        description:
          'Every signing action is recorded in an ordered SigningEvent chain. ' +
          'CertificateService.verify() validates that the chain is present and ordered correctly.',
        requiredSequence: [
          'SESSION_STARTED',
          'OTP_ISSUED',
          'OTP_VERIFIED',
          'OFFER_ACCEPTED',
        ],
        anomalyConditions: [
          'OFFER_ACCEPTED without preceding OTP_VERIFIED',
          'Out-of-order timestamps in the event chain',
        ],
      },
      immutableTables: [
        'acceptance_records',
        'offer_snapshots',
        'offer_snapshot_documents',
        'signing_events',
      ],
      legalDocuments: {
        evidenceModelWhitepaper: '/security/evidence-model',
        acceptanceStatementSpec: '/legal/acceptance-statement',
        otpVerificationSpec: '/legal/otp-verification',
        termsOfService: '/legal/terms',
        gdprStatement: '/legal/gdpr',
      },
    };
  }
}
