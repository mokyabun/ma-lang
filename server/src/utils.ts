import { zValidator } from '@hono/zod-validator'
import type { Context } from 'hono'
import type { ZodType } from 'zod'

import { PayloadTooLargeError, ValidationError, validationDetails } from './errors'
import { decodeFilename } from './services/import/uploads'

export type AppEnv = {
    Variables: {
        requestId: string
        adminId: string
    }
}

export function jsonValidator<T extends ZodType>(schema: T) {
    return zValidator('json', schema, (result) => {
        if (!result.success) {
            throw new ValidationError('Request validation failed', validationDetails(result.error))
        }
    })
}

export async function readImportFile(
    c: Context<AppEnv>,
    maxBytes: number,
): Promise<{ bytes: Uint8Array; filename: string; mimeType: string }> {
    const contentLength = Number(c.req.header('content-length') ?? 0)
    if (contentLength > maxBytes) {
        throw new PayloadTooLargeError('Import file is too large')
    }

    const contentType = c.req.header('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
        let form: FormData
        try {
            form = await c.req.formData()
        } catch {
            throw new ValidationError('Malformed multipart form data')
        }
        const file = form.get('file')

        if (!(file instanceof File)) {
            throw new ValidationError('Multipart field "file" is required')
        }
        if (file.size > maxBytes) {
            throw new PayloadTooLargeError('Import file is too large')
        }

        return {
            bytes: new Uint8Array(await file.arrayBuffer()),
            filename: file.name || 'import.json',
            mimeType: file.type || 'application/octet-stream',
        }
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.byteLength > maxBytes) {
        throw new PayloadTooLargeError('Import file is too large')
    }

    return {
        bytes,
        filename: decodeFilename(c.req.header('x-filename')) ?? 'import.json',
        mimeType: contentType.split(';')[0] || 'application/octet-stream',
    }
}

export function parseEnum<const T extends readonly string[]>(
    value: string,
    values: T,
    name: string,
): T[number] {
    if (!values.includes(value)) {
        throw new ValidationError(`Invalid ${name}`)
    }
    return value as T[number]
}

export function binaryResponse(
    bytes: Uint8Array,
    mimeType: string,
    filename: string,
    warnings: string[] = [],
): Response {
    const headers = new Headers({
        'content-type': mimeType,
        'content-disposition': `attachment; filename="${filename.replace(/["\\\r\n]/g, '_')}"`,
        'content-length': String(bytes.byteLength),
    })

    if (warnings.length > 0) {
        headers.set('x-export-warnings', encodeURIComponent(JSON.stringify(warnings)))
    }

    return new Response(bytes, { headers })
}
