import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { SigningFlowService } from './services/signing-flow.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AcceptOfferDto } from './dto/accept-offer.dto';
import { DeclineOfferDto } from './dto/decline-offer.dto';
import { extractClientIp } from '../../common/proxy/trusted-proxy.util';

// ─── SigningController ─────────────────────────────────────────────────────────
// Public (unauthenticated) signing flow endpoints.
// All routes use the recipient token as the credential — it is in the URL path.
//
// Rate limiting is applied per-endpoint here using RateLimitService.
// Domain logic and state machine enforcement live entirely in SigningFlowService.
// Controllers stay thin: parse → rate-limit → delegate → return.

@Controller('signing')
export class SigningController {
  constructor(
    private readonly flow: SigningFlowService,
    private readonly rateLimiter: RateLimitService,
  ) {}

  // GET /api/v1/signing/:token
  // Returns the frozen offer context. Safe to call without side effects.
  // Does NOT create a session. Does NOT send an OTP.
  @Get(':token')
  async getContext(@Param('token') token: string, @Req() req: Request) {
    this.rateLimiter.check('token_verification', extractClientIp(req));
    return this.flow.getOfferContext(token);
  }

  // POST /api/v1/signing/:token/otp
  // Explicit recipient intent to proceed to acceptance. Creates session + sends OTP.
  @Post(':token/otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Param('token') token: string, @Req() req: Request) {
    // Rate-limit by token hash (per-recipient) to prevent OTP spam
    this.rateLimiter.check('otp_issuance', token);
    // Also rate-limit by IP as a secondary defence
    this.rateLimiter.check('signing_global', extractClientIp(req));

    const result = await this.flow.requestOtp(token, context(req));
    // Never expose challengeId's expiry timing in error paths — only in success response
    return {
      challengeId: result.challengeId,
      deliveryAddressMasked: result.deliveryAddressMasked,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  // POST /api/v1/signing/:token/otp/verify
  // Submit the 6-digit code.
  @Post(':token/otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Param('token') token: string,
    @Body() body: VerifyOtpDto,
    @Req() req: Request,
  ) {
    this.rateLimiter.check('otp_verification', extractClientIp(req));

    const result = await this.flow.verifyOtp(token, body.challengeId, body.code, context(req));
    return {
      verified: result.verified,
      verifiedAt: result.verifiedAt.toISOString(),
    };
  }

  // POST /api/v1/signing/:token/accept
  // Final acceptance. Requires OTP_VERIFIED session and a verified challengeId.
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Param('token') token: string,
    @Body() body: AcceptOfferDto,
    @Req() req: Request,
  ) {
    this.rateLimiter.check('signing_global', extractClientIp(req));

    const result = await this.flow.accept(token, body.challengeId, {
      ...context(req),
      locale: body.locale,
      timezone: body.timezone,
    });

    return {
      acceptanceRecordId: result.acceptanceRecord.id,
      acceptedAt: result.acceptanceRecord.acceptedAt.toISOString(),
      certificateId: result.certificateId,
    };
  }

  // POST /api/v1/signing/:token/decline
  // Requires challengeId so the session is resolved from the challenge's bound
  // sessionId — not from a "latest resumable" lookup. The challenge may be in
  // any status (PENDING, VERIFIED, etc.) — it only needs to exist and belong to
  // this recipient to identify the correct session.
  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  async decline(
    @Param('token') token: string,
    @Body() body: DeclineOfferDto,
    @Req() req: Request,
  ) {
    this.rateLimiter.check('signing_global', extractClientIp(req));
    await this.flow.decline(token, body.challengeId, context(req));
    return { declined: true };
  }

  // POST /api/v1/signing/:token/documents/:documentId/view
  // Records that the recipient viewed a specific document (audit event).
  @Post(':token/documents/:documentId/view')
  @HttpCode(HttpStatus.OK)
  async recordDocumentView(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Req() req: Request,
  ) {
    // Not rate-limited tightly — document views are a low-risk operation
    this.rateLimiter.check('signing_global', extractClientIp(req));
    await this.flow.recordDocumentView(token, documentId, context(req));
    return { recorded: true };
  }
}

function context(req: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: extractClientIp(req),
    userAgent: req.headers['user-agent'] ?? '',
  };
}
