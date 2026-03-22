// @offeraccept/types
// Shared API contracts between the web app and the API.
// Plain TypeScript types — no runtime dependencies.
//
// Domain types (Prisma models) are exported from @offeraccept/database.
// This package contains API request/response shapes.

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

// Cookie-based auth: tokens are delivered as HttpOnly cookies by the server.
// The response body only confirms success — no token in JSON.
export interface LoginResponse {
  message: string;
}

// ─── Offers (authenticated sender) ───────────────────────────────────────────

export interface CreateOfferRequest {
  title: string;
  message?: string;
  expiresAt?: string; // ISO 8601
  recipient?: {       // optional at create time; can be set later via PUT /recipient
    email: string;
    name: string;
  };
}

export interface CreateOfferResponse {
  offerId: string;
  status: 'DRAFT';
}

export interface UpdateOfferRequest {
  title?: string;
  message?: string;
  expiresAt?: string; // ISO 8601
}

export interface SetRecipientRequest {
  email: string;
  name: string;
}

export interface AddDocumentRequest {
  filename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string; // SHA-256 hex digest of file content
}

export interface OfferDocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string;
}

export interface OfferRecipientItem {
  email: string;
  name: string;
  status: string;
}

export type OfferStatusValue = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

export interface OfferItem {
  id: string;
  title: string;
  message: string | null;
  status: OfferStatusValue;
  expiresAt: string | null;
  recipient: OfferRecipientItem | null;
  documents: OfferDocumentItem[];
  createdAt: string;
  updatedAt: string;
}

// Trigger the send: freezes the snapshot, generates token, sends email
export interface SendOfferResponse {
  offerId: string;
  status: 'SENT';
  snapshotId: string;
  sentAt: string;
}

export interface RevokeOfferResponse {
  revoked: true;
}

// ─── Signing (public / unauthenticated) ───────────────────────────────────────
// All signing endpoints authenticate via the token in the URL.
// No cookie, no session, no JWT.

// GET /signing/:token — validate token, return snapshot context, create session
export interface SigningContextResponse {
  sessionId: string;
  // Content from the frozen snapshot — never from mutable Offer fields
  offerTitle: string;
  offerMessage: string | null;
  senderName: string;
  recipientName: string;
  expiresAt: string | null;
  documents: Array<{
    // Never expose storageKey or sha256Hash to the client
    documentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

// POST /signing/:token/otp/request — issue or re-issue an OTP challenge
export interface RequestOtpResponse {
  challengeId: string;
  // Masked email shown to user: "j***@example.com"
  deliveryAddressMasked: string;
  expiresAt: string;
}

// POST /signing/:token/otp/verify — submit the OTP code
export interface VerifyOtpRequest {
  challengeId: string;
  code: string; // 6 digits, sent as string to preserve leading zeros
}

export interface VerifyOtpResponse {
  verified: boolean;
  // Returned on success — used in the subsequent accept call
  verifiedAt: string;
}

// POST /signing/:token/accept — final acceptance (requires prior OTP verification)
export interface AcceptOfferRequest {
  challengeId: string;         // must be the verified OTP challenge for this session
  locale?: string;             // browser locale (Intl.DateTimeFormat locale)
  timezone?: string;           // Intl.DateTimeFormat().resolvedOptions().timeZone
  // acceptanceStatement is NOT sent by the client — it is generated server-side
  // and stored verbatim, so the client cannot alter what was "agreed to"
}

export interface AcceptOfferResponse {
  acceptanceRecordId: string;
  acceptedAt: string;
  // Certificate may not be ready immediately (generated async)
  certificate: {
    id: string;
    issuedAt: string;
  } | null;
}

// POST /signing/:token/decline
export interface DeclineOfferResponse {
  declinedAt: string;
}

// ─── Common ────────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  // Machine-readable error code for client-side handling
  code?: string;
}
