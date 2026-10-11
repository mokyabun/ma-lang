import type {
    ModelChainAgent,
    ModelChainGraph,
    ModelChainLayer,
    ModelChainPreset,
    ModelChainPresetInput,
} from '@malang/shared'
import { asc, eq, max } from 'drizzle-orm'

import type { DatabaseHandle } from '@/db/client'
import { iso, RepositoryBase, requireValue } from '@/db/repository'
import { conversations, modelChainPresets } from '@/db/schema'

export class ModelChainRepository extends RepositoryBase {
    constructor(handle: DatabaseHandle) {
        super(handle)
    }

    list(): ModelChainPreset[] {
        return this.db
            .select()
            .from(modelChainPresets)
            .orderBy(asc(modelChainPresets.sortOrder), asc(modelChainPresets.createdAt))
            .all()
            .map(mapModelChainPreset)
    }

    get(id: string): ModelChainPreset | null {
        const row = this.db
            .select()
            .from(modelChainPresets)
            .where(eq(modelChainPresets.id, id))
            .get()
        return row ? mapModelChainPreset(row) : null
    }

    create(input: ModelChainPresetInput): ModelChainPreset {
        const now = new Date()
        const id = crypto.randomUUID()
        const last = this.db
            .select({ value: max(modelChainPresets.sortOrder) })
            .from(modelChainPresets)
            .get()
        this.db
            .insert(modelChainPresets)
            .values({
                id,
                name: input.name,
                description: input.description,
                configJson: chainConfig(input),
                sortOrder: (last?.value ?? -1) + 1,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.get(id), 'Failed to create model chain preset')
    }

    update(id: string, input: ModelChainPresetInput): ModelChainPreset | null {
        if (!this.get(id)) return null
        this.db
            .update(modelChainPresets)
            .set({
                name: input.name,
                description: input.description,
                configJson: chainConfig(input),
            })
            .where(eq(modelChainPresets.id, id))
            .run()
        return this.get(id)
    }

    delete(id: string): 'deleted' | 'in_use' | 'not_found' {
        if (!this.get(id)) return 'not_found'
        if (
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.modelChainPresetId, id))
                .limit(1)
                .get()
        ) {
            return 'in_use'
        }
        this.db.delete(modelChainPresets).where(eq(modelChainPresets.id, id)).run()
        return 'deleted'
    }
}

function mapModelChainPreset(row: typeof modelChainPresets.$inferSelect): ModelChainPreset {
    const config = parseChainConfig(row.configJson)
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        ...config,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function chainConfig(input: ModelChainPresetInput) {
    return {
        version: input.graph ? 3 : 2,
        layers: input.layers,
        ...(input.graph ? { graph: input.graph } : {}),
    } as const
}

function parseChainConfig(config: {
    layers: ModelChainLayer[]
    graph?: ModelChainGraph
}): Pick<ModelChainPreset, 'layers' | 'graph'> {
    return {
        layers: config.layers.map((layer) => normalizeLayer(layer, Boolean(config.graph))),
        ...(config.graph ? { graph: config.graph } : {}),
    }
}

function normalizeLayer(layer: ModelChainLayer, graph = false): ModelChainLayer {
    return {
        id: layer.id,
        name: layer.name,
        phase: layer.phase,
        agents: Array.isArray(layer.agents)
            ? layer.agents.map((agent) => ({
                  ...normalizeAgent(agent),
                  memoryEnabled: (graph || layer.phase === 'pre') && agent.memoryEnabled === true,
              }))
            : [],
    }
}

function normalizeAgent(
    agent: Partial<ModelChainAgent> & Pick<ModelChainAgent, 'id' | 'name' | 'modelPresetId'>,
): ModelChainAgent {
    return {
        id: agent.id,
        name: agent.name,
        modelPresetId: agent.modelPresetId,
        systemPrompt: agent.systemPrompt ?? '',
        instruction: agent.instruction ?? '',
        enabled: agent.enabled !== false,
        postMode: agent.postMode ?? 'replace',
        assistantPrefill: agent.assistantPrefill === true,
        includeSettingInfo: agent.includeSettingInfo !== false,
        includeGlobalNote: agent.includeGlobalNote === true,
        includeLongTermMemory: agent.includeLongTermMemory !== false,
        includeRecentChat: agent.includeRecentChat !== false,
        includeCurrentUserInput: agent.includeCurrentUserInput !== false,
        includePreviousNotes: agent.includePreviousNotes !== false,
        memoryEnabled: agent.memoryEnabled === true,
        memoryInstruction: agent.memoryInstruction ?? '',
        memoryFormat: agent.memoryFormat ?? '',
    }
}
