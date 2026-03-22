import { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from '../../src/modules/enterprise/api-key.guard';
import { ApiKeyService } from '../../src/modules/enterprise/api-key.service';
import { ApiKeyInvalidError } from '../../src/common/errors/domain.errors';

// ─── ApiKeyGuard unit tests ────────────────────────────────────────────────────
// Pure unit tests — no NestJS DI container.
// Mocks ApiKeyService and the ExecutionContext directly.

function makeContext(headers: Record<string, string | string[] | undefined> = {}): ExecutionContext {
  const req: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeyService: jest.Mocked<Pick<ApiKeyService, 'validate'>>;

  beforeEach(() => {
    apiKeyService = {
      validate: jest.fn(),
    };
    guard = new ApiKeyGuard(apiKeyService as unknown as ApiKeyService);
  });

  it('returns true and sets apiKeyOrgId on a valid key', async () => {
    apiKeyService.validate.mockResolvedValue({ orgId: 'org-1', keyId: 'key-1' });

    const ctx = makeContext({ 'x-api-key': 'oa_validkey' });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect((ctx.switchToHttp().getRequest() as { apiKeyOrgId: string }).apiKeyOrgId).toBe('org-1');
    expect(apiKeyService.validate).toHaveBeenCalledWith('oa_validkey');
  });

  it('throws ApiKeyInvalidError when X-Api-Key header is missing', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ApiKeyInvalidError);
    expect(apiKeyService.validate).not.toHaveBeenCalled();
  });

  it('throws ApiKeyInvalidError when X-Api-Key is an array (multi-value header)', async () => {
    const ctx = makeContext({ 'x-api-key': ['key1', 'key2'] });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ApiKeyInvalidError);
    expect(apiKeyService.validate).not.toHaveBeenCalled();
  });

  it('propagates ApiKeyInvalidError from ApiKeyService (revoked key)', async () => {
    apiKeyService.validate.mockRejectedValue(new ApiKeyInvalidError());
    const ctx = makeContext({ 'x-api-key': 'oa_revokedkey' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ApiKeyInvalidError);
  });

  it('propagates ApiKeyInvalidError from ApiKeyService (expired key)', async () => {
    apiKeyService.validate.mockRejectedValue(new ApiKeyInvalidError());
    const ctx = makeContext({ 'x-api-key': 'oa_expiredkey' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ApiKeyInvalidError);
  });
});
