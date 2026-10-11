import { eq } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'

import { assets } from '../schema'

export interface AssetRecord {
    id: string
    sha256: string
    mimeType: string
    size: number
    path: string
}

export class AssetRepository extends RepositoryBase {
    upsert(asset: AssetRecord): AssetRecord {
        const existing = this.db.select().from(assets).where(eq(assets.sha256, asset.sha256)).get()
        if (existing) return existing
        this.db
            .insert(assets)
            .values({ ...asset, createdAt: new Date() })
            .run()
        return asset
    }

    findBySha256(sha256: string): AssetRecord | null {
        return this.db.select().from(assets).where(eq(assets.sha256, sha256)).get() || null
    }

    get(id: string): AssetRecord | null {
        return this.db.select().from(assets).where(eq(assets.id, id)).get() || null
    }
}
