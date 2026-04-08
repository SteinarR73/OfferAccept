import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { OrgRepository } from './org.repository';
import { MembershipService } from './membership.service';
import { InviteService } from './invite.service';
import { DpaService } from './dpa.service';
import { OrgRoleGuard } from './guards/org-role.guard';

// ─── OrganizationsModule ──────────────────────────────────────────────────────
// Bounded context: Identity / Tenancy
// Responsible for: organization CRUD, user membership, invitation flow, roles.
//
// DatabaseModule provides the 'PRISMA' token globally.
// EmailModule provides the 'EMAIL_PORT' token globally.
// AuthModule provides JwtService globally (needed by JwtAuthGuard used in routes).

@Module({
  controllers: [OrgController],
  providers: [
    OrgRepository,
    OrgService,
    MembershipService,
    InviteService,
    DpaService,
    OrgRoleGuard,
  ],
  exports: [MembershipService, OrgRepository],
})
export class OrganizationsModule {}
