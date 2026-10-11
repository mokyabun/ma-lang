import type { ApiError } from '@malang/shared'
import { HTTPException } from 'hono/http-exception'

import {
    AppError,
    type AppErrorKind,
    BadRequestError,
    CancelledError,
    InternalError,
    NotFoundError,
} from './app-error'

export interface NormalizedError {
    apiError: ApiError
    kind: AppErrorKind
    unexpected: boolean
    cause: unknown
}

export function normalizeError(
    error: unknown,
    requestId: string,
    options: { cancelled?: boolean } = {},
): NormalizedError {
    const appError = options.cancelled
        ? new CancelledError('Generation was cancelled', undefined, { cause: error })
        : toAppError(error)

    return {
        apiError: {
            code: appError.code,
            message: appError.message,
            ...(appError.details === undefined ? {} : { details: appError.details }),
            requestId,
        },
        kind: appError.kind,
        unexpected: appError.kind === 'internal_error',
        cause: error,
    }
}

function toAppError(error: unknown): AppError {
    if (error instanceof AppError) return error
    if (error instanceof SyntaxError) {
        return new BadRequestError('Malformed JSON body', undefined, { cause: error })
    }
    if (error instanceof HTTPException) {
        if (error.status === 404) {
            return new NotFoundError(error.message || 'Route not found', undefined, {
                cause: error,
            })
        }
        if (error.status < 500) {
            const message = /malformed json/i.test(error.message)
                ? 'Malformed JSON body'
                : error.message || 'Malformed request'
            return new BadRequestError(message, undefined, {
                cause: error,
            })
        }
    }
    return new InternalError({ cause: error })
}
