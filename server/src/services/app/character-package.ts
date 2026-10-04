import { Buffer } from 'node:buffer'

import { unzipSync, zipSync } from 'fflate'
import * as textChunk from 'png-chunk-text'
import encodeChunks from 'png-chunks-encode'
import extractChunks from 'png-chunks-extract'

import type { AppConfig } from '@/config'
import { ValidationError } from '@/errors/app-error'
import { mimeFromExtension } from '@/services/import/mime'

const decoder = new TextDecoder()
const encoder = new TextEncoder()
const emptyPng = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
    ),
)

export interface PocketRisuPackageMessage {
    role: 'user' | 'assistant'
    content: string
}

export interface PocketRisuPackageChat {
    title: string
    greetingIndex: number
    firstMessageDisabled: boolean
    authorNote: string
    variables: Record<string, string>
    boundPersonaId: string | null
    folderId: string | null
    messages: PocketRisuPackageMessage[]
}

export interface PocketRisuPackageChatGroup {
    originalId: string
    name: string
}

export interface PocketRisuPackagePersona {
    originalId: string
    name: string
    description: string
    note: string
    avatar: Uint8Array
}

export interface PocketRisuPackageInlay {
    id: string
    bytes: Uint8Array
    extension: string
    mimeType: string
}

export interface PocketRisuCharacterPackage {
    characterName: string
    characterFile: { bytes: Uint8Array; filename: string } | null
    chats: PocketRisuPackageChat[]
    chatGroups: PocketRisuPackageChatGroup[]
    personas: PocketRisuPackagePersona[]
    inlays: PocketRisuPackageInlay[]
    warnings: string[]
}

export interface ExportPocketRisuCharacterPackageInput {
    characterName: string
    characterCard: Uint8Array
    chats: Array<{
        id: string
        name: string
        note: string
        fmIndex: number
        firstMessageDisabled: boolean
        folderId: string | null
        bindedPersona: string | null
        scriptstate: Record<string, string>
        messages: PocketRisuPackageMessage[]
    }>
    chatGroups: Array<{ id: string; name: string }>
    personas: Array<{
        id: string
        name: string
        description: string
        note: string
        avatar?: Uint8Array
    }>
    inlays: PocketRisuPackageInlay[]
}

interface PackageManifest {
    character: { name: string; file: string; isEmpty: boolean }
    chats?: { file: string }
    personas: Array<{ name: string; originalId: string; file: string; note: string }>
    inlays?: { metaFile: string; files: string[] }
}

