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

// Default timeout for all API requests. Mutations (sendOffer, revokeOffer, etc.)
// must not hang indefinitely — 30 s is generous while still providing a hard bound.
const FETCH_TIMEOUT_MS = 30_000;

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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

export interface SignupRequest {
  orgName: string;
  name: string;
  email: string;
  password: string;
  // Version of the Terms of Service the user accepted at signup (e.g. "1.1").
  // Required — signup is gated on explicit ToS acceptance.
  termsVersion: string;
}

export async function signup(data: SignupRequest): Promise<{ message: string }> {
  return fetchOnce<{ message: string }>('/auth/signup', {
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

// Returns the first org the current user belongs to.
// Backend: GET /org  (lists caller's orgs — returns array; take the first entry).
export async function getOrg(): Promise<OrgInfo> {
  const orgs = await request<OrgInfo[]>('/org');
  if (!orgs.length) throw new ApiError(404, 'NO_ORG', 'No organisation found for this user.');
  return orgs[0];
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
  const res = await request<OrgMember[] | { data: OrgMember[] }>(`/org/${orgId}/members`);
  return Array.isArray(res) ? res : (res as { data: OrgMember[] }).data ?? [];
}

export async function inviteMember(orgId: string, email: string, role: string): Promise<void> {
  return request<void>(`/org/${orgId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  return request<void>(`/org/${orgId}/member/${userId}`, { method: 'DELETE' });
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

// ─── DPA ──────────────────────────────────────────────────────────────────────

export interface DpaStatus {
  accepted: boolean;
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  agreementId: string | null;
}

export async function getDpaStatus(orgId: string): Promise<DpaStatus> {
  return request(`/org/${orgId}/dpa`);
}

export async function acceptDpa(orgId: string): Promise<DpaStatus> {
  return request(`/org/${orgId}/dpa`, { method: 'POST' });
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

// Legal and trust-layer versions attached to every verify/export response.
// These are returned outside the hashed payload so they don't affect existing hashes.
export interface CertificateMetadata {
  // Terms version captured when the deal was created. Null for pre-migration offers.
  termsVersionAtCreation: string | null;
  // Acceptance statement version captured at acceptance time. Null for legacy records.
  acceptanceStatementVersion: string | null;
  // Static identifier for the hash algorithm and event chain verification spec.
  evidenceModelVersion: string;
}

export interface CertificateVerification {
  certificateId: string;
  // Strict: true only when all integrity checks pass AND no advisory anomalies.
  valid: boolean;
  // True when all cryptographic checks pass, even if advisory anomalies exist
  // (e.g. LEGACY_CERTIFICATE). Use to show "integrity OK but limited guarantees"
  // rather than the same red "Verification failed" as a tampered certificate.
  integrityChecksPass: boolean;
  certificateHashMatch: boolean;
  canonicalHashMatch?: boolean;
  statementHashMatch?: boolean;
  reconstructedHash: string;
  storedHash: string;
  snapshotIntegrity: boolean;
  eventChainIntegrity: boolean;
  integrityAnomalies: string[];
  advisoryAnomalies: string[];
  anomaliesDetected: string[];
  // Legal document versions governing this certificate.
  metadata?: CertificateMetadata;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  dealsSent: number;
  dealsAccepted: number;
  dealsPending: number;
  dealsDeclined: number;
  dealsExpired: number;
  dealsRevoked: number;
  avgAcceptanceHours: number | null;
  medianAcceptanceHours: number | null;
  acceptedAfterReminderCount: number;
  acceptedWithReminderPct: number | null;
}

export async function getAnalytics(): Promise<AnalyticsOverview> {
  return request<AnalyticsOverview>('/analytics/overview');
}

export type DealEventType =
  | 'deal.created'
  | 'deal.sent'
  | 'deal.opened'
  | 'otp.verified'
  | 'deal.accepted'
  | 'certificate.issued'
  | 'deal.reminder_sent'
  | 'deal.revoked'
  | 'deal.expired'
  | 'deal.declined';

export interface RecentDealEvent {
  id: string;
  dealId: string;
  dealTitle: string;
  eventType: DealEventType;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO 8601
}

export async function getRecentEvents(limit = 20): Promise<RecentDealEvent[]> {
  const res = await request<{ events: RecentDealEvent[] }>(`/analytics/events?limit=${limit}`);
  return res.events;
}

export interface DealTimelineEvent {
  event: string;
  label: string;
  timestamp: string | null;
  pending: boolean;
}

export async function getDealTimeline(offerId: string): Promise<DealTimelineEvent[]> {
  return request<DealTimelineEvent[]>(`/offers/${offerId}/timeline`);
}

// Public endpoint — no auth required
export async function verifyCertificate(id: string): Promise<CertificateVerification> {
  const url = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/certificates/${id}/verify`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) throw Object.assign(new Error('Not found'), { status: 404 });
  if (!res.ok) throw new Error(`Verification failed: HTTP ${res.status}`);
  return res.json() as Promise<CertificateVerification>;
}

// ─── Acceptance Insights ──────────────────────────────────────────────────────

export interface AcceptanceInsightDeal {
  dealId: string;
  dealTitle: string;
  hoursSinceLastEvent?: number;
  hoursSinceSent?: number;
}

export interface AcceptanceInsights {
  /** Median hours from deal_sent → deal_accepted. Null if < 10 data points. */
  medianAcceptanceHours: number | null;
  /** % of accepted deals where a reminder was sent before acceptance. */
  reminderRate: number | null;
  /** Deals opened but not accepted; idle > 24 h. */
  openedNotAccepted: AcceptanceInsightDeal[];
  /** Deals sent but never opened; age > 24 h. */
  unopened: AcceptanceInsightDeal[];
  /** Deals opened with no activity > 48 h; not in a terminal state. */
  stalled: AcceptanceInsightDeal[];
}

export async function getAcceptanceInsights(): Promise<AcceptanceInsights> {
  return request<AcceptanceInsights>('/analytics/insights');
}

// ─── Deal Status Intelligence ──────────────────────────────────────────────────

export type DealComputedStatus =
  | 'CREATED'
  | 'SENT'
  | 'OPENED'
  | 'OTP_STARTED'
  | 'OTP_VERIFIED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'REVOKED';

export type RecipientActivity =
  | 'never_opened'
  | 'opened'
  | 'viewed_document'
  | 'otp_started'
  | 'otp_verified'
  | 'accepted';

export type RecommendedAction =
  | 'SEND_REMINDER'
  | 'FOLLOW_UP'
  | 'CHECK_WITH_RECIPIENT'
  | 'NONE';

export interface DealStatusResult {
  status: DealComputedStatus;
  lastEvent: DealEventType | null;
  lastActivityAt: string | null;
  recipientActivity: RecipientActivity;
  recommendedAction: RecommendedAction;
  insights: string[];
}

export async function getDealStatus(offerId: string): Promise<DealStatusResult> {
  return request<DealStatusResult>(`/offers/${offerId}/status`);
}

// ─── Password reset (unauthenticated) ─────────────────────────────────────────

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return fetchOnce<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return fetchOnce<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}
