// Thin client for the public signing API.
// All functions throw on non-2xx responses with a typed ApiError.

export interface OfferContext {
  sessionId: string;
  offerTitle: string;
  offerMessage: string | null;
  senderName: string;
  recipientName: string;
  expiresAt: string | null;
  documents: Array<{ documentId: string; filename: string; mimeType: string; sizeBytes: number }>;
  acceptanceStatement: string;
}

export interface OtpResult {
  challengeId: string;
  deliveryAddressMasked: string;
  expiresAt: string;
}

export interface VerifyResult {
  verified: boolean;
  verifiedAt: string;
}

export interface AcceptResult {
  acceptanceRecordId: string;
  acceptedAt: string;
  certificate: null;
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

const BASE = '/api/v1/signing';

async function request<T>(
  path: string,
  opts?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw { statusCode: res.status, ...body } as ApiError;
  }

  return body as T;
}

export const signingApi = {
  getContext: (token: string) =>
    request<OfferContext>(`${BASE}/${token}`),

  requestOtp: (token: string) =>
    request<OtpResult>(`${BASE}/${token}/otp`, { method: 'POST' }),

  verifyOtp: (token: string, challengeId: string, code: string) =>
    request<VerifyResult>(`${BASE}/${token}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    }),

  accept: (token: string, challengeId: string, locale?: string, timezone?: string) =>
    request<AcceptResult>(`${BASE}/${token}/accept`, {
      method: 'POST',
      body: JSON.stringify({ challengeId, locale, timezone }),
    }),

  decline: (token: string) =>
    request<{ declined: boolean }>(`${BASE}/${token}/decline`, { method: 'POST' }),

  recordDocumentView: (token: string, documentId: string) =>
    request<{ recorded: boolean }>(`${BASE}/${token}/documents/${documentId}/view`, {
      method: 'POST',
    }).catch(() => undefined), // best-effort audit — never block the user
};
