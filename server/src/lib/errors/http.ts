import type { AppErrorKind } from './app-error'
import type { NormalizedError } from './normalize'

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503

const ERROR_STATUSES: Record<AppErrorKind, ErrorStatus> = {
    bad_request: 400,
    payload_too_large: 413,
    validation_failed: 422,
    unauthorized: 401,
    forbidden: 403,
    not_found: 404,
    conflict: 409,
    provider_auth: 401,
    provider_unreachable: 503,
    model_not_found: 404,
    rate_limited: 429,
    context_too_large: 422,
    safety_blocked: 502,
    cancelled: 409,
    invalid_provider_response: 502,
    internal_error: 500,
}

export function errorResponse(error: NormalizedError): Response {
    return Response.json(error.apiError, {
        status: statusForErrorKind(error.kind),
        headers: { 'x-request-id': error.apiError.requestId },
    })
}

export function statusForErrorKind(kind: AppErrorKind): ErrorStatus {
    return ERROR_STATUSES[kind]
}
