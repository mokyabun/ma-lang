import type { CharacterCreate, CharacterUpdate } from '@malang/shared'
import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import type { CharacterCardV3 } from '@risuai/ccardlib'

import type { AppConfig } from '@/config'
import {
    type CharacterAssetRecord,
    loreFieldsFromExtensions,
    type NewCharacterRecord,
    type Store,
} from '@/db'
import { ValidationError } from '@/errors/app-error'
import {
    type ByteSource,
    type ImportProgress,
    type LazyAsset,
    readAll,
    toByteSource,
} from '@/services/import/source'
import { exportPromptModule } from '@/services/prompt/module-codec'
import {
    mergeLuaTriggers,
    normalizeLuaTriggers,
    normalizeRegexScripts,
    parseBiasEntries,
    parseKeyValueVariables,
    record,
    serializeKeyValueVariables,
    stringArray,
    toRisuRegexScripts,
} from '@/services/prompt/risu'

import type { AssetStore } from './assets'
import {
    type ExportableCard,
    type ImportedCard,
    exportCharacterCard,
    importCharacterCard,
} from './character-card'
import {
    exportPocketRisuCharacterPackage,
    importPocketRisuCharacterPackage,
} from './character-package'
import type { ConversationService } from './conversations'

export class CharacterService {
    constructor(
        private readonly config: AppConfig,
        private readonly store: Store,
        private readonly assetStore: AssetStore,
        private readonly conversations: ConversationService,
    ) {}

    /** Seeds the built-in general-purpose Chat character, restoring it if it was archived. */
    ensureGeneralChat() {
        const existing = this.store.character.get(GENERAL_CHAT_CHARACTER_ID)
        if (!existing) return this.createRecord(generalChatRecord(), [])
        if (existing.archivedAt) this.store.character.restore(existing.id)
        return this.store.character.get(existing.id) ?? existing
    }

    createGroup(name: string) {
        return this.store.transaction(() =>
            this.store.characterGroup.create(
                name,
                this.store.characterOrganization.nextRootOrder(),
            ),
        )
    }

    list(includeArchived = false) {
        return this.store.character.list(includeArchived)
    }

    get(id: string) {
        return this.store.character.get(id)
    }

