// Domain errors for the OfferAccept application layer.
//
// These are plain Error subclasses — not NestJS HTTP exceptions.
// An exception filter in the HTTP layer translates them to HTTP responses.
// Keeping them HTTP-agnostic means the same domain logic can be called from
// background jobs, tests, or CLI tools without pulling in NestJS.

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// ─── State machine ────────────────────────────────────────────────────────────

export class InvalidStateTransitionError extends DomainError {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly entity?: string,
  ) {
    super(
      entity
        ? `${entity}: transition from '${from}' to '${to}' is not allowed`
        : `Invalid state transition: '${from}' → '${to}'`,
    );
  }
}

export class TerminalStateError extends DomainError {
  constructor(
    public readonly state: string,
    public readonly entity?: string,
  ) {
    super(
      entity
        ? `${entity} is in terminal state '${state}' and cannot be modified`
        : `Entity is in terminal state '${state}'`,
    );
  }
}

// ─── Token ────────────────────────────────────────────────────────────────────

// TokenInvalidError covers both "not found" and "expired/revoked".
// The public API must return the same response for both to prevent enumeration.
export class TokenInvalidError extends DomainError {
  constructor() {
    super('This link is invalid or has expired.');
  }
}

// ─── Session ──────────────────────────────────────────────────────────────────

export class SessionExpiredError extends DomainError {
  constructor() {
    super('This signing session has expired. Please re-open the offer link.');
  }
}

export class SessionNotVerifiedError extends DomainError {
  constructor() {
    super('Email verification is required before accepting this offer.');
  }
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

export class OtpExpiredError extends DomainError {
  constructor() {
    super('This verification code has expired. Please request a new one.');
  }
}

export class OtpLockedError extends DomainError {
  constructor() {
    super('Too many incorrect attempts. Please request a new verification code.');
  }
}

export class OtpInvalidError extends DomainError {
  constructor(public readonly attemptsRemaining: number) {
    super(`Incorrect verification code. ${attemptsRemaining} attempt(s) remaining.`);
  }
}

export class OtpAlreadyVerifiedError extends DomainError {
  constructor() {
    super('This verification code has already been used.');
  }
}

export class OtpInvalidatedError extends DomainError {
  constructor() {
    super('This verification code is no longer valid. Please request a new one.');
  }
}

export class OtpChallengeMismatchError extends DomainError {
  constructor() {
    super('The verification challenge does not belong to this session.');
  }
}

// ─── Offer (sender-side) ──────────────────────────────────────────────────────

// Thrown when a mutation is attempted on an offer that is not in DRAFT state.
export class OfferNotEditableError extends DomainError {
  constructor(public readonly currentStatus: string) {
    super(
      `This offer cannot be edited because it is in '${currentStatus}' status. ` +
      `Only DRAFT offers can be modified.`,
    );
  }
}

// Thrown when send is attempted on an offer that is missing required fields.
export class OfferIncompleteError extends DomainError {
  constructor(public readonly missingFields: string[]) {
    super(
      `This offer is not ready to send. Missing or incomplete: ${missingFields.join(', ')}.`,
    );
  }
}

// Thrown when revoke is attempted on an offer that cannot be revoked.
export class OfferNotRevocableError extends DomainError {
  constructor(public readonly currentStatus: string) {
    super(
      `This offer cannot be revoked because it is in '${currentStatus}' status.`,
    );
  }
}

// Thrown when resend is attempted on an offer that does not allow re-delivery.
// Reasons: offer is not SENT, or the recipient token was permanently invalidated (revoked).
export class OfferNotResendableError extends DomainError {
  constructor(public readonly reason: string) {
    super(
      `This offer cannot be resent. Reason: ${reason}. ` +
      `Only SENT offers with a valid recipient token can be resent.`,
    );
  }
}

// ─── Offer (public-facing) ────────────────────────────────────────────────────

export class OfferExpiredError extends DomainError {
  constructor() {
    super('This offer has expired.');
  }
}

export class OfferNotSentError extends DomainError {
  constructor() {
    super('This offer has not been sent yet.');
  }
}

export class OfferAlreadyAcceptedError extends DomainError {
  constructor() {
    super('This offer has already been accepted.');
  }
}

// ─── Concurrency ──────────────────────────────────────────────────────────────

// Thrown when an optimistic concurrency check fails: another process updated
// the same row between the read and the write. Callers should retry or surface
// a conflict response — never silently swallow this error.
export class ConcurrencyConflictError extends DomainError {
  constructor(public readonly entity?: string) {
    super(
      entity
        ? `Concurrent modification detected on ${entity}. Please retry.`
        : 'Concurrent modification detected. Please retry.',
    );
  }
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

export class RateLimitExceededError extends DomainError {
  constructor(
    public readonly retryAfterMs: number,
    public readonly resetAt: Date,
  ) {
    super('Too many requests. Please wait before trying again.');
  }
}
