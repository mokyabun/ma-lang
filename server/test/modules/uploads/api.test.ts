import { afterAll, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createTestApp } from '../../helpers/app'
import { charxArchive } from '../../helpers/fixtures'

const t = await createTestApp()
afterAll(() => t.close())

describe('chunked uploads', () => {
    test('imports a CHARX uploaded in out-of-order, retried chunks', async () => {
        const bytes = charxArchive()
        const uploadsDirectory = join(t.dataDir, 'tmp', 'uploads')

        const tooLarge = await t.send('/uploads', {
            method: 'POST',
            body: { filename: 'huge.charx', size: t.config.limits.importBytes + 1 },
        })
        expect(tooLarge.status).toBe(413)
        expect(await tooLarge.json()).toMatchObject({
            details: { maxBytes: t.config.limits.importBytes },
        })

        const created = await t.send('/uploads', {
            method: 'POST',
            body: { filename: '청크 캐릭터.charx', size: bytes.byteLength },
        })
        expect(created.status).toBe(201)
        const session = (await created.json()) as {
            id: string
            chunkBytes: number
            chunkCount: number
        }
        expect(session.chunkBytes).toBe(t.config.limits.uploadChunkBytes)
        expect(session.chunkCount).toBe(Math.ceil(bytes.byteLength / session.chunkBytes))

        const putChunk = (index: number, body = bytes) =>
            t.send(`/uploads/${session.id}/chunks/${index}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/octet-stream' },
                body: body.slice(index * session.chunkBytes, (index + 1) * session.chunkBytes),
            })
        const importUpload = () =>
            t.send('/characters/import', {
                method: 'POST',
                headers: { accept: 'text/event-stream', 'x-upload-id': session.id },
            })

        expect((await putChunk(0, new Uint8Array(10))).status).toBe(422)
        expect((await importUpload()).status).toBe(422)
        for (let index = session.chunkCount - 1; index >= 0; index -= 1) {
            expect((await putChunk(index)).status).toBe(200)
        }
        expect(await (await putChunk(0)).json()).toEqual({
            received: session.chunkCount,
            chunkCount: session.chunkCount,
        })

        const imported = await importUpload()
        expect(imported.headers.get('x-accel-buffering')).toBe('no')
        const events = (await imported.text()).split('\n\n').filter(Boolean)
        expect(JSON.parse(events.at(-1)!.replace(/^data: /, ''))).toMatchObject({
            type: 'import.completed',
            status: 201,
        })
        expect(readdirSync(uploadsDirectory)).toEqual([])
        expect((await importUpload()).status).toBe(404)

        const cancelled = await t.call<{ id: string }>('/uploads', {
            method: 'POST',
            body: { filename: 'cancel.charx', size: 1 },
        })
        expect(readdirSync(uploadsDirectory)).toEqual([cancelled.id])
        const deleted = await t.send(`/uploads/${cancelled.id}`, { method: 'DELETE' })
        expect(deleted.status).toBe(204)
        expect(readdirSync(uploadsDirectory)).toEqual([])
    })
})
