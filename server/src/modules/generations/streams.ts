import type { ApiError, GenerationEvent } from '@malang/shared'
import type { Logger } from 'pino'

import type { Store } from '@/db'

const API_ERROR_CODES = new Set<ApiError['code']>([
    'bad_request',
    'unauthorized',
    'forbidden',
    'not_found',
    'conflict',
    'validation_failed',
    'provider_auth',
    'provider_unreachable',
    'model_not_found',
    'rate_limited',
    'context_too_large',
    'safety_blocked',
    'cancelled',
    'invalid_provider_response',
    'internal_error',
])
const SSE_ENCODER = new TextEncoder()

export function replayGeneration(
    generationId: string,
    message: NonNullable<ReturnType<Store['message']['get']>>,
) {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(
                encodeSse({ type: 'generation.started', generationId, messageId: message.id }),
            )
            controller.enqueue(encodeSse({ type: 'message.completed', generationId, message }))
            controller.close()
        },
    })
    return { generationId, stream }
}

export function reconnectGeneration(store: Store, generationId: string, requestId: string) {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let started = false
            let lastContent = ''
            while (!cancelled) {
                const run = store.generation.get(generationId)
                if (!run) break
                if (run.messageId) {
                    const message = store.message.get(run.messageId)
                    if (!started) {
                        controller.enqueue(
                            encodeSse({
                                type: 'generation.started',
                                generationId,
                                messageId: run.messageId,
                            }),
                        )
                        started = true
                    }
                    if (message && message.content !== lastContent && run.status === 'running') {
                        lastContent = message.content
                        controller.enqueue(
                            encodeSse({
                                type: 'message.snapshot',
                                generationId,
                                messageId: message.id,
                                content: message.content,
                            }),
                        )
                    }
                    if (run.status === 'complete' && message) {
                        controller.enqueue(
                            encodeSse({ type: 'message.completed', generationId, message }),
                        )
                        break
                    }
                    if (run.status === 'failed') {
                        controller.enqueue(
                            encodeSse({
                                type: 'generation.failed',
                                generationId,
                                messageId: message?.id,
                                error: {
                                    code: apiErrorCode(run.errorCode),
                                    message: run.errorMessage || 'Generation failed',
                                    requestId,
                                },
                            }),
                        )
                        break
                    }
                    if (run.status === 'cancelled') break
                }
                await Bun.sleep(200)
            }
            if (!cancelled) controller.close()
        },
        cancel() {
            cancelled = true
        },
    })
    return { generationId, stream }
}

function apiErrorCode(value: string | null): ApiError['code'] {
    return API_ERROR_CODES.has(value as ApiError['code'])
        ? (value as ApiError['code'])
        : 'internal_error'
}

export function logGeneration(
    log: Logger,
    generationId: string,
    provider: string,
    modelId: string,
    startedAt: number,
    status: string,
    errorCode?: string,
): void {
    const method = status === 'failed' ? log.warn.bind(log) : log.debug.bind(log)
    method(
        {
            event: 'generation.completed',
            generationId,
            provider,
            modelId,
            status,
            durationMs: Math.round(performance.now() - startedAt),
            ...(errorCode ? { errorCode } : {}),
        },
        'Generation completed',
    )
}

export function encodeSse(event: GenerationEvent): Uint8Array {
    return SSE_ENCODER.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
}
