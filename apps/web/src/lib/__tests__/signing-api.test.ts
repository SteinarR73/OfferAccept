import { signingApi, ApiError } from '../signing-api';

describe('signingApi', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockFetchSuccess = (body: any) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    });
  };

  const mockFetchError = (status: number, body: any) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => body,
    });
  };

  describe('getContext', () => {
    it('returns context on success', async () => {
      const mockContext = { offerTitle: 'Test Offer' };
      mockFetchSuccess(mockContext);

      const result = await signingApi.getContext('token-123');
      expect(result).toEqual(mockContext);
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/signing/token-123', expect.any(Object));
    });

    it('throws ApiError on failure', async () => {
      mockFetchError(404, { code: 'NOT_FOUND', message: 'Token invalid' });

      await expect(signingApi.getContext('token-123')).rejects.toEqual({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Token invalid',
      });
    });
  });

  describe('requestOtp', () => {
    it('requests OTP with POST', async () => {
      const mockOtp = { challengeId: 'challenge-1' };
      mockFetchSuccess(mockOtp);

      const result = await signingApi.requestOtp('token-123');
      expect(result).toEqual(mockOtp);
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/signing/token-123/otp', expect.objectContaining({ method: 'POST' }));
    });
  });

  describe('verifyOtp', () => {
    it('verifies OTP with correct payload', async () => {
      const mockVerify = { verified: true };
      mockFetchSuccess(mockVerify);

      const result = await signingApi.verifyOtp('token-123', 'challenge-1', '123456');
      expect(result).toEqual(mockVerify);
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/signing/token-123/otp/verify', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }),
      }));
    });
  });

  describe('accept', () => {
    it('accepts document', async () => {
      const mockAccept = { acceptanceRecordId: 'record-1' };
      mockFetchSuccess(mockAccept);

      const result = await signingApi.accept('token-123', 'challenge-1', 'no-NO', 'Europe/Oslo');
      expect(result).toEqual(mockAccept);
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/signing/token-123/accept', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ challengeId: 'challenge-1', locale: 'no-NO', timezone: 'Europe/Oslo' }),
      }));
    });
  });

  describe('decline', () => {
    it('declines document with challengeId', async () => {
      mockFetchSuccess({ declined: true });
      await signingApi.decline('token-123', 'challenge-1');
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/signing/token-123/decline', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ challengeId: 'challenge-1' }),
      }));
    });

    it('declines document without challengeId', async () => {
      mockFetchSuccess({ declined: true });
      await signingApi.decline('token-123');
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/signing/token-123/decline', expect.objectContaining({
        method: 'POST',
        body: undefined,
      }));
    });
  });

  describe('recordDocumentView', () => {
    it('records view without throwing error on failure', async () => {
      mockFetchError(500, {}); // Simulate failure
      
      const result = await signingApi.recordDocumentView('token-123', 'doc-1');
      expect(result).toBeUndefined(); // Should catch error and return undefined
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/signing/token-123/documents/doc-1/view', expect.objectContaining({
        method: 'POST',
      }));
    });
  });
});
