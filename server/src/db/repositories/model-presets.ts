import type { ModelPreset, ModelPresetInput } from '@malang/shared'
import { asc, eq, max } from 'drizzle-orm'

import { appSettings, conversations, modelChainPresets, modelPresets } from '../schema'
import { iso, RepositoryBase, requireValue } from './base'

export class ModelPresetRepository extends RepositoryBase {
    list(): ModelPreset[] {
        return this.db
            .select()
            .from(modelPresets)
            .orderBy(asc(modelPresets.sortOrder), asc(modelPresets.createdAt))
            .all()
            .map(mapModelPreset)
    }

    get(id: string): ModelPreset | null {
        const row = this.db.select().from(modelPresets).where(eq(modelPresets.id, id)).get()
        return row ? mapModelPreset(row) : null
    }

    create(input: ModelPresetInput): ModelPreset {
        const now = new Date()
        const id = crypto.randomUUID()
        const last = this.db
            .select({ value: max(modelPresets.sortOrder) })
            .from(modelPresets)
            .get()
        this.db
            .insert(modelPresets)
            .values({
                id,
                name: input.name,
                providerJson: input.config,
                apiKeyId: input.apiKeyId,
                sortOrder: (last?.value ?? -1) + 1,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.get(id), 'Failed to create model preset')
    }

    update(id: string, input: ModelPresetInput): ModelPreset | null {
        if (!this.get(id)) return null
        this.db
            .update(modelPresets)
            .set({
                name: input.name,
                providerJson: input.config,
                apiKeyId: input.apiKeyId,
            })
            .where(eq(modelPresets.id, id))
            .run()
        return this.get(id)
    }

    delete(id: string): 'deleted' | 'in_use' | 'not_found' {
        if (!this.get(id)) return 'not_found'
        const settings = this.db
            .select({
                model: appSettings.defaultModelPresetId,
                auxiliary: appSettings.defaultAuxiliaryModelPresetId,
            })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        if (
            settings?.model === id ||
            settings?.auxiliary === id ||
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.modelPresetId, id))
                .limit(1)
                .get() ||
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.auxiliaryModelPresetId, id))
                .limit(1)
                .get()
        )
            return 'in_use'
        const usedByChain = this.db
            .select({ configJson: modelChainPresets.configJson })
            .from(modelChainPresets)
            .all()
            .some(({ configJson }) =>
                configJson.layers
                    .flatMap((layer) => layer.agents)
                    .some((agent) => agent.modelPresetId === id),
            )
        if (usedByChain) return 'in_use'
        this.db.delete(modelPresets).where(eq(modelPresets.id, id)).run()
        return 'deleted'
    }
}

function mapModelPreset(row: typeof modelPresets.$inferSelect): ModelPreset {
    return {
        id: row.id,
        name: row.name,
        config: row.providerJson,
        apiKeyId: row.apiKeyId,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}
