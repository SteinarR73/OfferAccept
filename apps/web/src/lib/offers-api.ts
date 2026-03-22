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

export async function resendOffer(id: string): Promise<{ sentAt: string }> {
  return request<{ sentAt: string }>(`/offers/${id}/resend`, { method: 'POST' });
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

export interface DeliveryAttempt {
  id: string;
  attemptedAt: string;
  outcome: string; // 'DISPATCHING' | 'DELIVERED_TO_PROVIDER' | 'FAILED'
  recipientEmail: string;
}

export async function getDelivery(offerId: string): Promise<DeliveryAttempt[]> {
  const res = await request<DeliveryAttempt[] | { attempts: DeliveryAttempt[] } | { data: DeliveryAttempt[] }>(
    `/offers/${offerId}/delivery`,
  );
  // Gracefully handle both array and wrapped response shapes.
  if (Array.isArray(res)) return res;
  if ('attempts' in res) return (res as { attempts: DeliveryAttempt[] }).attempts ?? [];
  if ('data' in res) return (res as { data: DeliveryAttempt[] }).data ?? [];
  return [];
}

// ─── Billing (extended) ────────────────────────────────────────────────────────

export async function getBillingCheckout(plan: SubscriptionPlan): Promise<{ url: string }> {
  return request<{ url: string }>('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export async function getBillingPortal(): Promise<{ url: string }> {
  return request<{ url: string }>('/billing/portal');
}

// ─── Organization members ─────────────────────────────────────────────────────

export interface OrgMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const res = await request<OrgMember[] | { data: OrgMember[] }>(`/organizations/${orgId}/members`);
  return Array.isArray(res) ? res : (res as { data: OrgMember[] }).data ?? [];
}

export async function inviteMember(orgId: string, email: string, role: string): Promise<void> {
  return request<void>(`/organizations/${orgId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  return request<void>(`/organizations/${orgId}/member/${userId}`, { method: 'DELETE' });
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string; // raw key — shown only once, customer must store securely
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const res = await request<ApiKey[] | { data: ApiKey[] }>('/api-keys');
  return Array.isArray(res) ? res : (res as { data: ApiKey[] }).data ?? [];
}

export async function createApiKey(data: { name: string; expiresAt?: string }): Promise<ApiKeyCreated> {
  return request<ApiKeyCreated>('/api-keys', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteApiKey(id: string): Promise<void> {
  return request<void>(`/api-keys/${id}`, { method: 'DELETE' });
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}

export async function listWebhooks(): Promise<Webhook[]> {
  const res = await request<Webhook[] | { data: Webhook[] }>('/webhooks');
  return Array.isArray(res) ? res : (res as { data: Webhook[] }).data ?? [];
}

export async function createWebhook(data: { url: string; events: string[] }): Promise<Webhook> {
  return request<Webhook>('/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateWebhook(
  id: string,
  data: { url?: string; events?: string[]; enabled?: boolean },
): Promise<Webhook> {
  return request<Webhook>(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteWebhook(id: string): Promise<void> {
  return request<void>(`/webhooks/${id}`, { method: 'DELETE' });
}

// ─── Certificates ─────────────────────────────────────────────────────────────

export interface CertificateDetail {
  certificateId: string;
  certificateHash: string;
  issuedAt: string;
  offer: { title: string; message: string | null; expiresAt: string | null };
  recipient: { email: string; name: string };
  sender: { name: string; email: string };
}

export async function getCertificate(id: string): Promise<CertificateDetail> {
  return request<CertificateDetail>(`/certificates/${id}`);
}

export async function exportCertificate(id: string): Promise<{ certificateId: string; canonicalJson: string; certificateHash: string }> {
  return request(`/certificates/${id}/export`);
}
