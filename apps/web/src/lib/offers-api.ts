import { refreshAccessToken, markUnauthenticated } from './auth';
import type {
  LoginRequest,
  LoginResponse,
  CreateOfferRequest,
  CreateOfferResponse,
  UpdateOfferRequest,
  SetRecipientRequest,
  AddDocumentRequest,
  SendOfferResponse,
  RevokeOfferResponse,
  OfferItem,
} from '@offeraccept/types';

// ─── API client — authenticated sender endpoints ───────────────────────────────
// Authentication is handled entirely via HttpOnly cookies (accessToken).
// credentials: 'include' is required so the browser sends the cookies.
//
// Automatic token refresh:
//   On 401 the client silently calls POST /auth/refresh once.
//   If the refresh succeeds (new accessToken cookie set), the original request
//   is retried. If the refresh also fails, markUnauthenticated() is called and
//   an ApiError(401) is thrown so the caller can redirect to /login.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Internal: single fetch attempt, no retry logic.
async function fetchOnce<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include', // sends HttpOnly cookies on every request
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code, body.message ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Public fetch wrapper with one transparent refresh-and-retry on 401.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await fetchOnce<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401) {
      // Access token expired — attempt silent refresh.
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry with the fresh accessToken cookie now in place.
        return fetchOnce<T>(path, init);
      }
      // Refresh token also expired or invalid — session is dead.
      markUnauthenticated();
    }
    throw err;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Login: credentials are sent as JSON, tokens arrive as HttpOnly cookies.
// The response body only contains { message } — no token in JSON.
// Call markAuthenticated() after this returns to set the session indicator.
export async function login(data: LoginRequest): Promise<LoginResponse> {
  return fetchOnce<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Returns the current user's identity and org context from the JWT claims.
export async function getMe(): Promise<{ userId: string; orgId: string; orgRole: string; role: string }> {
  return request('/auth/me');
}

// ─── Organization ──────────────────────────────────────────────────────────────

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
}

export async function getOrg(): Promise<OrgInfo> {
  return request<OrgInfo>('/organizations/me');
}

// ─── Billing ───────────────────────────────────────────────────────────────────

export type SubscriptionPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export interface BillingSubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  monthlyOfferCount: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastUsageReset: string | null;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, number | null> = {
  FREE: 3,
  STARTER: 25,
  PROFESSIONAL: 100,
  ENTERPRISE: null,
};

export async function getBillingSubscription(): Promise<BillingSubscription> {
  return request<BillingSubscription>('/billing/subscription');
}

// ─── Offers ───────────────────────────────────────────────────────────────────

export async function listOffers(page = 1, pageSize = 20) {
  return request<{ data: OfferItem[]; total: number; page: number; pageSize: number }>(
    `/offers?page=${page}&pageSize=${pageSize}`,
  );
}

export async function getOffer(id: string): Promise<OfferItem> {
  return request<OfferItem>(`/offers/${id}`);
}

export async function createOffer(data: CreateOfferRequest): Promise<CreateOfferResponse> {
  return request<CreateOfferResponse>('/offers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOffer(id: string, data: UpdateOfferRequest): Promise<OfferItem> {
  return request<OfferItem>(`/offers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function setRecipient(id: string, data: SetRecipientRequest) {
  return request(`/offers/${id}/recipient`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocumentUploadUrl {
  uploadUrl: string;
  storageKey: string;
}

// Get a presigned S3 URL for direct browser upload.
export async function getDocumentUploadUrl(
  offerId: string,
  filename: string,
  mimeType: string,
): Promise<DocumentUploadUrl> {
  return request<DocumentUploadUrl>(`/offers/${offerId}/documents/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ filename, mimeType }),
  });
}

// Upload directly to S3 using the presigned URL.
// Content-Type must match what was requested; do NOT include credentials here.
export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!res.ok) throw new Error(`S3 upload failed: HTTP ${res.status}`);
}

export async function addDocument(id: string, data: AddDocumentRequest): Promise<{ id: string }> {
  return request<{ id: string }>(`/offers/${id}/documents`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeDocument(offerId: string, docId: string): Promise<void> {
  return request<void>(`/offers/${offerId}/documents/${docId}`, { method: 'DELETE' });
}

export async function sendOffer(id: string): Promise<SendOfferResponse> {
  return request<SendOfferResponse>(`/offers/${id}/send`, { method: 'POST' });
}

export async function revokeOffer(id: string): Promise<RevokeOfferResponse> {
  return request<RevokeOfferResponse>(`/offers/${id}/revoke`, { method: 'POST' });
}
