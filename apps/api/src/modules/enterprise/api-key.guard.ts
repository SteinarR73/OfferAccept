import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { ApiKeyInvalidError } from '../../common/errors/domain.errors';

// ─── ApiKeyGuard ───────────────────────────────────────────────────────────────
// Authentication guard for enterprise API key access.
//
// Reads the X-Api-Key header, validates it via ApiKeyService, and attaches the
// resolved orgId to request.apiKeyOrgId. This is then readable by controllers
// that use this guard (e.g. @CurrentApiKeyOrg() or req.apiKeyOrgId).
//
// Throws ApiKeyInvalidError (→ HTTP 401) for all authentication failures.
//
// Usage:
//   @UseGuards(ApiKeyGuard)
//   async myEndpoint(@Req() req: ApiKeyRequest) {
//     const orgId = req.apiKeyOrgId;
//   }

export interface ApiKeyRequest extends Request {
  apiKeyOrgId: string;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyRequest>();

    const rawKey = req.headers['x-api-key'];
    if (!rawKey || typeof rawKey !== 'string') {
      throw new ApiKeyInvalidError();
    }

    const { orgId } = await this.apiKeyService.validate(rawKey);
    req.apiKeyOrgId = orgId;

    return true;
  }
}
