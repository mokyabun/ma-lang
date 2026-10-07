import type { Character, CharacterUpdate, LoreEntry, LuaScriptInput } from '@malang/shared'
import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { asc, desc, eq, isNull } from 'drizzle-orm'

import { characterAssets, characterLoreEntries, characters, conversations } from '../schema'
import {
    insertBatches,
    iso,
    mapLuaScript,
    newLuaColumns,
    RepositoryBase,
    requireValue,
    updateLuaColumns,
} from './base'

export interface CharacterRecord extends Character {
    sourceExtensions: Record<string, unknown>
    sourceCard: Record<string, unknown>
    loreSettings: { scanDepth?: number; tokenBudget?: number; recursiveScanning?: boolean }
    regexScripts: Character['regexScripts']
    moduleReferences: string[]
    luaRawTriggers: unknown[]
    /** Card `extensions` per lore entry id, without Malang's own fields. */
    loreExtensions?: Record<string, Record<string, unknown>>
}

export interface NewCharacterRecord {
    id: string
    name: string
    description: string
    personality: string
    scenario: string
    firstMessage: string
    alternateGreetings: string[]
    exampleMessage: string
    systemPrompt: string
    postHistoryInstructions: string
    creator: string
    characterVersion: string
    tags: string[]
    avatarAssetId: string | null
    sourceSpec: 'v2' | 'v3'
    sourceExtensions: Record<string, unknown>
    sourceCard: Record<string, unknown>
    loreSettings: { scanDepth?: number; tokenBudget?: number; recursiveScanning?: boolean }
    regexScripts: Character['regexScripts']
    moduleReferences: string[]
    defaultVariables?: Record<string, string>
    luaScript?: LuaScriptInput | null
    luaRawTriggers?: unknown[]
    lorebook: Array<Omit<LoreEntry, 'id'> & { id?: string; extensions?: Record<string, unknown> }>
}

export interface CharacterAssetRecord {
    id: string
    characterId: string
    assetId: string
    type: string
    name: string
    extension: string
    sourceUri: string
}

export class CharacterRepository extends RepositoryBase {
    create(
        input: NewCharacterRecord,
        linkedAssets: CharacterAssetRecord[],
        sortOrder: number,
    ): CharacterRecord {
        const now = new Date()
        this.db.transaction((tx) => {
            tx.insert(characters)
                .values({
                    id: input.id,
                    name: input.name,
                    description: input.description,
                    personality: input.personality,
                    scenario: input.scenario,
                    firstMessage: input.firstMessage,
                    alternateGreetingsJson: input.alternateGreetings,
                    exampleMessage: input.exampleMessage,
                    systemPrompt: input.systemPrompt,
                    postHistoryInstructions: input.postHistoryInstructions,
                    creator: input.creator,
                    characterVersion: input.characterVersion,
                    tagsJson: input.tags,
                    avatarAssetId: input.avatarAssetId,
                    sourceSpec: input.sourceSpec,
                    sourceExtensionsJson: input.sourceExtensions,
                    sourceCardJson: input.sourceCard,
                    loreSettingsJson: input.loreSettings,
                    regexScriptsJson: input.regexScripts,
                    moduleReferencesJson: input.moduleReferences,
                    defaultVariablesJson: input.defaultVariables || {},
                    ...newLuaColumns(input.luaScript),
                    luaRawTriggerJson: input.luaRawTriggers || [],
                    groupId: null,
                    sortOrder,
                    archivedAt: null,
                    createdAt: now,
                    updatedAt: now,
                })
                .run()
            const loreRows = input.lorebook.map((entry) => ({
                id: entry.id || crypto.randomUUID(),
                characterId: input.id,
                keysJson: entry.keys,
                secondaryKeysJson: entry.secondaryKeys,
                content: entry.content,
                enabled: entry.enabled,
                constant: entry.constant,
                selective: entry.selective,
                caseSensitive: entry.caseSensitive,
                useRegex: entry.useRegex,
                insertionOrder: entry.insertionOrder,
                priority: entry.priority,
                name: entry.name,
                extensionsJson: loreExtensions(entry),
            }))
            for (const batch of insertBatches(loreRows)) {
                tx.insert(characterLoreEntries).values(batch).run()
            }
            for (const batch of insertBatches(linkedAssets)) {
                tx.insert(characterAssets).values(batch).run()
            }
        })
        return requireValue(this.get(input.id), 'Failed to create character')
    }

