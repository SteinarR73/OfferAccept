import * as crypto from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { OrgRepository } from './org.repository';
import { EmailPort, EMAIL_PORT } from '../../common/email/email.port';
import {
  AlreadyOrgMemberError,
  InviteNotFoundError,
  InviteExpiredError,
  InsufficientOrgRoleError,
  OrgNotFoundError,
  NotOrgMemberError,
} from '../../common/errors/domain.errors';

// ─── InviteService ─────────────────────────────────────────────────────────────
// Handles invite issuance, acceptance, and revocation.
//
// Token security model:
//   rawToken  = crypto.randomBytes(32).toString('base64url')  [256 bits of entropy]
//   tokenHash = SHA-256(rawToken) — stored; raw token NEVER stored
//
// Invite TTL: 7 days.
//
// Invitation rules:
//   - ADMIN can only invite MEMBER (cannot elevate to ADMIN/OWNER)
//   - OWNER can invite any role including ADMIN
//   - Inviting an already-pending address: old invite is revoked, new one issued
//   - Inviting a user already in the org: throws AlreadyOrgMemberError
//   - Accept: atomically creates Membership + marks invite acceptedAt
//
// actorRole and orgName are resolved internally to keep the controller thin.

const INVITE_TTL_DAYS = 7;

@Injectable()
export class InviteService {
  private readonly webBaseUrl: string;

  constructor(
    private readonly repo: OrgRepository,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    private readonly config: ConfigService,
  ) {
    this.webBaseUrl = this.config.getOrThrow<string>('WEB_BASE_URL');
  }

  // Issue an invite. actorRole is resolved from the DB to avoid trusting caller-supplied values.
  async invite(params: {
    orgId: string;
    email: string;
    role: OrgRole;
    invitedById: string;
  }): Promise<{ inviteId: string }> {
    // Resolve org and actor's role from DB
    const [org, actorMembership] = await Promise.all([
      this.repo.findById(params.orgId),
      this.repo.findMembership(params.invitedById, params.orgId),
    ]);

    if (!org) throw new OrgNotFoundError();
    if (!actorMembership) throw new NotOrgMemberError();

    // Role gate: ADMIN can only invite MEMBER
    if (actorMembership.role === 'ADMIN' && params.role !== 'MEMBER') {
      throw new InsufficientOrgRoleError('OWNER');
    }

    // If the invitee already has an account, check they're not already a member
    const existingUserId = await this.repo.findUserIdByEmail(params.email);
    if (existingUserId) {
      const existing = await this.repo.findMembership(existingUserId, params.orgId);
      if (existing) throw new AlreadyOrgMemberError();
    }

    // Revoke any prior pending invite to this email for this org
    await this.repo.revokePendingInvites(params.email, params.orgId);

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.repo.createInvite({
      organizationId: params.orgId,
      email: params.email,
      role: params.role,
      tokenHash,
      expiresAt,
      invitedById: params.invitedById,
    });

    const inviteUrl = `${this.webBaseUrl}/invites/accept?token=${rawToken}`;

    await this.emailPort.sendOrgInvite({
      to: params.email,
      orgName: org.name,
      role: params.role,
      inviteUrl,
      expiresAt,
    });

    return { inviteId: invite.id };
  }

  // Accept an invite by presenting the raw token.
  // Must be called with the authenticated userId of the accepting user.
  async accept(rawToken: string, userId: string): Promise<{ orgId: string; role: OrgRole }> {
    const tokenHash = sha256(rawToken);
    const invite = await this.repo.findInviteByHash(tokenHash);

    if (!invite || invite.acceptedAt || invite.revokedAt) {
      throw new InviteNotFoundError();
    }

    if (invite.expiresAt <= new Date()) {
      throw new InviteExpiredError();
    }

    // Prevent duplicate membership
    const existing = await this.repo.findMembership(userId, invite.organizationId);
    if (existing) throw new AlreadyOrgMemberError();

    await this.repo.acceptInviteAtomic(invite.id, userId, invite.organizationId, invite.role);

    return { orgId: invite.organizationId, role: invite.role };
  }

  async revokeInvite(inviteId: string, orgId: string): Promise<void> {
    const row = await this.repo.findInviteById(inviteId);
    if (!row || row.organizationId !== orgId) throw new InviteNotFoundError();
    await this.repo.revokeInvite(inviteId);
  }

  async listActiveInvites(orgId: string) {
    return this.repo.listActiveInvites(orgId);
  }
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
