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

// ─── Organization / Membership ────────────────────────────────────────────────

export class OrgNotFoundError extends DomainError {
  constructor() { super('Organization not found.'); }
}

export class NotOrgMemberError extends DomainError {
  constructor() { super('You are not a member of this organization.'); }
}

export class InsufficientOrgRoleError extends DomainError {
  constructor(required: string) {
    super(`This action requires the ${required} role or higher.`);
  }
}

export class AlreadyOrgMemberError extends DomainError {
  constructor() { super('This user is already a member of the organization.'); }
}

export class InviteNotFoundError extends DomainError {
  constructor() { super('Invite not found or already used.'); }
}

export class InviteExpiredError extends DomainError {
  constructor() { super('This invitation has expired.'); }
}

export class CannotRemoveLastOwnerError extends DomainError {
  constructor() { super('Cannot remove the last owner of an organization.'); }
}

export class CannotTransferToNonMemberError extends DomainError {
  constructor() { super('Ownership can only be transferred to an existing member.'); }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Email is already registered. Return the same generic message as "invalid credentials"
// to prevent email enumeration — do NOT reveal whether the email exists.
export class EmailAlreadyExistsError extends DomainError {
  constructor() {
    super('An account with this email already exists.');
  }
}

// Login attempted with wrong credentials. Generic message prevents username enumeration.
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid email or password.');
  }
}

// Access attempted before email address is verified.
export class EmailNotVerifiedError extends DomainError {
  constructor() {
    super('Please verify your email address before continuing.');
  }
}

// Refresh token presented is valid in form but has been revoked (logout or rotation).
export class SessionRevokedError extends DomainError {
  constructor() {
    super('Your session has been revoked. Please log in again.');
  }
}

// Generic expired-or-invalid for password-reset / email-verification tokens.
// Intentionally vague to prevent enumeration of valid vs expired tokens.
export class AuthTokenInvalidError extends DomainError {
  constructor() {
    super('This link is invalid or has expired. Please request a new one.');
  }
}

// ─── File storage ─────────────────────────────────────────────────────────────

export class FileTooLargeError extends DomainError {
  constructor(public readonly maxBytes: number) {
    super(`File exceeds the maximum allowed size of ${maxBytes} bytes.`);
  }
}

export class InvalidMimeTypeError extends DomainError {
  constructor(public readonly mime: string) {
    super(`File type '${mime}' is not allowed.`);
  }
}

export class FileHashMismatchError extends DomainError {
  constructor() {
    super('File integrity check failed. The uploaded content does not match the declared hash.');
  }
}

export class FileNotFoundError extends DomainError {
  constructor() {
    super('File not found.');
  }
}

// ─── Billing ──────────────────────────────────────────────────────────────────

// Thrown when an organisation has reached the offer limit for their plan.
export class PlanLimitExceededError extends DomainError {
  constructor(
    public readonly plan: string,
    public readonly limit: number,
  ) {
    super(
      `Your ${plan} plan allows ${limit} offer(s) per month. ` +
      `Upgrade your plan to send more offers.`,
    );
  }
}

// Thrown when a Stripe operation is attempted but no customer exists for the org.
export class BillingCustomerNotFoundError extends DomainError {
  constructor() {
    super('No billing customer found for this organisation. Please contact support.');
  }
}

// ─── Enterprise (API keys + webhooks) ─────────────────────────────────────────

// Thrown when an X-Api-Key header is missing, invalid, expired, or revoked.
// Deliberately vague — same message for all failure modes to prevent enumeration.
export class ApiKeyInvalidError extends DomainError {
  constructor() {
    super('API key is invalid or has been revoked.');
  }
}

// Thrown when a webhook endpoint is not found or does not belong to the caller's org.
export class WebhookEndpointNotFoundError extends DomainError {
  constructor() {
    super('Webhook endpoint not found.');
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
