// @offeraccept/types
// Shared API contracts between the web app and the API.
// Plain TypeScript types — no runtime dependencies.
//
// Domain types (Prisma models) are exported from @offeraccept/database.
// This package contains API request/response shapes for the authenticated
// sender API. The public signing contract lives in apps/web/src/lib/signing-api.ts.

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
