import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import {
  PackagesService,
  ActivatePackageSchema,
  ActivatePackageResult,
  UserPackageRow,
} from './packages.service';

// ─── PackagesController ────────────────────────────────────────────────────────
// Routes:
//   POST /packages     (JWT) — activate a package; writes UserPackage + AuditEvent
//                              in a single transaction; returns created IDs
//   GET  /packages     (JWT) — list all packages activated by the authenticated user
//
// All routes require a valid JWT (JwtAuthGuard).
// The authenticated user can only read and write their own package records.

@Controller('packages')
@UseGuards(JwtAuthGuard)
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  // ── POST /packages ────────────────────────────────────────────────────────
  // Activates a package for the authenticated user.
  //
  // Body:  { "packageType": "STARTER" }
  // 201:   { packageId, auditEventId, packageType, createdAt }
  // 400:   validation error (unknown packageType, missing field)

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async activatePackage(
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<ActivatePackageResult> {
    const result = ActivatePackageSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed.',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return this.packagesService.activate(user.sub, result.data);
  }

  // ── GET /packages ─────────────────────────────────────────────────────────
  // Returns all packages activated by the authenticated user, newest first.
  //
  // 200: UserPackageRow[]

  @Get()
  listPackages(@CurrentUser() user: JwtPayload): Promise<UserPackageRow[]> {
    return this.packagesService.listForUser(user.sub);
  }
}
