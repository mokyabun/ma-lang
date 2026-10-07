import { describe, expect, test } from 'bun:test'

import { ApiErrorSchema } from '@malang/shared'
import { HTTPException } from 'hono/http-exception'

import {
    ConflictError,
    errorResponse,
    normalizeError,
    PayloadTooLargeError,
    ValidationError,
    validationDetails,
} from '@/errors'
import { ProviderError } from '@/services/providers/types'

describe('structured server errors', () => {
    test.each([
        [new ConflictError('Resource is busy'), 409, 'conflict'],
        [new PayloadTooLargeError('Upload is too large'), 413, 'bad_request'],
        [new ProviderError('provider_auth', 'Credentials were rejected'), 401, 'provider_auth'],
        [
            new ProviderError('provider_unreachable', 'Provider is offline'),
            503,
            'provider_unreachable',
        ],
        [
            new ProviderError('invalid_provider_response', 'Invalid response'),
            502,
            'invalid_provider_response',
        ],
    ] as const)('maps an application error to its API contract', async (error, status, code) => {
        const normalized = normalizeError(error, 'request-1')
        const response = errorResponse(normalized)
        const body = ApiErrorSchema.parse(await response.json())

        expect(response.status).toBe(status)
        expect(body).toMatchObject({ code, message: error.message, requestId: 'request-1' })
        expect(normalized.unexpected).toBe(false)
    })

    test('preserves stable validation issue details', async () => {
        const details = validationDetails({
            issues: [
                {
                    path: ['parameters', 'temperature'],
                    code: 'too_big',
                    message: 'Must be less than or equal to 2',
                },
            ],
        })
        const response = errorResponse(
            normalizeError(new ValidationError('Request validation failed', details), 'request-2'),
        )

        expect(await response.json()).toEqual({
            code: 'validation_failed',
            message: 'Request validation failed',
            details: {
                issues: [
                    {
                        path: ['parameters', 'temperature'],
                        code: 'too_big',
                        message: 'Must be less than or equal to 2',
                    },
                ],
            },
            requestId: 'request-2',
        })
    })

    test('does not expose unexpected error messages', async () => {
        const normalized = normalizeError(
            new Error('sqlite failed while reading /private/data.sqlite'),
            'request-3',
        )
        const response = errorResponse(normalized)

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({
            code: 'internal_error',
            message: 'Internal server error',
            requestId: 'request-3',
        })
        expect(normalized.unexpected).toBe(true)
    })

    test('normalizes framework parsing and routing errors at the boundary', async () => {
        const malformed = errorResponse(normalizeError(new SyntaxError('JSON Parse error'), 'json'))
        const missing = errorResponse(
            normalizeError(new HTTPException(404, { message: 'Missing route' }), 'route'),
        )

        expect(malformed.status).toBe(400)
        expect(await malformed.json()).toMatchObject({
            code: 'bad_request',
            message: 'Malformed JSON body',
        })
        expect(missing.status).toBe(404)
        expect(await missing.json()).toMatchObject({ code: 'not_found', message: 'Missing route' })
    })

    test('uses the same safe contract for cancelled streams', () => {
        const normalized = normalizeError(new Error('socket closed'), 'stream', {
            cancelled: true,
        })

        expect(normalized.apiError).toEqual({
            code: 'cancelled',
            message: 'Generation was cancelled',
            requestId: 'stream',
        })
        expect(normalized.unexpected).toBe(false)
    })
})
