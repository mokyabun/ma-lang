import { eq } from 'drizzle-orm'

import { insertBatches, RepositoryBase } from '@/db/repository'
import { promptModuleAssets } from '@/db/schema'

export interface PromptModuleAssetRecord {
    id: string
    moduleId: string
    assetId: string
    type: string
    name: string
    extension: string
    sourceUri: string
}

export class PromptModuleAssetRepository extends RepositoryBase {
    replace(moduleId: string, links: PromptModuleAssetRecord[]): void {
        this.db.transaction((tx) => {
            tx.delete(promptModuleAssets).where(eq(promptModuleAssets.moduleId, moduleId)).run()
            for (const batch of insertBatches(links)) {
                tx.insert(promptModuleAssets).values(batch).run()
            }
        })
    }

    list(moduleId: string) {
        return this.db
            .select()
            .from(promptModuleAssets)
            .where(eq(promptModuleAssets.moduleId, moduleId))
            .all()
    }
}
