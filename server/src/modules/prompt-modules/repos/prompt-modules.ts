import type { PromptModule, PromptModuleInput } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import { newLuaColumns, RepositoryBase, requireValue, updateLuaColumns } from '@/db/repository'
import { promptModules } from '@/db/schema'
import { mapPromptModule } from '@/modules/prompt-modules/mapper'

export class PromptModuleRepository extends RepositoryBase {
    create(
        input: PromptModuleInput,
        source: Record<string, unknown> = {},
        warnings: string[] = [],
    ): PromptModule {
        const id = crypto.randomUUID()
        const now = new Date()
        this.db
            .insert(promptModules)
            .values({
                id,
                name: input.name,
                description: input.description,
                namespace: input.namespace,
                sourceId: input.sourceId || '',
                runtimeOrder: input.runtimeOrder ?? 0,
                ...newLuaColumns(input.luaScript),
                luaRawTriggerJson: input.luaRawTriggers || [],
                enabledByDefault: input.enabledByDefault,
                promptsJson: input.prompts,
                togglesJson: input.toggles || [],
                regexScriptsJson: input.regexScripts || [],
                backgroundEmbedding: input.backgroundEmbedding || '',
                lorebookJson: input.lorebook,
                warningsJson: warnings,
                sourceJson: source,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.get(id), 'Failed to create prompt module')
    }

    list(): PromptModule[] {
        return this.db
            .select()
            .from(promptModules)
            .orderBy(asc(promptModules.name))
            .all()
            .map(mapPromptModule)
    }

    get(id: string): PromptModule | null {
        const row = this.db.select().from(promptModules).where(eq(promptModules.id, id)).get()
        return row ? mapPromptModule(row) : null
    }

    source(id: string): Record<string, unknown> {
        const row = this.db
            .select({ sourceJson: promptModules.sourceJson })
            .from(promptModules)
            .where(eq(promptModules.id, id))
            .get()
        return row?.sourceJson || {}
    }

    findByNamespace(namespace: string): PromptModule | null {
        if (!namespace) return null
        const row = this.db
            .select()
            .from(promptModules)
            .where(eq(promptModules.namespace, namespace))
            .get()
        return row ? mapPromptModule(row) : null
    }

    update(id: string, input: PromptModuleInput): PromptModule | null {
        const current = this.get(id)
        if (!current) return null
        this.db
            .update(promptModules)
            .set({
                name: input.name,
                description: input.description,
                namespace: input.namespace,
                sourceId: input.sourceId || '',
                runtimeOrder: input.runtimeOrder ?? current.runtimeOrder,
                ...(input.luaScript === undefined
                    ? {}
                    : updateLuaColumns(current.luaScript, input.luaScript)),
                luaRawTriggerJson: input.luaRawTriggers ?? current.luaRawTriggers,
                enabledByDefault: input.enabledByDefault,
                promptsJson: input.prompts,
                togglesJson: input.toggles || [],
                regexScriptsJson: input.regexScripts || [],
                backgroundEmbedding: input.backgroundEmbedding || '',
                lorebookJson: input.lorebook,
            })
            .where(eq(promptModules.id, id))
            .run()
        return this.get(id)
    }

    delete(id: string): boolean {
        if (!this.get(id)) return false
        this.db.delete(promptModules).where(eq(promptModules.id, id)).run()
        return true
    }
}
