import { authHeaders } from './auth';
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
} from '@offeracept/types';

// ─── API client — authenticated sender endpoints ───────────────────────────────
// All calls include the Authorization: Bearer header from localStorage.
// Throws ApiError on non-2xx responses.

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code, body.message ?? `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
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

export async function addDocument(id: string, data: AddDocumentRequest) {
  return request(`/offers/${id}/documents`, {
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
