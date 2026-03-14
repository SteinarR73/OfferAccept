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