    list(includeArchived = false): CharacterRecord[] {
        const query = this.db
            .select()
            .from(characters)
            .orderBy(asc(characters.sortOrder), desc(characters.updatedAt))
        const rows = includeArchived
            ? query.all()
            : query.where(isNull(characters.archivedAt)).all()
        return rows.map((row) => this.mapCharacter(row, false))
    }

    get(id: string): CharacterRecord | null {
        const row = this.db.select().from(characters).where(eq(characters.id, id)).get()
        return row ? this.mapCharacter(row, true) : null
    }

    update(id: string, update: CharacterUpdate): CharacterRecord | null {
        if (id === GENERAL_CHAT_CHARACTER_ID) return null
        const current = this.get(id)
        if (!current) return null
        const patch: Partial<typeof characters.$inferInsert> = {}
        if (update.name !== undefined) patch.name = update.name
        if (update.description !== undefined) patch.description = update.description
        if (update.personality !== undefined) patch.personality = update.personality
        if (update.scenario !== undefined) patch.scenario = update.scenario
        if (update.firstMessage !== undefined) patch.firstMessage = update.firstMessage
        if (update.alternateGreetings !== undefined)
            patch.alternateGreetingsJson = update.alternateGreetings
        if (update.exampleMessage !== undefined) patch.exampleMessage = update.exampleMessage
        if (update.systemPrompt !== undefined) patch.systemPrompt = update.systemPrompt
        if (update.postHistoryInstructions !== undefined)
            patch.postHistoryInstructions = update.postHistoryInstructions
        if (update.creator !== undefined) patch.creator = update.creator
        if (update.characterVersion !== undefined) patch.characterVersion = update.characterVersion
        if (update.tags !== undefined) patch.tagsJson = update.tags
        if (update.regexScripts !== undefined) patch.regexScriptsJson = update.regexScripts
        if (update.moduleReferences !== undefined)
            patch.moduleReferencesJson = update.moduleReferences
        if (update.defaultVariables !== undefined)
            patch.defaultVariablesJson = update.defaultVariables
        if (update.luaScript !== undefined)
            Object.assign(patch, updateLuaColumns(current.luaScript, update.luaScript))
        if (update.loreSettings !== undefined) patch.loreSettingsJson = update.loreSettings
        this.sqlite.transaction(() => {
            this.db.update(characters).set(patch).where(eq(characters.id, id)).run()
            if (update.lorebook !== undefined) {
                const extensions = new Map(
                    this.db
                        .select({
                            id: characterLoreEntries.id,
                            value: characterLoreEntries.extensionsJson,
                        })
                        .from(characterLoreEntries)
                        .where(eq(characterLoreEntries.characterId, id))
                        .all()
                        .map((entry) => [entry.id, entry.value]),
                )
                this.db
                    .delete(characterLoreEntries)
                    .where(eq(characterLoreEntries.characterId, id))
                    .run()
                const loreRows = update.lorebook.map((entry) => ({
                    id: entry.id,
                    characterId: id,
                    keysJson: entry.keys,
                    secondaryKeysJson: entry.secondaryKeys,
                    content: entry.content,
                    enabled: entry.enabled,
                    constant: entry.constant,
                    selective: entry.selective,
                    caseSensitive: entry.caseSensitive,
                    useRegex: entry.useRegex,
                    insertionOrder: entry.insertionOrder,
                    priority: entry.priority,
                    name: entry.name,
                    extensionsJson: {
                        ...extensions.get(entry.id),
                        ...loreExtensions(entry),
                    },
                }))
                for (const batch of insertBatches(loreRows)) {
                    this.db.insert(characterLoreEntries).values(batch).run()
                }
            }
        })()
        return this.get(id)
    }

    archive(id: string): boolean {
        if (id === GENERAL_CHAT_CHARACTER_ID) return false
        if (!this.get(id)) return false
        this.db
            .update(characters)
            .set({ archivedAt: new Date() })
            .where(eq(characters.id, id))
            .run()
        return true
    }

    delete(id: string): boolean {
        if (id === GENERAL_CHAT_CHARACTER_ID) return false
        if (!this.get(id)) return false
        this.db.transaction((tx) => {
            tx.delete(conversations).where(eq(conversations.characterId, id)).run()
            tx.delete(characters).where(eq(characters.id, id)).run()
        })
        return true
    }

    restore(id: string): boolean {
        const character = this.get(id)
        if (!character) return false
        this.db.update(characters).set({ archivedAt: null }).where(eq(characters.id, id)).run()
        return true
    }

    setAvatar(id: string, assetId: string | null): CharacterRecord | null {
        if (id === GENERAL_CHAT_CHARACTER_ID) return null
        if (!this.get(id)) return null
        this.db
            .update(characters)
            .set({ avatarAssetId: assetId })
            .where(eq(characters.id, id))
            .run()
        return this.get(id)
    }

