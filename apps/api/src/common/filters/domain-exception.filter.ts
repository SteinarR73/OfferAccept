import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  DomainError,
  TokenInvalidError,
  SessionExpiredError,
  SessionNotVerifiedError,
  OtpExpiredError,
  OtpLockedError,
  OtpInvalidError,
  OtpAlreadyVerifiedError,
  OtpInvalidatedError,
  OtpChallengeMismatchError,
  OfferExpiredError,
  OfferAlreadyAcceptedError,
  OfferNotEditableError,
  OfferIncompleteError,
  OfferNotRevocableError,
  OfferNotResendableError,
  InvalidStateTransitionError,
  TerminalStateError,
  RateLimitExceededError,
  ConcurrencyConflictError,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  EmailNotVerifiedError,
  SessionRevokedError,
  AuthTokenInvalidError,
  OrgNotFoundError,
  NotOrgMemberError,
  InsufficientOrgRoleError,
  AlreadyOrgMemberError,
  InviteNotFoundError,
  InviteExpiredError,
  CannotRemoveLastOwnerError,
  CannotTransferToNonMemberError,
  FileTooLargeError,
  InvalidMimeTypeError,
  FileHashMismatchError,
  FileNotFoundError,
  PlanLimitExceededError,
  BillingCustomerNotFoundError,
  ApiKeyInvalidError,
  WebhookEndpointNotFoundError,
} from '../errors/domain.errors';

