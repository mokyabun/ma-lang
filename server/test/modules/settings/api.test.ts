import { afterAll, describe, expect, test } from 'bun:test'

import { createTestApp } from '../../helpers/app'

const t = await createTestApp()
afterAll(() => t.close())

describe('settings and database snapshots', () => {
    test('persists backup settings and exposes the environment override behind authentication', async () => {
        expect((await t.request('/api/v1/settings/backup')).status).toBe(401)
        const status = await t.send('/settings/backup')
        expect(await status.json()).toEqual({ allowed: false })
        for (const enabled of [false, true]) {
            const response = await t.send('/settings', {
                method: 'PATCH',
                body: { autoBackupEnabled: enabled },
            })
            expect(response.status).toBe(200)
            expect(await response.json()).toMatchObject({ autoBackupEnabled: enabled })
        }
        const invalid = await t.send('/settings', {
            method: 'PATCH',
            body: { autoBackupEnabled: 'false' },
        })
        expect(invalid.status).toBe(422)
    })

    test('creates, lists, downloads, and deletes database snapshots', async () => {
        const created = await t.send('/settings/backups', { method: 'POST' })
        expect(created.status).toBe(201)
        const snapshot = (await created.json()) as { id: string; kind: string; size: number }
        expect(snapshot.kind).toBe('manual')
        expect(typeof snapshot.size).toBe('number')
        const snapshotSize = snapshot.size

        const listed = await t.send('/settings/backups')
        expect(await listed.json()).toMatchObject({
            snapshots: [expect.objectContaining({ id: snapshot.id })],
        })

        const downloaded = await t.send(
            `/settings/backups/${encodeURIComponent(snapshot.id)}/download`,
        )
        expect(downloaded.status).toBe(200)
        expect(downloaded.headers.get('content-type')).toBe('application/vnd.sqlite3')
        expect((await downloaded.arrayBuffer()).byteLength).toBe(snapshotSize)

        const deleted = await t.send(`/settings/backups/${encodeURIComponent(snapshot.id)}`, {
            method: 'DELETE',
        })
        expect(deleted.status).toBe(204)
    })
})