    private mapCharacter(
        row: typeof characters.$inferSelect,
        includeLore: boolean,
    ): CharacterRecord {
        const loreRows = includeLore
            ? this.db
                  .select()
                  .from(characterLoreEntries)
                  .where(eq(characterLoreEntries.characterId, row.id))
                  .orderBy(asc(characterLoreEntries.insertionOrder))
                  .all()
            : undefined
        const lorebook = loreRows
            ? loreRows.map((entry) => {
                  const extensions = entry.extensionsJson
                  return {
                      id: entry.id,
                      keys: entry.keysJson,
                      secondaryKeys: entry.secondaryKeysJson,
                      content: entry.content,
                      enabled: entry.enabled,
                      constant: entry.constant,
                      selective: entry.selective,
                      caseSensitive: entry.caseSensitive,
                      useRegex: entry.useRegex,
                      insertionOrder: entry.insertionOrder,
                      priority: entry.priority,
                      name: entry.name,
                      ...loreFieldsFromExtensions(extensions),
                  }
              })
            : undefined
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            personality: row.personality,
            scenario: row.scenario,
            firstMessage: row.firstMessage,
            alternateGreetings: row.alternateGreetingsJson,
            exampleMessage: row.exampleMessage,
            systemPrompt: row.systemPrompt,
            postHistoryInstructions: row.postHistoryInstructions,
            creator: row.creator,
            characterVersion: row.characterVersion,
            tags: row.tagsJson,
            avatarAssetId: row.avatarAssetId,
            sourceSpec: row.sourceSpec,
            archivedAt: iso(row.archivedAt),
            groupId: row.groupId,
            sortOrder: row.sortOrder,
            lorebook,
            loreExtensions: loreRows
                ? Object.fromEntries(
                      loreRows.map((entry) => [
                          entry.id,
                          Object.fromEntries(
                              Object.entries(entry.extensionsJson).filter(
                                  ([key]) => !key.startsWith('malang_'),
                              ),
                          ),
                      ]),
                  )
                : undefined,
            sourceExtensions: row.sourceExtensionsJson,
            sourceCard: row.sourceCardJson,
            loreSettings: row.loreSettingsJson,
            regexScripts: row.regexScriptsJson,
            moduleReferences: row.moduleReferencesJson,
            defaultVariables: row.defaultVariablesJson,
            luaScript: mapLuaScript(row),
            luaRawTriggers: row.luaRawTriggerJson,
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
        }
    }
}

export function loreFieldsFromExtensions(extensions: Record<string, unknown>) {
    return {
        position: stringValue(extensions.malang_position),
        depth: numberValue(extensions.malang_depth, 0),
        role: modelRole(extensions.malang_role),
        scanDepth: optionalNumber(extensions.malang_scan_depth),
        recursive: recursiveValue(extensions.malang_recursive),
        probability: numberValue(extensions.malang_probability, 100),
        additionalKeys: stringArray(extensions.malang_additional_keys),
        excludeKeys: stringArray(extensions.malang_exclude_keys),
        fullWordMatching:
            typeof extensions.malang_full_word_matching === 'boolean'
                ? extensions.malang_full_word_matching
                : undefined,
        decorators: isRecord(extensions.malang_decorators) ? extensions.malang_decorators : {},
        group: optionalString(extensions.malang_group),
        isGroup:
            typeof extensions.malang_is_group === 'boolean' ? extensions.malang_is_group : false,
    }
}

function loreExtensions(entry: Omit<LoreEntry, 'id'> & { extensions?: Record<string, unknown> }) {
    return {
        ...entry.extensions,
        malang_position: entry.position,
        malang_depth: entry.depth,
        malang_role: entry.role,
        malang_scan_depth: entry.scanDepth,
        malang_recursive: entry.recursive,
        malang_probability: entry.probability,
        malang_additional_keys: entry.additionalKeys,
        malang_exclude_keys: entry.excludeKeys,
        malang_full_word_matching: entry.fullWordMatching,
        malang_decorators: entry.decorators,
        malang_group: entry.group,
        malang_is_group: entry.isGroup,
    }
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length ? value : undefined
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
}

function modelRole(value: unknown): 'user' | 'assistant' | 'system' {
    return value === 'user' || value === 'assistant' ? value : 'system'
}

function recursiveValue(value: unknown): 'global' | 'enabled' | 'disabled' {
    return value === 'enabled' || value === 'disabled' ? value : 'global'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