export class CharacterPackageFormatError extends ValidationError {
    constructor(message: string) {
        super(message)
        this.name = 'CharacterPackageFormatError'
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function normalizePath(value: string): { path: string; directory: boolean } | null {
    if (!value || value.includes('\0')) return null
    const path = value.replaceAll('\\', '/')
    if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return null
    const directory = path.endsWith('/')
    const parts: string[] = []
    for (const part of path.split('/')) {
        if (!part || part === '.') continue
        if (part === '..') return null
        parts.push(part)
    }
    return parts.length ? { path: parts.join('/'), directory } : null
}

function parseJson(bytes: Uint8Array, label: string, maxBytes: number): unknown {
    if (bytes.byteLength > maxBytes) throw new CharacterPackageFormatError(`${label} is too large`)
    try {
        return JSON.parse(decoder.decode(bytes))
    } catch {
        throw new CharacterPackageFormatError(`${label} contains invalid JSON`)
    }
}

function packageEntries(bytes: Uint8Array, config: AppConfig): Record<string, Uint8Array> {
    if (bytes.byteLength > config.limits.importBytes)
        throw new CharacterPackageFormatError('Character package is too large')

    let count = 0
    let expandedBytes = 0
    const paths = new Set<string>()
    try {
        const entries = unzipSync(bytes, {
            filter: (file) => {
                count += 1
                if (count > config.limits.archiveEntries)
                    throw new CharacterPackageFormatError('Character package has too many entries')
                const normalized = normalizePath(file.name)
                if (!normalized)
                    throw new CharacterPackageFormatError(`Unsafe package path: ${file.name}`)
                if (normalized.directory) return false
                if (paths.has(normalized.path))
                    throw new CharacterPackageFormatError(`Duplicate package path: ${file.name}`)
                paths.add(normalized.path)
                if (file.originalSize > config.limits.importBytes)
                    throw new CharacterPackageFormatError(
                        `Package entry is too large: ${file.name}`,
                    )
                if (file.size > 0 && file.originalSize / file.size > 100)
                    throw new CharacterPackageFormatError(
                        `Suspicious package compression ratio: ${file.name}`,
                    )
                expandedBytes += file.originalSize
                if (expandedBytes > config.limits.importBytes)
                    throw new CharacterPackageFormatError('Expanded character package is too large')
                return true
            },
        })
        return Object.fromEntries(
            Object.entries(entries).map(([path, value]) => [normalizePath(path)!.path, value]),
        )
    } catch (error) {
        if (error instanceof CharacterPackageFormatError) throw error
        throw new CharacterPackageFormatError('Invalid PocketRisu character package ZIP')
    }
}

function manifestFrom(value: unknown): PackageManifest {
    const source = record(value)
    const character = record(source?.character)
    if (source?.type !== 'risuCharacterPackage' || source.version !== 1 || !character) {
        throw new CharacterPackageFormatError('Invalid PocketRisu character package manifest')
    }
    const personas = Array.isArray(source.personas)
        ? source.personas.flatMap((value) => {
              const persona = record(value)
              const file = stringValue(persona?.file)
              if (!persona || !file) return []
              return [
                  {
                      name: stringValue(persona.name),
                      originalId: stringValue(persona.originalId),
                      file,
                      note: stringValue(persona.note),
                  },
              ]
          })
        : []
    const chats = record(source.chats)
    const inlays = record(source.inlays)
    return {
        character: {
            name: stringValue(character.name),
            file: stringValue(character.file),
            isEmpty: character.isEmpty === true,
        },
        chats: chats && stringValue(chats.file) ? { file: stringValue(chats.file) } : undefined,
        personas,
        inlays:
            inlays && Array.isArray(inlays.files)
                ? {
                      metaFile: stringValue(inlays.metaFile),
                      files: inlays.files.filter(
                          (value): value is string => typeof value === 'string',
                      ),
                  }
                : undefined,
    }
}

function entryAt(entries: Record<string, Uint8Array>, path: string): Uint8Array | undefined {
    const normalized = normalizePath(path)
    return normalized && !normalized.directory ? entries[normalized.path] : undefined
}

function personaData(bytes: Uint8Array, maxBytes: number) {
    try {
        for (const chunk of extractChunks(bytes)) {
            if (chunk.name !== 'tEXt') continue
            const decoded = textChunk.decode(chunk.data)
            if (decoded.keyword !== 'persona') continue
            const json = Uint8Array.from(Buffer.from(decoded.text, 'base64'))
            const value = record(parseJson(json, 'Persona metadata', maxBytes))
            if (!value) return null
            return {
                name: stringValue(value.name),
                description: stringValue(value.personaPrompt),
                note: stringValue(value.note),
            }
        }
    } catch {
        return null
    }
    return null
}

function stringMap(value: unknown): Record<string, string> {
    const source = record(value)
    if (!source) return {}
    return Object.fromEntries(
        Object.entries(source).map(([key, item]) => [
            key,
            typeof item === 'string' ? item : String(item),
        ]),
    )
}

function chatsFrom(bytes: Uint8Array, maxBytes: number, warnings: string[]) {
    const source = record(parseJson(bytes, 'Package chats', maxBytes))
    if (source?.type !== 'risuAllChats' || source.ver !== 2 || !Array.isArray(source.data)) {
        warnings.push('PocketRisu chat data was invalid and was skipped')
        return { chats: [], groups: [] }
    }
    const chats = source.data.flatMap((value, index): PocketRisuPackageChat[] => {
        const chat = record(value)
        if (!chat) {
            warnings.push(`PocketRisu chat ${index + 1} was invalid and was skipped`)
            return []
        }
        const messages = Array.isArray(chat.message)
            ? chat.message.flatMap((value): PocketRisuPackageMessage[] => {
                  const message = record(value)
                  if (!message) return []
                  const role = message.role
                  if ((role !== 'user' && role !== 'char') || typeof message.data !== 'string')
                      return []
                  return [{ role: role === 'char' ? 'assistant' : 'user', content: message.data }]
              })
            : []
        const greetingIndex =
            typeof chat.fmIndex === 'number' && Number.isInteger(chat.fmIndex) && chat.fmIndex >= -1
                ? chat.fmIndex
                : -1
        return [
            {
                title: stringValue(chat.name) || `Chat ${index + 1}`,
                greetingIndex,
                firstMessageDisabled: chat.firstMessageDisabled === true,
                authorNote: stringValue(chat.note),
                variables: { ...stringMap(chat.scriptstate), ...stringMap(chat.savedToggleValues) },
                boundPersonaId: stringValue(chat.bindedPersona) || null,
                folderId: stringValue(chat.folderId) || null,
                messages,
            },
        ]
    })
    const groups = Array.isArray(source.folders)
        ? source.folders.flatMap((value): PocketRisuPackageChatGroup[] => {
              const group = record(value)
              const originalId = stringValue(group?.id)
              if (!group || !originalId) return []
              return [{ originalId, name: stringValue(group.name) || 'Imported group' }]
          })
        : []
    return { chats, groups }
}

function safeFilename(value: string): string {
    return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/, '') || 'character'
}

function personaPng(
    avatar: Uint8Array | undefined,
    data: { name: string; description: string; note: string },
): Uint8Array {
    let chunks: ReturnType<typeof extractChunks>
    try {
        chunks = extractChunks(avatar || emptyPng)
    } catch {
        chunks = extractChunks(emptyPng)
    }
    const end = chunks.findIndex((chunk) => chunk.name === 'IEND')
    chunks.splice(
        end === -1 ? chunks.length : end,
        0,
        textChunk.encode(
            'persona',
            Buffer.from(
                JSON.stringify({
                    name: data.name,
                    personaPrompt: data.description,
                    note: data.note,
                }),
            ).toString('base64'),
        ),
    )
    return encodeChunks(chunks)
}

export function exportPocketRisuCharacterPackage(
    input: ExportPocketRisuCharacterPackageInput,
): Uint8Array {
    const characterName = safeFilename(input.characterName)
    const characterPath = `character/${characterName}.charx`
    const archive: Record<string, Uint8Array> = { [characterPath]: input.characterCard }
    const manifest: Record<string, unknown> = {
        type: 'risuCharacterPackage',
        version: 1,
        createdAt: new Date().toISOString(),
        character: { name: input.characterName, file: characterPath },
    }

    if (input.chats.length) {
        const chatPath = 'chats/chats.json'
        archive[chatPath] = encoder.encode(
            JSON.stringify({
                type: 'risuAllChats',
                ver: 2,
                data: input.chats.map((chat) => ({
                    id: chat.id,
                    name: chat.name,
                    note: chat.note,
                    localLore: [],
                    fmIndex: chat.fmIndex,
                    firstMessageDisabled: chat.firstMessageDisabled,
                    folderId: chat.folderId || undefined,
                    bindedPersona: chat.bindedPersona || undefined,
                    scriptstate: chat.scriptstate,
                    message: chat.messages.map((message) => ({
                        role: message.role === 'assistant' ? 'char' : 'user',
                        data: message.content,
                    })),
                })),
                folders: input.chatGroups.map((group) => ({
                    id: group.id,
                    name: group.name,
                    folded: false,
                })),
            }),
        )
        manifest.chats = { count: input.chats.length, file: chatPath }
    }

    if (input.personas.length) {
        const usedNames = new Set<string>()
        manifest.personas = input.personas.map((persona) => {
            const base = safeFilename(persona.name || 'persona')
            let filename = base
            let suffix = 1
            while (usedNames.has(filename)) filename = `${base}_${suffix++}`
            usedNames.add(filename)
            const path = `persona/${filename}.png`
            archive[path] = personaPng(persona.avatar, persona)
            return {
                name: persona.name,
                originalId: persona.id,
                file: path,
                note: persona.note,
            }
        })
    }

    if (input.inlays.length) {
        const files: string[] = []
        const metadata: Record<string, unknown> = {}
        for (const inlay of input.inlays) {
            const path = `inlays/${safeFilename(inlay.id)}.${inlay.extension || 'png'}`
            archive[path] = inlay.bytes
            files.push(path)
            metadata[inlay.id] = {
                name: inlay.id,
                ext: inlay.extension,
                type: 'image',
            }
        }
        archive['inlays/meta.json'] = encoder.encode(JSON.stringify(metadata))
        manifest.inlays = { count: files.length, metaFile: 'inlays/meta.json', files }
    }

    archive['manifest.json'] = encoder.encode(JSON.stringify(manifest, null, 2))
    return zipSync(archive)
}

export function importPocketRisuCharacterPackage(
    bytes: Uint8Array,
    config: AppConfig,
): PocketRisuCharacterPackage {
    const entries = packageEntries(bytes, config)
    const manifestBytes = entries['manifest.json']
    if (!manifestBytes)
        throw new CharacterPackageFormatError('Character package is missing manifest.json')
    const manifest = manifestFrom(
        parseJson(manifestBytes, 'Package manifest', config.limits.jsonBytes),
    )
    const warnings: string[] = []

    let characterFile: PocketRisuCharacterPackage['characterFile'] = null
    if (!manifest.character.isEmpty) {
        const characterBytes = entryAt(entries, manifest.character.file)
        if (!characterBytes)
            throw new CharacterPackageFormatError('Character package is missing its CHARX file')
        characterFile = {
            bytes: characterBytes,
            filename: manifest.character.file.split('/').at(-1) || 'package.charx',
        }
    }

    const chatData = manifest.chats
        ? (() => {
              const value = entryAt(entries, manifest.chats.file)
              if (!value) {
                  warnings.push('PocketRisu chat file was missing and was skipped')
                  return { chats: [], groups: [] }
              }
              return chatsFrom(value, config.limits.importBytes, warnings)
          })()
        : { chats: [], groups: [] }

    const personas = manifest.personas.flatMap((persona): PocketRisuPackagePersona[] => {
        const avatar = entryAt(entries, persona.file)
        if (!avatar) {
            warnings.push(`PocketRisu persona “${persona.name || persona.originalId}” was missing`)
            return []
        }
        if (avatar.byteLength > config.limits.assetBytes)
            throw new CharacterPackageFormatError(
                `PocketRisu persona “${persona.name || persona.originalId}” is too large`,
            )
        const data = personaData(avatar, config.limits.jsonBytes)
        if (!data) {
            warnings.push(`PocketRisu persona “${persona.name || persona.originalId}” was invalid`)
            return []
        }
        return [
            {
                originalId: persona.originalId,
                name: data.name || persona.name || 'Imported persona',
                description: data.description,
                note: data.note || persona.note,
                avatar,
            },
        ]
    })

    const inlays = (manifest.inlays?.files || []).flatMap((path): PocketRisuPackageInlay[] => {
        const value = entryAt(entries, path)
        if (!value) {
            warnings.push(`PocketRisu inlay “${path}” was missing`)
            return []
        }
        if (value.byteLength > config.limits.assetBytes)
            throw new CharacterPackageFormatError(`PocketRisu inlay “${path}” is too large`)
        const filename = path.split('/').at(-1) || ''
        const dot = filename.lastIndexOf('.')
        const id = dot > 0 ? filename.slice(0, dot) : filename
        const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : 'png'
        if (!id) return []
        return [{ id, bytes: value, extension, mimeType: mimeFromExtension(extension) }]
    })

    return {
        characterName: manifest.character.name || 'Imported character',
        characterFile,
        chats: chatData.chats,
        chatGroups: chatData.groups,
        personas,
        inlays,
        warnings,
    }
}
