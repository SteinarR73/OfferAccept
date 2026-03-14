import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { InternalSupportGuard } from '../../common/auth/internal-support.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/auth/jwt-auth.guard';
import { SupportService } from './support.service';

// ─── SupportController ────────────────────────────────────────────────────────
// Internal support endpoints for investigating signing flows and disputes.
// ALL routes require role=INTERNAL_SUPPORT — enforced by InternalSupportGuard.
//
// These endpoints intentionally do NOT filter by orgId — support staff may
// inspect offers from any organization.
//
// Read-only endpoints:
//   GET /support/offers?offerId=&recipientEmail=   — search
//   GET /support/offers/:offerId/case              — full case view
//   GET /support/offers/:offerId/timeline          — dispute timeline
//   GET /support/sessions/:sessionId/events        — raw signing events
//
// Safe action endpoints (POST):
//   POST /support/offers/:offerId/revoke            — revoke SENT offer
//   POST /support/offers/:offerId/resend-link       — resend offer link email
//   POST /support/sessions/:sessionId/resend-otp    — resend OTP (AWAITING_OTP only)

@Controller('support')
@UseGuards(InternalSupportGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // GET /support/offers?offerId=xxx OR ?recipientEmail=xxx@example.com
  @Get('offers')
  async searchOffers(
    @Query('offerId') offerId?: string,
    @Query('recipientEmail') recipientEmail?: string,
  ) {
    return this.supportService.searchOffers({ offerId, recipientEmail });
  }

  // GET /support/offers/:offerId/case
  // Returns the full case: offer, snapshot, recipient, delivery, sessions, acceptance, certificate.
  @Get('offers/:offerId/case')
  async getCase(@Param('offerId') offerId: string) {
    return this.supportService.getCase(offerId);
  }

  // GET /support/offers/:offerId/timeline
  // Human-readable chronological event sequence for dispute review.
  @Get('offers/:offerId/timeline')
  async getTimeline(@Param('offerId') offerId: string) {
    const entries = await this.supportService.buildTimeline(offerId);
    return { offerId, entries };
  }

  // GET /support/sessions/:sessionId/events
  // Raw signing events in sequence order — for deep inspection.
  @Get('sessions/:sessionId/events')
  async getSessionEvents(@Param('sessionId') sessionId: string) {
    const events = await this.supportService.getSessionEvents(sessionId);
    return { sessionId, events };
  }

  // ── Safe actions ─────────────────────────────────────────────────────────────

  // POST /support/offers/:offerId/revoke
  // Revoke a SENT offer. Domain rules in SendOfferService prevent revoking terminal offers.
  // Does NOT mutate OfferSnapshot, AcceptanceRecord, SigningEvents, or certificates.
  @Post('offers/:offerId/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeOffer(@Param('offerId') offerId: string) {
    await this.supportService.revokeOffer(offerId);
    return { revoked: true, offerId };
  }

  // POST /support/offers/:offerId/resend-link
  // Resend offer link email. Generates a new signing token (old link superseded).
  // Does NOT mutate OfferSnapshot.
  @Post('offers/:offerId/resend-link')
  @HttpCode(HttpStatus.OK)
  async resendOfferLink(
    @Param('offerId') offerId: string,
    @CurrentUser() agent: JwtPayload,
  ) {
    const result = await this.supportService.resendOfferLink(offerId, agent.sub);
    return { offerId, deliveryAttemptId: result.deliveryAttemptId, deliveryOutcome: result.deliveryOutcome };
  }

  // POST /support/sessions/:sessionId/resend-otp
  // Re-issue OTP to an active signing session.
  // Only allowed when session is AWAITING_OTP. Does NOT mutate any evidence.
  // Returns the masked delivery address and expiry — never the raw code.
  @Post('sessions/:sessionId/resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendSessionOtp(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const ctx = {
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] ?? '',
    };
    const result = await this.supportService.resendSessionOtp(sessionId, ctx);
    return { sessionId, ...result };
  }
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
