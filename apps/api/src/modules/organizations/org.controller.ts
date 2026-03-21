import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, IsNotEmpty, IsIn, MaxLength } from 'class-validator';
import { Request } from 'express';
import { OrgService } from './org.service';
import { MembershipService } from './membership.service';
import { InviteService } from './invite.service';
import { OrgRoleGuard, RequireOrgRole } from './guards/org-role.guard';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { extractClientIp } from '../../common/proxy/trusted-proxy.util';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsIn(['ADMIN', 'MEMBER'])
  role!: 'ADMIN' | 'MEMBER';
}

class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

class TransferOwnershipDto {
  @IsString()
  @IsNotEmpty()
  toUserId!: string;
}

// ─── OrgController ────────────────────────────────────────────────────────────
// Routes under /api/v1/org
//
// All routes except POST /org/invite/accept require JWT authentication.
// Role enforcement is done via @RequireOrgRole + OrgRoleGuard.
//
// Route notes:
//   POST /org/invite/accept  — unauthenticated, token in body
//   DELETE /org/:id/member/:userId  — ADMIN or OWNER; service enforces sub-rules
//   PATCH /org/:id/transfer  — OWNER only

@Controller('org')
export class OrgController {
  constructor(
    private readonly orgService: OrgService,
    private readonly membershipService: MembershipService,
    private readonly inviteService: InviteService,
    private readonly rateLimiter: RateLimitService,
  ) {}

  // ── Create org ───────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  async createOrg(
    @Body() dto: CreateOrgDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.orgService.create(req.user.sub, { name: dto.name });
  }

  // ── List my orgs ─────────────────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  async listMyOrgs(@Req() req: Request & { user: JwtPayload }) {
    return this.orgService.listForUser(req.user.sub);
  }

  // ── Get org detail ───────────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @RequireOrgRole('MEMBER')
  async getOrgDetail(
    @Param('id') orgId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.orgService.getDetail(req.user.sub, orgId);
  }

  // ── List members ─────────────────────────────────────────────────────────────

  @Get(':id/members')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @RequireOrgRole('MEMBER')
  async listMembers(@Param('id') orgId: string) {
    return this.membershipService.listMembers(orgId);
  }

  // ── Invite member ────────────────────────────────────────────────────────────

  @Post(':id/invite')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @RequireOrgRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async inviteMember(
    @Param('id') orgId: string,
    @Body() dto: InviteMemberDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    // Rate-limit by actor userId — prevents a single admin from mass-inviting
    await this.rateLimiter.check('invite_attempt', req.user.sub);
    await this.inviteService.invite({
      orgId,
      email: dto.email,
      role: dto.role,
      invitedById: req.user.sub,
    });
  }

  // ── Accept invite (unauthenticated) ──────────────────────────────────────────

  @Post('invite/accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    // Rate-limit by IP — prevents token enumeration / accept-spray attacks
    await this.rateLimiter.check('invite_accept_attempt', extractClientIp(req));
    // v1: accepting an invite requires the user to be logged in.
    // The invited user must already have an account (or sign up first).
    await this.inviteService.accept(dto.token, req.user.sub);
  }

  // ── Remove member ─────────────────────────────────────────────────────────────

  @Delete(':id/member/:userId')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @RequireOrgRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') orgId: string,
    @Param('userId') targetUserId: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    await this.membershipService.removeMember(req.user.sub, targetUserId, orgId);
  }

  // ── Transfer ownership ────────────────────────────────────────────────────────

  @Patch(':id/transfer')
  @UseGuards(JwtAuthGuard, OrgRoleGuard)
  @RequireOrgRole('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async transferOwnership(
    @Param('id') orgId: string,
    @Body() dto: TransferOwnershipDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    await this.membershipService.transferOwnership(req.user.sub, dto.toUserId, orgId);
  }
}
