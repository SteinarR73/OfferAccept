import { Module } from '@nestjs/common';
import { SigningEventService } from './services/signing-event.service';

// ─── SigningEventsModule ───────────────────────────────────────────────────────
// Extracted from SigningModule so that CertificatesModule can import
// SigningEventService without creating a circular dependency.
//
// Dependency graph with this module:
//   SigningModule       → imports SigningEventsModule, CertificatesModule
//   CertificatesModule  → imports SigningEventsModule
//   SigningEventsModule → no module dependencies (only PRISMA token)

@Module({
  providers: [SigningEventService],
  exports: [SigningEventService],
})
export class SigningEventsModule {}
