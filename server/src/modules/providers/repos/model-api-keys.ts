import { asc, eq } from 'drizzle-orm'

import { RepositoryBase, requireValue } from '@/db/repository'
import { modelApiKeys, modelPresets } from '@/db/schema'

export interface ModelApiKeyRecordInput {
    name: string
    provider: string
    credentialType: 'apiKey' | 'serviceAccount' | 'aws'
    hint: string
}

export class ModelApiKeyRepository extends RepositoryBase {
    list() {
        return this.db.select().from(modelApiKeys).orderBy(asc(modelApiKeys.createdAt)).all()
    }

    get(id: string) {
        return this.db.select().from(modelApiKeys).where(eq(modelApiKeys.id, id)).get() ?? null
    }

    create(input: ModelApiKeyRecordInput) {
        const now = new Date()
        const row = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now }
        this.db.insert(modelApiKeys).values(row).run()
        return requireValue(this.get(row.id), 'Failed to create API key')
    }

    update(id: string, input: ModelApiKeyRecordInput) {
        if (!this.get(id)) return null
        this.db
            .update(modelApiKeys)
            .set({ ...input })
            .where(eq(modelApiKeys.id, id))
            .run()
        return this.get(id)
    }

    delete(id: string): 'deleted' | 'in_use' | 'not_found' {
        if (!this.get(id)) return 'not_found'
        const used = this.db
            .select({ id: modelPresets.id })
            .from(modelPresets)
            .where(eq(modelPresets.apiKeyId, id))
            .limit(1)
            .get()
        if (used) return 'in_use'
        this.db.delete(modelApiKeys).where(eq(modelApiKeys.id, id)).run()
        return 'deleted'
    }
}
