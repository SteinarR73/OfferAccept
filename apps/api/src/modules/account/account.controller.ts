import { Controller, Get, Post, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { extractClientIp } from '../../common/proxy/trusted-proxy.util';
import { AccountService } from './account.service';

// ─── AccountController ─────────────────────────────────────────────────────────
// GDPR-mandated data portability and erasure endpoints.
//
// Both endpoints require a valid JWT — only authenticated users can request
// their own data. Cross-user access is not possible by design.
//
// GET  /account/export           — GDPR Art. 20 data portability export
// POST /account/erasure-request  — GDPR Art. 17 right to erasure

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly rateLimiter: RateLimitService,
  ) {}

  // Returns a JSON archive of all personal data held for the authenticated user.
  //
  // Rate limited to 5 exports per hour per user to prevent bulk harvesting.
  // Audit log entry emitted by AccountService.
  @Get('export')
  async export(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const ip = extractClientIp(req);
    await this.rateLimiter.check('data_export', `${user.sub}:${ip}`);
    return this.account.exportData(user.sub, user.orgId);
  }

  // Records a GDPR Art. 17 right-to-erasure request for the authenticated user.
  //
  // Rate limited to 2 requests per 24 hours to prevent abuse.
  // Returns 202 Accepted — the request is asynchronous; operators process it
  // within the SLA defined in the privacy policy.
  //
  // CONSTRAINT: Acceptance records, certificates, and signing event chains
  // are immutable and cannot be deleted. See DPA Clause 9.
  @Post('erasure-request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestErasure(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    const ip = extractClientIp(req);
    await this.rateLimiter.check('erasure_request', `${user.sub}:${ip}`);

    const result = await this.account.requestErasure(user.sub);

    return {
      accepted:  true,
      requestId: result.requestId,
      message:
        'Your erasure request has been recorded. We will process it within 30 days ' +
        'in accordance with GDPR Article 17. Note that acceptance certificates and ' +
        'associated evidence records are immutable and cannot be deleted — see our ' +
        'Data Processing Agreement for details.',
    };
  }
}
