import type { ApiErrorCode } from '@malang/shared'

export type AppErrorKind =
    | 'bad_request'
    | 'payload_too_large'
    | 'validation_failed'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'conflict'
    | 'provider_auth'
    | 'provider_unreachable'
    | 'model_not_found'
    | 'rate_limited'
    | 'context_too_large'
    | 'safety_blocked'
    | 'cancelled'
    | 'invalid_provider_response'
    | 'internal_error'

const ERROR_CODES: Record<AppErrorKind, ApiErrorCode> = {
    bad_request: 'bad_request',
    payload_too_large: 'bad_request',
    validation_failed: 'validation_failed',
    unauthorized: 'unauthorized',
    forbidden: 'forbidden',
    not_found: 'not_found',
    conflict: 'conflict',
    provider_auth: 'provider_auth',
    provider_unreachable: 'provider_unreachable',
    model_not_found: 'model_not_found',
    rate_limited: 'rate_limited',
    context_too_large: 'context_too_large',
    safety_blocked: 'safety_blocked',
    cancelled: 'cancelled',
    invalid_provider_response: 'invalid_provider_response',
    internal_error: 'internal_error',
}

export class AppError extends Error {
    readonly code: ApiErrorCode

    constructor(
        readonly kind: AppErrorKind,
        message: string,
        readonly details?: unknown,
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = new.target.name
        this.code = ERROR_CODES[kind]
    }
}

export class BadRequestError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('bad_request', message, details, options)
    }
}

export class PayloadTooLargeError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('payload_too_large', message, details, options)
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('validation_failed', message, details, options)
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('unauthorized', message, details, options)
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('forbidden', message, details, options)
    }
}

export class NotFoundError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('not_found', message, details, options)
    }
}

export class ConflictError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('conflict', message, details, options)
    }
}

export class RateLimitError extends AppError {
    constructor(message: string, details?: unknown, options?: ErrorOptions) {
        super('rate_limited', message, details, options)
    }
}

export class CancelledError extends AppError {
    constructor(message = 'Operation was cancelled', details?: unknown, options?: ErrorOptions) {
        super('cancelled', message, details, options)
    }
}

export class InternalError extends AppError {
    constructor(options?: ErrorOptions) {
        super('internal_error', 'Internal server error', undefined, options)
    }
}
