import type { PromptModuleInput } from '@malang/shared'
import type { CharacterCardV3 } from '@risuai/ccardlib'

import type { AppConfig } from '@/config'
import type { Store } from '@/db'
import { ConflictError } from '@/errors/app-error'
import { exportCharacterCard, importCharacterCard } from '@/services/app/character-card'
import type { ByteSource, ImportProgress } from '@/services/import/source'
import {
    exportPromptModule,
    importPromptModule,
    serializeRisuModuleToggles,
} from '@/services/prompt/module-codec'
import { mergeLuaTriggers, toRisuRegexScripts } from '@/services/prompt/risu'

import type { AssetStore } from './assets'
import { effectivePromptPresetId } from './conversations'

export class PromptModuleConflictError extends ConflictError {}

export type ModuleActivationSource = 'conversation' | 'preset' | 'character' | 'default'

/** Conversation override wins; otherwise on when the preset or character references it, or by default. */
export function conversationModuleStates(store: Store, conversationId: string) {
    const conversation = store.conversation.get(conversationId)
    if (!conversation) return []
    const overrides = store.conversationModule.overrides(conversationId)
    const preset = store.promptPreset.get(
        effectivePromptPresetId(conversation, store.settings.get()),
    )
    const character = store.character.get(conversation.characterId)
    const integrations = new Set(preset?.moduleIntegrations || [])
    const characterModules = new Set(character?.moduleReferences || [])
    return store.promptModule.list().map((module) => {
        const presetActive = integrations.has(module.id) || integrations.has(module.namespace)
        const characterActive =
            characterModules.has(module.id) || characterModules.has(module.sourceId)
        const explicit = overrides.get(module.id)
        const enabled = explicit ?? (presetActive || characterActive || module.enabledByDefault)
        const activationSource: ModuleActivationSource =
            explicit !== undefined
                ? 'conversation'
                : presetActive
                  ? 'preset'
                  : characterActive
                    ? 'character'
                    : 'default'
        return { module, enabled, inherited: explicit === undefined, activationSource }
    })
}

export class PromptModuleService {
    constructor(
        private readonly store: Store,
        private readonly config: AppConfig,
        private readonly assetStore: AssetStore,
    ) {}

    list() {
        return this.store.promptModule.list().map((module) => this.withAssets(module))
    }

    get(id: string) {
        const module = this.store.promptModule.get(id)
        return module ? this.withAssets(module) : null
    }

    create(input: PromptModuleInput) {
        this.assertNamespaceAvailable(input.namespace)
        return this.withAssets(this.store.promptModule.create(input))
    }

    update(id: string, input: PromptModuleInput) {
        this.assertNamespaceAvailable(input.namespace, id)
        const module = this.store.promptModule.update(id, input)
        return module ? this.withAssets(module) : null
    }

    delete(id: string) {
        return this.store.promptModule.delete(id)
    }

    async import(
        input: Uint8Array | ByteSource,
        filename: string,
        onProgress: ImportProgress = () => {},
    ) {
        const decoded = filename.toLocaleLowerCase().endsWith('.charx')
            ? await this.importCharx(input, filename)
            : await importPromptModule(input, filename, this.config.limits)
        this.assertNamespaceAvailable(decoded.input.namespace)
        // Store assets before the module row so a corrupt entry cannot leave a partial module.
        const stored = []
        const total = decoded.assets.length
        if (total) onProgress({ stage: 'assets', done: 0, total })
        for (const imported of decoded.assets) {
            const asset = await this.assetStore.put(await imported.read(), imported.mimeType)
            stored.push({ asset, imported })
            onProgress({ stage: 'assets', done: stored.length, total })
        }
        const module = this.store.promptModule.create(
            decoded.input,
            decoded.source,
            decoded.warnings,
        )
        const links = stored.map(({ asset, imported }) => ({
            id: crypto.randomUUID(),
            moduleId: module.id,
            assetId: asset.id,
            type: imported.type,
            name: imported.name,
            extension: imported.extension,
            sourceUri: imported.sourceUri,
        }))
        this.store.promptModuleAsset.replace(module.id, links)
        return this.withAssets(module)
    }

    async export(id: string, format: 'json' | 'risum' | 'charx') {
        const module = this.store.promptModule.get(id)
        if (!module) return null
        const source = this.store.promptModule.source(id)
        const input = {
            name: module.name,
            description: module.description,
            namespace: module.namespace,
            sourceId: module.sourceId,
            enabledByDefault: module.enabledByDefault,
            runtimeOrder: module.runtimeOrder,
            luaScript: module.luaScript,
            luaRawTriggers: module.luaRawTriggers,
            prompts: module.prompts,
            toggles: module.toggles,
            regexScripts: module.regexScripts,
            backgroundEmbedding: module.backgroundEmbedding,
            lorebook: module.lorebook,
        }
        const moduleAssets = await Promise.all(
            this.store.promptModuleAsset.list(id).map(async (link) => {
                const asset = this.store.asset.get(link.assetId)
                const bytes = await this.assetStore.read(link.assetId)
                return asset && bytes
                    ? {
                          bytes,
                          mimeType: asset.mimeType,
                          type: link.type,
                          name: link.name,
                          extension: link.extension,
                          sourceUri: link.sourceUri,
                      }
                    : null
            }),
        )
        const availableAssets = moduleAssets.filter((asset) => asset !== null)
        return format === 'charx'
            ? exportCharacterCard(
                  { card: moduleCard(input), assets: availableAssets },
                  'v3',
                  'charx',
              ).bytes
            : exportPromptModule(input, format, availableAssets, source)
    }

