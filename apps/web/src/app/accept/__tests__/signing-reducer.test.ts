// Unit tests for the signing flow state machine reducer.
//
// Tests cover the specific UX bugs fixed in this session:
//   1. OTP resend from otp_error was silently dropped (OTP_SENT guard too narrow)
//   2. Resend failure from the OTP screen had no recovery (OTP_SEND_FAILED had no
//      prevOtp handling, error was discarded)
//   3. OTP expiry was indistinguishable from a wrong-code error
//   4. Certificate ID was discarded after acceptance (AcceptResult type mismatch)

import { reducer } from '../[token]/signing-client';
import type { Phase, Action } from '../[token]/signing-client';
import type { OfferContext, OtpResult } from '@/lib/signing-api';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const CTX: OfferContext = {
  sessionId: 'sess-1',
  offerTitle: 'Test Deal',
  offerMessage: null,
  senderName: 'Acme Corp',
  recipientName: 'Jane Smith',
  expiresAt: null,
  documents: [],
  acceptanceStatement: 'I accept the terms.',
};

const OTP_A: OtpResult = {
  challengeId: 'challenge-A',
  deliveryAddressMasked: 'ja***@example.com',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
};

const OTP_B: OtpResult = {
  challengeId: 'challenge-B',
  deliveryAddressMasked: 'ja***@example.com',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
};

function act(state: Phase, action: Action): Phase {
  return reducer(state, action);
}

// ─── CONTINUE_TO_OTP ──────────────────────────────────────────────────────────

describe('CONTINUE_TO_OTP', () => {
  it('transitions offer_view → otp_requesting with no prevOtp', () => {
    const state: Phase = { name: 'offer_view', ctx: CTX };
    const next = act(state, { type: 'CONTINUE_TO_OTP' });
    expect(next.name).toBe('otp_requesting');
    if (next.name === 'otp_requesting') {
      expect(next.prevOtp).toBeUndefined();
    }
  });

  it('transitions otp_entry → otp_requesting, preserving prevOtp', () => {
    const state: Phase = { name: 'otp_entry', ctx: CTX, otp: OTP_A };
    const next = act(state, { type: 'CONTINUE_TO_OTP' });
    expect(next.name).toBe('otp_requesting');
    if (next.name === 'otp_requesting') {
      expect(next.prevOtp).toEqual(OTP_A);
    }
  });

  it('transitions otp_error → otp_requesting, preserving prevOtp (the core resend bug)', () => {
    const state: Phase = {
      name: 'otp_error',
      ctx: CTX,
      otp: OTP_A,
      message: 'Wrong code. 3 attempts remaining.',
      locked: false,
      expired: false,
    };
    const next = act(state, { type: 'CONTINUE_TO_OTP' });
    expect(next.name).toBe('otp_requesting');
    if (next.name === 'otp_requesting') {
      expect(next.prevOtp).toEqual(OTP_A);
    }
  });

  it('is a no-op from otp_verifying (no double-dispatch)', () => {
    const state: Phase = { name: 'otp_verifying', ctx: CTX, otp: OTP_A };
    expect(act(state, { type: 'CONTINUE_TO_OTP' })).toBe(state);
  });
});

// ─── OTP_SENT ─────────────────────────────────────────────────────────────────

describe('OTP_SENT', () => {
  it('initial flow: otp_requesting (no prevOtp) → otp_entry with new OTP', () => {
    const state: Phase = { name: 'otp_requesting', ctx: CTX };
    const next = act(state, { type: 'OTP_SENT', otp: OTP_B });
    expect(next).toEqual({ name: 'otp_entry', ctx: CTX, otp: OTP_B });
  });

  it('resend flow: otp_requesting (with prevOtp) → otp_entry with new OTP, not prevOtp', () => {
    const state: Phase = { name: 'otp_requesting', ctx: CTX, prevOtp: OTP_A };
    const next = act(state, { type: 'OTP_SENT', otp: OTP_B });
    expect(next).toEqual({ name: 'otp_entry', ctx: CTX, otp: OTP_B });
  });

  it('is a no-op from states other than otp_requesting', () => {
    const state: Phase = { name: 'otp_error', ctx: CTX, otp: OTP_A, message: 'x', locked: false, expired: false };
    expect(act(state, { type: 'OTP_SENT', otp: OTP_B })).toBe(state);
  });
});

// ─── OTP_SEND_FAILED ──────────────────────────────────────────────────────────

describe('OTP_SEND_FAILED', () => {
  it('initial flow (no prevOtp): drops back to offer_view', () => {
    const state: Phase = { name: 'otp_requesting', ctx: CTX };
    const next = act(state, { type: 'OTP_SEND_FAILED', message: 'Service error' });
    expect(next).toEqual({ name: 'offer_view', ctx: CTX });
  });

  it('resend flow (prevOtp set): returns to otp_entry with old OTP and error', () => {
    const state: Phase = { name: 'otp_requesting', ctx: CTX, prevOtp: OTP_A };
    const next = act(state, { type: 'OTP_SEND_FAILED', message: 'Too many requests' });
    expect(next.name).toBe('otp_entry');
    if (next.name === 'otp_entry') {
      expect(next.otp).toEqual(OTP_A);
      expect(next.error).toBe('Too many requests');
    }
  });

  it('is a no-op when not in otp_requesting', () => {
    const state: Phase = { name: 'offer_view', ctx: CTX };
    expect(act(state, { type: 'OTP_SEND_FAILED', message: 'x' })).toBe(state);
  });
});

