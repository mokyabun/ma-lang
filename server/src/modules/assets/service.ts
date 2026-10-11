import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Store } from '@/db'

function hex(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString('hex')
}

export class AssetStore {
    private readonly assetDir: string

    constructor(
        dataDir: string,
        private readonly store: Store,
    ) {
        this.assetDir = join(dataDir, 'assets')
        mkdirSync(this.assetDir, { recursive: true })
    }

    async put(bytes: Uint8Array, mimeType: string) {
        const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes))
        const existing = this.store.asset.findBySha256(sha256)
        if (existing) return existing
        const id = crypto.randomUUID()
        const path = join(this.assetDir, sha256)
        await Bun.write(path, bytes)
        return this.store.asset.upsert({ id, sha256, mimeType, size: bytes.byteLength, path })
    }

    async read(id: string): Promise<Uint8Array | null> {
        const asset = this.store.asset.get(id)
        if (!asset) return null
        const file = Bun.file(asset.path)
        if (!(await file.exists())) return null
        return new Uint8Array(await file.arrayBuffer())
    }
}