    conversationStates(conversationId: string) {
        return conversationModuleStates(this.store, conversationId).map((state) => ({
            ...state,
            module: this.withAssets(state.module),
        }))
    }

    setConversationState(conversationId: string, moduleId: string, enabled: boolean | null) {
        if (!this.store.promptModule.get(moduleId)) return false
        this.store.transaction(() => {
            if (enabled === null) this.store.conversationModule.reset(conversationId, moduleId)
            else this.store.conversationModule.set(conversationId, moduleId, enabled)
            this.store.message.bumpDisplayEpoch(conversationId)
        })
        return true
    }

    private assertNamespaceAvailable(namespace: string, excludingId?: string) {
        if (!namespace) return
        const existing = this.store.promptModule.findByNamespace(namespace)
        if (existing && existing.id !== excludingId) {
            throw new PromptModuleConflictError(`Module namespace ${namespace} is already in use`)
        }
    }

    private withAssets(module: NonNullable<ReturnType<Store['promptModule']['get']>>) {
        return {
            ...module,
            assets: this.store.promptModuleAsset.list(module.id).flatMap((link) => {
                const asset = this.store.asset.get(link.assetId)
                return asset
                    ? [
                          {
                              assetId: asset.id,
                              type: link.type,
                              name: link.name,
                              extension: link.extension,
                              sourceUri: link.sourceUri,
                              mimeType: asset.mimeType,
                              size: asset.size,
                          },
                      ]
                    : []
            }),
        }
    }

    private async importCharx(input: Uint8Array | ByteSource, filename: string) {
        const imported = await importCharacterCard(input, filename, this.config)
        const data = imported.card.data
        const risu = record(data.extensions?.risuai)
        const source = {
            type: 'risuModule',
            name: data.name,
            description: data.creator_notes,
            id: crypto.randomUUID(),
            namespace: stringValue(risu.moduleNamespace),
            customModuleToggle: stringValue(risu.toggles),
            regex: risu.customScripts,
            trigger: risu.triggerscript,
            backgroundEmbedding: risu.backgroundHTML,
            lowLevelAccess: risu.lowLevelAccess,
            assets: data.assets,
            lorebook: (data.character_book?.entries || []).map((entry) => ({
                id: entry.id,
                key: entry.keys?.join(', ') || '',
                secondkey: entry.secondary_keys?.join(', ') || '',
                insertorder: entry.insertion_order,
                comment: entry.name || entry.comment,
                content: entry.content,
                mode: entry.constant ? 'constant' : 'normal',
                alwaysActive: entry.constant,
                selective: entry.selective,
                useRegex: entry.use_regex,
                extentions: { risu_case_sensitive: entry.case_sensitive },
            })),
        }
        const decoded = await importPromptModule(
            new TextEncoder().encode(JSON.stringify(source)),
            'module.json',
            this.config.limits,
        )
        return {
            ...decoded,
            source: imported.card as unknown as Record<string, unknown>,
            warnings: [...decoded.warnings, ...imported.warnings],
            assets: imported.assets,
        }
    }
}

function moduleCard(input: PromptModuleInput): CharacterCardV3 {
    const entries: NonNullable<NonNullable<CharacterCardV3['data']['character_book']>['entries']> =
        input.lorebook.map((entry, index) => ({
            id: index,
            keys: entry.keys,
            secondary_keys: entry.secondaryKeys,
            content: entry.content,
            enabled: entry.enabled,
            constant: entry.constant,
            selective: entry.selective,
            case_sensitive: entry.caseSensitive,
            use_regex: entry.useRegex,
            insertion_order: entry.insertionOrder,
            priority: entry.priority,
            name: entry.name,
            extensions: {},
        }))
    for (const prompt of input.prompts) {
        if (!prompt.enabled) continue
        const content = prompt.toggleKey
            ? `{{#when::toggle::${prompt.toggleKey}}}\n${prompt.content}\n{{/when}}`
            : prompt.content
        entries.push({
            id: entries.length,
            keys: [],
            content: `@@indicator ${indicator(prompt.position)}\n\n${content}`,
            enabled: true,
            constant: true,
            selective: false,
            case_sensitive: false,
            use_regex: false,
            insertion_order: 100,
            name: prompt.name,
            extensions: {},
        })
    }
    return {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: input.name,
            description: '',
            personality: '',
            scenario: '',
            first_mes: '',
            mes_example: '',
            creator_notes: input.description,
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [],
            creator: '',
            character_version: '1.0',
            group_only_greetings: [],
            extensions: {
                risuai: {
                    toggles: serializeRisuModuleToggles(input.toggles || []),
                    moduleNamespace: input.namespace || undefined,
                    customScripts: toRisuRegexScripts(input.regexScripts || []),
                    lowLevelAccess: input.luaScript?.lowLevelAccess === true,
                    triggerscript: mergeLuaTriggers(input.luaRawTriggers, input.luaScript),
                    backgroundHTML: input.backgroundEmbedding || '',
                },
            },
            character_book: { entries, extensions: {} },
            assets: [],
        },
    }
}

function indicator(position: PromptModuleInput['prompts'][number]['position']) {
    if (position === 'afterChat') return 'replace_global_note'
    if (position === 'beforeChat') return 'character_first_message'
    return 'character_desc'
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}