    create(input: CharacterCreate) {
        const id = crypto.randomUUID()
        const sourceCard = {
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: input.name,
                description: input.description,
                personality: input.personality,
                scenario: input.scenario,
                first_mes: input.firstMessage,
                alternate_greetings: input.alternateGreetings,
                mes_example: input.exampleMessage,
                system_prompt: input.systemPrompt,
                post_history_instructions: input.postHistoryInstructions,
                creator: input.creator,
                character_version: input.characterVersion,
                tags: input.tags,
                creator_notes: '',
                group_only_greetings: [],
                extensions: {},
            },
        }
        return this.createRecord(
            {
                id,
                ...input,
                avatarAssetId: null,
                sourceSpec: 'v3',
                sourceExtensions: {},
                sourceCard,
                loreSettings: input.loreSettings,
                regexScripts: input.regexScripts || [],
                moduleReferences: input.moduleReferences || [],
            },
            [],
        )
    }

    update(id: string, update: CharacterUpdate) {
        return this.store.character.update(id, update)
    }

    archive(id: string) {
        return this.store.character.archive(id)
    }

    delete(id: string) {
        return this.store.character.delete(id)
    }

    restore(id: string) {
        return this.store.character.restore(id)
    }

    async setAvatar(id: string, bytes: Uint8Array, mimeType: string) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
            throw new ValidationError('Avatar must be a PNG, JPEG, WebP, or GIF image')
        }
        if (!this.store.character.get(id)) return null
        const asset = await this.assetStore.put(bytes, mimeType)
        return this.store.character.setAvatar(id, asset.id)
    }

    removeAvatar(id: string) {
        return this.store.character.setAvatar(id, null)
    }

    assets(id: string) {
        const character = this.store.character.get(id)
        if (!character) return null
        const linked = this.store.characterAsset.list(id).flatMap((link) => {
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
        })
        if (
            character.avatarAssetId &&
            !linked.some((asset) => asset.assetId === character.avatarAssetId)
        ) {
            const avatar = this.store.asset.get(character.avatarAssetId)
            if (avatar) {
                linked.unshift({
                    assetId: avatar.id,
                    type: 'icon',
                    name: 'main',
                    extension: extensionForMime(avatar.mimeType),
                    sourceUri: 'ccdefault:',
                    mimeType: avatar.mimeType,
                    size: avatar.size,
                })
            }
        }
        return linked
    }

    async import(
        input: Uint8Array | ByteSource,
        filename: string,
        onProgress: ImportProgress = () => {},
    ) {
        const imported = await importCharacterCard(input, filename, this.config)
        return this.persistImportedCard(imported, onProgress)
    }

    async importPackage(input: Uint8Array | ByteSource, onProgress: ImportProgress = () => {}) {
        // Packages bundle chats and a nested card file, so they are still decoded in memory.
        const importedPackage = importPocketRisuCharacterPackage(
            await readAll(toByteSource(input)),
            this.config,
        )
        const inlayAssets: LazyAsset[] = importedPackage.inlays.map((inlay) => ({
            read: async () => inlay.bytes,
            mimeType: inlay.mimeType,
            type: 'inlay',
            name: inlay.id,
            extension: inlay.extension,
            sourceUri: `inlay:${inlay.id}`,
        }))
        const importedCard: ImportedCard = importedPackage.characterFile
            ? await importCharacterCard(
                  importedPackage.characterFile.bytes,
                  importedPackage.characterFile.filename,
                  this.config,
              )
            : {
                  card: {
                      ...this.blankCard(),
                      data: { ...this.blankCard().data, name: importedPackage.characterName },
                  },
                  sourceSpec: 'v3',
                  assets: [],
                  warnings: [],
              }
        importedCard.assets.push(
            ...inlayAssets.filter(
                (inlay) =>
                    !importedCard.assets.some(
                        (asset) => asset.type === 'inlay' && asset.name === inlay.name,
                    ),
            ),
        )
        const { character, warnings } = await this.persistImportedCard(importedCard, onProgress)
        const createdPersonaIds: string[] = []

        try {
            const personaIds = new Map<string, string>()
            const personas = []
            for (const imported of importedPackage.personas) {
                const persona = this.store.persona.create({
                    name: imported.name,
                    description: imported.description,
                    note: imported.note,
                })
                createdPersonaIds.push(persona.id)
                const avatar = await this.assetStore.put(imported.avatar, 'image/png')
                const saved = this.store.persona.setAvatar(persona.id, avatar.id) || persona
                personas.push(saved)
                if (imported.originalId) personaIds.set(imported.originalId, persona.id)
            }

            const groupIds = new Map<string, string>()
            const conversationGroups = importedPackage.chatGroups.flatMap((imported) => {
                const group = this.conversations.createGroup(character.id, imported.name)
                if (!group) return []
                groupIds.set(imported.originalId, group.id)
                return [group]
            })

            const conversations = importedPackage.chats.map((chat) => {
                const greetingIndex =
                    chat.greetingIndex >= 0 &&
                    character.alternateGreetings[chat.greetingIndex] === undefined
                        ? -1
                        : chat.greetingIndex
                const conversation = this.conversations.create({
                    characterId: character.id,
                    title: chat.title,
                    greetingIndex,
                })
                const greeting =
                    greetingIndex >= 0
                        ? character.alternateGreetings[greetingIndex] || ''
                        : character.firstMessage
                this.store.message.replace(conversation.id, [
                    ...(chat.firstMessageDisabled || !greeting
                        ? []
                        : [{ role: 'assistant' as const, content: greeting }]),
                    ...chat.messages,
                ])
                return (
                    this.store.conversation.update(conversation.id, {
                        authorNote: chat.authorNote,
                        variables: chat.variables,
                        boundPersonaId: chat.boundPersonaId
                            ? personaIds.get(chat.boundPersonaId) || null
                            : null,
                        personaLocked: Boolean(
                            chat.boundPersonaId && personaIds.has(chat.boundPersonaId),
                        ),
                    }) || conversation
                )
            })
            this.store.conversationOrganization.update({
                characterId: character.id,
                groups: conversationGroups.map((group, sortOrder) => ({
                    id: group.id,
                    sortOrder,
                })),
                conversations: conversations.map((conversation, sortOrder) => ({
                    id: conversation.id,
                    groupId: importedPackage.chats[sortOrder]?.folderId
                        ? groupIds.get(importedPackage.chats[sortOrder]!.folderId!) || null
                        : null,
                    sortOrder,
                })),
            })
            const organizedConversations = conversations.map(
                (conversation) => this.store.conversation.get(conversation.id) || conversation,
            )

            return {
                character,
                conversations: organizedConversations,
                conversationGroups: this.store.conversationGroup.list(character.id),
                personas,
                warnings: [...warnings, ...importedPackage.warnings],
            }
        } catch (error) {
            this.store.character.delete(character.id)
            for (const id of createdPersonaIds) this.store.persona.delete(id)
            throw error
        }
    }

    private createRecord(input: NewCharacterRecord, linkedAssets: CharacterAssetRecord[]) {
        return this.store.transaction(() =>
            this.store.character.create(
                input,
                linkedAssets,
                this.store.characterOrganization.nextRootOrder(),
            ),
        )
    }

    private async persistImportedCard(
        imported: ImportedCard,
        onProgress: ImportProgress = () => {},
    ) {
        const id = crypto.randomUUID()
        const avatar = imported.avatar
            ? await this.assetStore.put(await imported.avatar.read(), imported.avatar.mimeType)
            : null
        const linkedAssets = []
        const total = imported.assets.length
        if (total) onProgress({ stage: 'assets', done: 0, total })

        for (const importedAsset of imported.assets) {
            const asset = await this.assetStore.put(
                await importedAsset.read(),
                importedAsset.mimeType,
            )
            linkedAssets.push({
                id: crypto.randomUUID(),
                characterId: id,
                assetId: asset.id,
                type: importedAsset.type,
                name: importedAsset.name,
                extension: importedAsset.extension,
                sourceUri: importedAsset.sourceUri,
            })
            onProgress({ stage: 'assets', done: linkedAssets.length, total })
        }

        const data = imported.card.data
        const risu = record(data.extensions?.risuai)
        const lua = normalizeLuaTriggers(risu.triggerscript, risu.lowLevelAccess)
        const book = data.character_book
        const character = this.createRecord(
            {
                id,
                name: data.name || 'Unnamed',
                description: data.description || '',
                personality: data.personality || '',
                scenario: data.scenario || '',
                firstMessage: data.first_mes || '',
                alternateGreetings: data.alternate_greetings || [],
                exampleMessage: data.mes_example || '',
                systemPrompt: data.system_prompt || '',
                postHistoryInstructions: data.post_history_instructions || '',
                creator: data.creator || '',
                characterVersion: data.character_version || '',
                tags: data.tags || [],
                avatarAssetId: avatar?.id || null,
                sourceSpec: imported.sourceSpec,
                sourceExtensions: data.extensions || {},
                sourceCard: imported.card as unknown as Record<string, unknown>,
                regexScripts: normalizeRegexScripts(risu.customScripts),
                moduleReferences: stringArray(risu.modules),
                defaultVariables: parseKeyValueVariables(risu.defaultVariables),
                bias: parseBiasEntries(risu.bias),
                luaScript: lua.luaScript,
                luaRawTriggers: lua.rawTriggers,
                loreSettings: {
                    scanDepth: book?.scan_depth,
                    tokenBudget: book?.token_budget,
                    recursiveScanning: book?.recursive_scanning,
                },
                lorebook: (book?.entries || []).map((entry) => ({
                    keys: entry.keys || [],
                    secondaryKeys: entry.secondary_keys || [],
                    content: entry.content || '',
                    enabled: entry.enabled !== false,
                    constant: entry.constant === true,
                    selective: entry.selective === true,
                    caseSensitive: entry.case_sensitive === true,
                    useRegex: entry.use_regex === true,
                    insertionOrder: entry.insertion_order || 0,
                    priority: entry.priority || 0,
                    // convertCharbook: an empty-string name still wins over comment.
                    name: entry.name ?? entry.comment ?? '',
                    ...loreFieldsFromExtensions(entry.extensions || {}),
                    extensions: entry.extensions || {},
                })),
            },
            linkedAssets,
        )

        return { character, warnings: [...imported.warnings, ...lua.warnings] }
    }

    async export(id: string, spec: 'v2' | 'v3', format: 'json' | 'png' | 'charx') {
        const character = this.store.character.get(id)
        if (!character) return null
        const loreExtensions = this.store.characterLore.extensions(id)
        const raw = structuredClone(character.sourceCard) as unknown as CharacterCardV3
        const card = raw?.spec === 'chara_card_v3' ? raw : this.blankCard()
        card.spec = 'chara_card_v3'
        card.spec_version = '3.0'
        card.data = {
            ...card.data,
            name: character.name,
            description: character.description,
            personality: character.personality,
            scenario: character.scenario,
            first_mes: character.firstMessage,
            alternate_greetings: character.alternateGreetings,
            mes_example: character.exampleMessage,
            system_prompt: character.systemPrompt,
            post_history_instructions: character.postHistoryInstructions,
            creator: character.creator,
            character_version: character.characterVersion,
            tags: character.tags,
            extensions: {
                ...card.data.extensions,
                ...character.sourceExtensions,
                risuai: {
                    ...record(card.data.extensions?.risuai),
                    ...record(character.sourceExtensions.risuai),
                    customScripts: toRisuRegexScripts(character.regexScripts),
                    modules: character.moduleReferences,
                    defaultVariables: serializeKeyValueVariables(character.defaultVariables),
                    bias: character.bias,
                    triggerscript: mergeLuaTriggers(character.luaRawTriggers, character.luaScript),
                    lowLevelAccess: character.luaScript?.lowLevelAccess === true,
                },
            },
            character_book: {
                scan_depth: character.loreSettings.scanDepth,
                token_budget: character.loreSettings.tokenBudget,
                recursive_scanning: character.loreSettings.recursiveScanning,
                extensions: card.data.character_book?.extensions || {},
                entries: (character.lorebook || []).map((entry) => ({
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
                    extensions: loreExtensions.get(entry.id) || {},
                })),
            },
        }

        const exportable: ExportableCard = { card, assets: [] }
        if (format === 'charx') {
            exportable.risuModule = exportPromptModule(
                {
                    name: `${character.name} Module`,
                    description: `Lorebook for ${character.name}`,
                    namespace: '',
                    sourceId: character.id,
                    enabledByDefault: false,
                    prompts: [],
                    toggles: [],
                    regexScripts: character.regexScripts,
                    backgroundEmbedding: '',
                    runtimeOrder: 0,
                    luaScript: character.luaScript,
                    luaRawTriggers: character.luaRawTriggers,
                    lorebook: character.lorebook || [],
                },
                'risum',
            )
        }
        if (character.avatarAssetId) {
            const asset = this.store.asset.get(character.avatarAssetId)
            const bytes = await this.assetStore.read(character.avatarAssetId)
            if (asset && bytes) {
                exportable.avatar = {
                    bytes,
                    mimeType: asset.mimeType,
                    type: 'icon',
                    name: 'main',
                    extension: extensionForMime(asset.mimeType),
                    sourceUri: 'ccdefault:',
                }
            }
        }

        for (const link of this.store.characterAsset.list(id)) {
            const asset = this.store.asset.get(link.assetId)
            const bytes = await this.assetStore.read(link.assetId)
            if (!asset || !bytes) continue
            exportable.assets.push({
                bytes,
                mimeType: asset.mimeType,
                type: link.type,
                name: link.name,
                extension: link.extension,
                sourceUri: link.sourceUri,
            })
        }
        if (
            format === 'charx' &&
            exportable.avatar &&
            !exportable.assets.some((asset) => asset.type === 'icon' && asset.name === 'main')
        ) {
            exportable.assets.push(exportable.avatar)
        }

        return exportCharacterCard(exportable, spec, format)
    }

    async exportPackage(id: string) {
        const character = this.get(id)
        if (!character) return null
        const card = await this.export(id, 'v3', 'charx')
        if (!card) return null
        const conversations = this.store.conversation
            .list(true)
            .filter((conversation) => conversation.characterId === id)
        const personaIds = new Set(
            conversations.flatMap((conversation) =>
                conversation.boundPersonaId ? [conversation.boundPersonaId] : [],
            ),
        )
        const packageWarnings = [...card.warnings]
        const personas = []
        for (const personaId of personaIds) {
            const persona = this.store.persona.get(personaId)
            if (!persona) continue
            let avatar: Uint8Array | undefined
            if (persona.avatarAssetId) {
                const asset = this.store.asset.get(persona.avatarAssetId)
                if (asset?.mimeType === 'image/png') {
                    avatar = (await this.assetStore.read(persona.avatarAssetId)) || undefined
                } else {
                    packageWarnings.push(
                        `Persona “${persona.name}” used a non-PNG avatar, so the package contains a placeholder`,
                    )
                }
            }
            personas.push({
                id: persona.id,
                name: persona.name,
                description: persona.description,
                note: persona.note,
                avatar,
            })
        }
        const chats = conversations.map((conversation) => {
            const greeting =
                conversation.greetingIndex >= 0
                    ? character.alternateGreetings[conversation.greetingIndex] || ''
                    : character.firstMessage
            const messages = this.store.message.list(conversation.id)
            const hasGreeting =
                Boolean(greeting) &&
                messages[0]?.role === 'assistant' &&
                messages[0]?.content === greeting
            return {
                id: conversation.id,
                name: conversation.title,
                note: conversation.authorNote,
                fmIndex: conversation.greetingIndex,
                firstMessageDisabled: Boolean(greeting) && !hasGreeting,
                folderId: conversation.groupId,
                bindedPersona: conversation.personaLocked ? conversation.boundPersonaId : null,
                scriptstate: conversation.variables,
                messages: (hasGreeting ? messages.slice(1) : messages).map((message) => ({
                    role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
                    content:
                        message.role === 'system'
                            ? `[System]\n${message.content}`
                            : message.content,
                })),
            }
        })
        const inlays = []
        const seenInlays = new Set<string>()
        for (const link of this.store.characterAsset.list(id)) {
            if (link.type !== 'inlay' && !link.sourceUri.startsWith('inlay:')) continue
            const inlayId = link.sourceUri.startsWith('inlay:')
                ? link.sourceUri.slice('inlay:'.length)
                : link.name
            if (!inlayId || seenInlays.has(inlayId)) continue
            const bytes = await this.assetStore.read(link.assetId)
            const asset = this.store.asset.get(link.assetId)
            if (!bytes || !asset) continue
            seenInlays.add(inlayId)
            inlays.push({
                id: inlayId,
                bytes,
                extension: link.extension,
                mimeType: asset.mimeType,
            })
        }

        return {
            bytes: exportPocketRisuCharacterPackage({
                characterName: character.name,
                characterCard: card.bytes,
                chats,
                chatGroups: this.store.conversationGroup.list(id),
                personas,
                inlays,
            }),
            mimeType: 'application/zip',
            extension: 'zip',
            warnings: packageWarnings,
        }
    }

    private blankCard(): CharacterCardV3 {
        return {
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: '',
                description: '',
                tags: [],
                creator: '',
                character_version: '',
                mes_example: '',
                extensions: {},
                system_prompt: '',
                post_history_instructions: '',
                first_mes: '',
                alternate_greetings: [],
                personality: '',
                scenario: '',
                creator_notes: '',
                group_only_greetings: [],
            },
        }
    }
}