// ─── DomainExceptionFilter ─────────────────────────────────────────────────────
// Maps domain errors to HTTP responses.
//
// Anti-enumeration rule: errors that could leak the existence of a resource
// (token not found vs token expired) use the same HTTP status and body.
// See TokenInvalidError — it is used for both cases in the token service.
//
// All public-facing error messages are designed to avoid revealing internal state.

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  // Extra fields for specific error types (e.g., OTP attempts remaining)
  detail?: Record<string, unknown>;
}

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, body } = this.resolve(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${exception.name}: ${exception.message} [${request.method} ${request.url}]`,
        exception.stack,
      );
    }

    response.status(statusCode).json(body);
  }

  private resolve(err: DomainError): { statusCode: number; body: ErrorResponse } {
    // ── Org errors ─────────────────────────────────────────────────────────────
    if (err instanceof OrgNotFoundError) {
      return this.make(HttpStatus.NOT_FOUND, err.message, 'ORG_NOT_FOUND');
    }
    if (err instanceof NotOrgMemberError) {
      return this.make(HttpStatus.FORBIDDEN, err.message, 'NOT_ORG_MEMBER');
    }
    if (err instanceof InsufficientOrgRoleError) {
      return this.make(HttpStatus.FORBIDDEN, err.message, 'INSUFFICIENT_ORG_ROLE');
    }
    if (err instanceof AlreadyOrgMemberError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'ALREADY_ORG_MEMBER');
    }
    if (err instanceof InviteNotFoundError) {
      return this.make(HttpStatus.NOT_FOUND, err.message, 'INVITE_NOT_FOUND');
    }
    if (err instanceof InviteExpiredError) {
      return this.make(HttpStatus.GONE, err.message, 'INVITE_EXPIRED');
    }
    if (err instanceof CannotRemoveLastOwnerError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'CANNOT_REMOVE_LAST_OWNER');
    }
    if (err instanceof CannotTransferToNonMemberError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'CANNOT_TRANSFER_TO_NON_MEMBER');
    }

    // ── File storage errors ────────────────────────────────────────────────────
    if (err instanceof FileTooLargeError) {
      return this.make(HttpStatus.PAYLOAD_TOO_LARGE, err.message, 'FILE_TOO_LARGE', { maxBytes: err.maxBytes });
    }
    if (err instanceof InvalidMimeTypeError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'INVALID_MIME_TYPE', { mime: err.mime });
    }
    if (err instanceof FileHashMismatchError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'FILE_HASH_MISMATCH');
    }
    if (err instanceof FileNotFoundError) {
      return this.make(HttpStatus.NOT_FOUND, err.message, 'FILE_NOT_FOUND');
    }

    // ── Auth errors ────────────────────────────────────────────────────────────
    // 401: credentials / session problems
    if (err instanceof InvalidCredentialsError) {
      return this.make(HttpStatus.UNAUTHORIZED, err.message, 'INVALID_CREDENTIALS');
    }
    if (err instanceof SessionRevokedError) {
      return this.make(HttpStatus.UNAUTHORIZED, err.message, 'SESSION_REVOKED');
    }
    // 403: account state preventing access
    if (err instanceof EmailNotVerifiedError) {
      return this.make(HttpStatus.FORBIDDEN, err.message, 'EMAIL_NOT_VERIFIED');
    }
    // 409: duplicate email on signup
    if (err instanceof EmailAlreadyExistsError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'EMAIL_ALREADY_EXISTS');
    }
    // 400: invalid/expired auth token (reset / verification link)
    if (err instanceof AuthTokenInvalidError) {
      return this.make(HttpStatus.BAD_REQUEST, err.message, 'AUTH_TOKEN_INVALID');
    }

    // ── 404 errors ─────────────────────────────────────────────────────────────
    if (err instanceof TokenInvalidError) {
      return this.make(HttpStatus.NOT_FOUND, err.message, 'TOKEN_INVALID');
    }

    // ── 409 Conflict — sender-side offer state violations ─────────────────────
    if (err instanceof OfferNotEditableError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'OFFER_NOT_EDITABLE');
    }
    if (err instanceof OfferNotRevocableError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'OFFER_NOT_REVOCABLE');
    }
    if (err instanceof OfferNotResendableError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'OFFER_NOT_RESENDABLE');
    }

    // ── 422 Unprocessable — incomplete offer ──────────────────────────────────
    if (err instanceof OfferIncompleteError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'OFFER_INCOMPLETE', {
        missingFields: err.missingFields,
      });
    }

    // ── 410 Gone — resource was valid but is now permanently unavailable ───────
    if (err instanceof OfferExpiredError || err instanceof OfferAlreadyAcceptedError) {
      return this.make(HttpStatus.GONE, err.message, err.name.replace('Error', '').toUpperCase());
    }

    // ── 422 Unprocessable — valid request but wrong business state ─────────────
    if (err instanceof SessionExpiredError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'SESSION_EXPIRED');
    }
    if (err instanceof SessionNotVerifiedError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'SESSION_NOT_VERIFIED');
    }
    if (err instanceof OtpAlreadyVerifiedError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'OTP_ALREADY_VERIFIED');
    }
    if (err instanceof OtpInvalidatedError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'OTP_INVALIDATED');
    }
    if (err instanceof OtpChallengeMismatchError) {
      return this.make(HttpStatus.UNPROCESSABLE_ENTITY, err.message, 'OTP_CHALLENGE_MISMATCH');
    }
    if (err instanceof InvalidStateTransitionError || err instanceof TerminalStateError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'INVALID_STATE_TRANSITION');
    }
    if (err instanceof ConcurrencyConflictError) {
      return this.make(HttpStatus.CONFLICT, err.message, 'CONCURRENCY_CONFLICT', { retryable: true });
    }

    // ── 400 Bad Request — OTP verification failures ───────────────────────────
    if (err instanceof OtpExpiredError) {
      return this.make(HttpStatus.BAD_REQUEST, err.message, 'OTP_EXPIRED');
    }
    if (err instanceof OtpLockedError) {
      return this.make(HttpStatus.BAD_REQUEST, err.message, 'OTP_LOCKED');
    }
    if (err instanceof OtpInvalidError) {
      return this.make(HttpStatus.BAD_REQUEST, err.message, 'OTP_INVALID', {
        attemptsRemaining: err.attemptsRemaining,
      });
    }

    // ── Enterprise errors ──────────────────────────────────────────────────────
    if (err instanceof ApiKeyInvalidError) {
      return this.make(HttpStatus.UNAUTHORIZED, err.message, 'API_KEY_INVALID');
    }
    if (err instanceof WebhookEndpointNotFoundError) {
      return this.make(HttpStatus.NOT_FOUND, err.message, 'WEBHOOK_ENDPOINT_NOT_FOUND');
    }

    // ── Billing errors ─────────────────────────────────────────────────────────
    if (err instanceof PlanLimitExceededError) {
      return this.make(HttpStatus.PAYMENT_REQUIRED, err.message, 'PLAN_LIMIT_EXCEEDED', {
        plan: err.plan,
        limit: err.limit,
      });
    }
    if (err instanceof BillingCustomerNotFoundError) {
      return this.make(HttpStatus.NOT_FOUND, err.message, 'BILLING_CUSTOMER_NOT_FOUND');
    }

    // ── 429 Too Many Requests ──────────────────────────────────────────────────
    if (err instanceof RateLimitExceededError) {
      return this.make(HttpStatus.TOO_MANY_REQUESTS, err.message, 'RATE_LIMITED', {
        retryAfterMs: err.retryAfterMs,
        resetAt: err.resetAt.toISOString(),
      });
    }

    // ── Fallback for any other DomainError ────────────────────────────────────
    return this.make(HttpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred.', 'INTERNAL');
  }

  private make(
    statusCode: number,
    message: string,
    code: string,
    detail?: Record<string, unknown>,
  ): { statusCode: number; body: ErrorResponse } {
    return {
      statusCode,
      body: { statusCode, error: HttpStatus[statusCode] ?? 'ERROR', message, code, detail },
    };
  }
}
