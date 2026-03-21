import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsDateString } from 'class-validator';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OrgRoleGuard, RequireOrgRole } from '../organizations/guards/org-role.guard';
import { ApiKeyService } from './api-key.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

// ─── ApiKeysController ────────────────────────────────────────────────────────
// Routes under /api/v1/api-keys
//
// All routes require JWT authentication + ADMIN or OWNER role.
//
// POST /api-keys       — create key; raw key returned ONCE in response
// GET  /api-keys       — list active keys (prefix only; never keyHash or raw)
// DELETE /api-keys/:id — revoke key
//
// The raw key is returned only in the POST response. It is not recoverable
// after that call returns. Customers must store it securely.

@Controller('api-keys')
@UseGuards(JwtAuthGuard, OrgRoleGuard)
@RequireOrgRole('ADMIN')
export class ApiKeysController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CreateApiKeyResponse> {
    const result = await this.apiKeyService.generate({
      organizationId: user.orgId,
      name: dto.name,
      createdById: user.sub,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    return {
      id: result.id,
      name: dto.name,
      prefix: result.prefix,
      // Raw key is returned ONCE — the caller must store it securely.
      // It will not be returned again.
      key: result.key,
    };
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.apiKeyService.list(user.orgId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id') keyId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ revoked: boolean }> {
    await this.apiKeyService.revoke(keyId, user.orgId);
    return { revoked: true };
  }
}

// ── Response types ─────────────────────────────────────────────────────────────

interface CreateApiKeyResponse {
  id: string;
  name: string;
  prefix: string;
  key: string; // raw key — returned ONCE, never stored server-side
}