function extensionForMime(mimeType: string): string {
    return (
        (
            {
                'image/png': 'png',
                'image/jpeg': 'jpg',
                'image/webp': 'webp',
                'image/gif': 'gif',
            } as Record<string, string>
        )[mimeType] || 'bin'
    )
}

function generalChatRecord(): NewCharacterRecord {
    const systemPrompt =
        'You are Chat, a helpful general-purpose AI assistant. Respond directly and clearly to the user. Do not role-play a fictional character unless the user asks you to.'
    return {
        id: GENERAL_CHAT_CHARACTER_ID,
        name: 'Chat',
        description: 'A helpful general-purpose AI assistant for everyday questions.',
        personality: 'Helpful, clear, practical, and adaptable.',
        scenario: '',
        firstMessage: '',
        alternateGreetings: [],
        exampleMessage: '',
        systemPrompt,
        postHistoryInstructions: '',
        creator: 'Malang',
        characterVersion: '1.0',
        tags: ['built-in', 'general'],
        avatarAssetId: null,
        sourceSpec: 'v3',
        sourceExtensions: { malang: { builtIn: 'general-chat' } },
        sourceCard: {
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: 'Chat',
                description: 'A helpful general-purpose AI assistant for everyday questions.',
                personality: 'Helpful, clear, practical, and adaptable.',
                scenario: '',
                first_mes: '',
                alternate_greetings: [],
                mes_example: '',
                system_prompt: systemPrompt,
                post_history_instructions: '',
                creator: 'Malang',
                character_version: '1.0',
                tags: ['built-in', 'general'],
                creator_notes: '',
                group_only_greetings: [],
                extensions: { malang: { builtIn: 'general-chat' } },
            },
        },
        loreSettings: {},
        regexScripts: [],
        moduleReferences: [],
        lorebook: [],
    }
}