// ─── OTP_FAILED ───────────────────────────────────────────────────────────────

describe('OTP_FAILED', () => {
  const verifying: Phase = { name: 'otp_verifying', ctx: CTX, otp: OTP_A };

  it('wrong code: locked=false, expired=false', () => {
    const next = act(verifying, {
      type: 'OTP_FAILED',
      message: '2 attempts remaining.',
      locked: false,
      expired: false,
    });
    expect(next.name).toBe('otp_error');
    if (next.name === 'otp_error') {
      expect(next.locked).toBe(false);
      expect(next.expired).toBe(false);
    }
  });

  it('max attempts: locked=true, expired=false', () => {
    const next = act(verifying, {
      type: 'OTP_FAILED',
      message: 'Too many attempts.',
      locked: true,
      expired: false,
    });
    if (next.name === 'otp_error') {
      expect(next.locked).toBe(true);
      expect(next.expired).toBe(false);
    }
  });

  it('expired code: locked=false, expired=true — distinct from wrong-code', () => {
    const next = act(verifying, {
      type: 'OTP_FAILED',
      message: 'This verification code has expired.',
      locked: false,
      expired: true,
    });
    expect(next.name).toBe('otp_error');
    if (next.name === 'otp_error') {
      expect(next.expired).toBe(true);
      expect(next.locked).toBe(false);
    }
  });
});

// ─── ACCEPTED ─────────────────────────────────────────────────────────────────

describe('ACCEPTED', () => {
  it('carries certificateId through to completed state', () => {
    const state: Phase = { name: 'accepting', ctx: CTX };
    const next = act(state, {
      type: 'ACCEPTED',
      acceptedAt: '2026-03-27T10:00:00Z',
      certificateId: 'cert-abc123',
    });
    expect(next).toEqual({
      name: 'completed',
      acceptedAt: '2026-03-27T10:00:00Z',
      certificateId: 'cert-abc123',
    });
  });

  it('carries null certificateId when certificate is not yet issued', () => {
    const state: Phase = { name: 'accepting', ctx: CTX };
    const next = act(state, {
      type: 'ACCEPTED',
      acceptedAt: '2026-03-27T10:00:00Z',
      certificateId: null,
    });
    expect(next).toEqual({
      name: 'completed',
      acceptedAt: '2026-03-27T10:00:00Z',
      certificateId: null,
    });
  });
});

// ─── Full resend scenario (integration-style) ─────────────────────────────────

describe('Full OTP expiry + resend scenario', () => {
  it('user submits expired code → clicks resend → receives new OTP → can re-enter', () => {
    // 1. User is verifying with OTP_A
    let state: Phase = { name: 'otp_verifying', ctx: CTX, otp: OTP_A };

    // 2. Server rejects: OTP expired
    state = act(state, { type: 'OTP_FAILED', message: 'Code expired.', locked: false, expired: true });
    expect(state.name).toBe('otp_error');
    if (state.name === 'otp_error') expect(state.expired).toBe(true);

    // 3. User clicks "Send a new code" → CONTINUE_TO_OTP from otp_error
    state = act(state, { type: 'CONTINUE_TO_OTP' });
    expect(state.name).toBe('otp_requesting');
    if (state.name === 'otp_requesting') expect(state.prevOtp).toEqual(OTP_A);

    // 4. New OTP arrives
    state = act(state, { type: 'OTP_SENT', otp: OTP_B });
    expect(state.name).toBe('otp_entry');
    if (state.name === 'otp_entry') {
      expect(state.otp).toEqual(OTP_B);
      expect(state.error).toBeUndefined();
    }

    // 5. User verifies the new code
    state = act(state, { type: 'SUBMIT_CODE', code: '123456' });
    state = act(state, { type: 'OTP_VERIFIED', challengeId: OTP_B.challengeId });
    expect(state.name).toBe('acceptance');
  });

  it('resend request itself fails → stays on otp_entry with the old OTP usable', () => {
    let state: Phase = { name: 'otp_entry', ctx: CTX, otp: OTP_A };

    // User clicks resend
    state = act(state, { type: 'CONTINUE_TO_OTP' });
    expect(state.name).toBe('otp_requesting');

    // Resend API fails (e.g. rate limit)
    state = act(state, { type: 'OTP_SEND_FAILED', message: 'Too many requests. Try again shortly.' });
    expect(state.name).toBe('otp_entry');
    if (state.name === 'otp_entry') {
      // Old OTP is restored — user can still try to verify with their existing code
      expect(state.otp).toEqual(OTP_A);
      expect(state.error).toBe('Too many requests. Try again shortly.');
    }
  });
});
