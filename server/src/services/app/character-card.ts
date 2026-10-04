import { CCardLib, type CharacterCardV2, type CharacterCardV3 } from '@risuai/ccardlib'
import { zipSync } from 'fflate'
import * as textChunk from 'png-chunk-text'
import encodeChunks from 'png-chunks-encode'
import extractChunks from 'png-chunks-extract'

import type { AppConfig } from '@/config'
import { ValidationError } from '@/errors/app-error'
import { type ByteSource, type LazyAsset, readAll, toByteSource } from '@/services/import/source'
import { readZipDirectory, readZipEntry, type ZipEntry } from '@/services/import/zip'
import { readRisum } from '@/services/prompt/module-codec'

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

interface RisuLoreEntry {
    key?: unknown
    secondkey?: unknown
    insertorder?: unknown
    comment?: unknown
    content?: unknown
    mode?: unknown
    alwaysActive?: unknown
    selective?: unknown
    extentions?: unknown
    useRegex?: unknown
    id?: unknown
    folder?: unknown
}

interface RisuModule {
    lorebook?: unknown
    regex?: unknown
    trigger?: unknown
    lowLevelAccess?: unknown
}

/**
 * RisuAI's CHARX export writes the character's lorebook (plus regex/trigger scripts) into a
 * separate `module.risum` entry rather than `card.json`'s `character_book` field. That file uses
 * the same obfuscated container format as standalone .risum module imports, so we reuse the
 * existing decoder rather than re-parsing the format here.
 */
async function readRisuModule(bytes: Uint8Array, config: AppConfig): Promise<RisuModule | null> {
    try {
        const { source } = await readRisum(bytes, config.limits)
        const module = isRecord(source.module) ? source.module : null
        return module as RisuModule | null
    } catch {
        return null
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function splitRisuKeys(value: unknown): string[] {
    return stringValue(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

/**
 * Converts RisuAI's proprietary lorebook entries (from module.risum) into CCv3 character_book
 * entries. RisuAI's "folder" is a purely organizational grouping (not SillyTavern's mutually
 * exclusive activation groups), so folder membership round-trips via extensions only.
 *
 * RisuAI repurposes the `key` field as a folder's identity: `addLorebookFolder()` sets
 * `key: 'folder:' + uuid` on the folder entry, and child entries point back to it via
 * their own `folder` field set to that exact string (see RisuAI's LoreBookList.svelte, which
 * matches children with `item.folder === book.key`). A folder entry's `key` is therefore never
 * real search keywords and must not be surfaced as one.
 */
function risuLorebookToCharacterBookEntries(lorebook: unknown[]) {
    const groupKeys = new Map<string, string>()
    const groupKeyFor = (id: string) => {
        let key = groupKeys.get(id)
        if (!key) {
            key = crypto.randomUUID()
            groupKeys.set(id, key)
        }
        return key
    }
    return lorebook.filter(isRecord).map((value) => {
        const lore = value as RisuLoreEntry
        const extensions = isRecord(lore.extentions) ? lore.extentions : {}
        const selective = lore.selective === true
        const isGroup = lore.mode === 'folder'
        const ownKey = stringValue(lore.key)
        const folderId = stringValue(lore.folder)
        const group = isGroup
            ? ownKey && groupKeyFor(ownKey)
            : folderId
              ? groupKeyFor(folderId)
              : undefined
        return {
            keys: isGroup ? [] : splitRisuKeys(lore.key),
            secondary_keys: selective ? splitRisuKeys(lore.secondkey) : [],
            content: stringValue(lore.content),
            enabled: true,
            insertion_order: typeof lore.insertorder === 'number' ? lore.insertorder : 0,
            constant: lore.alwaysActive === true,
            selective,
            case_sensitive: extensions.risu_case_sensitive === true,
            use_regex: lore.useRegex === true,
            name: stringValue(lore.comment),
            comment: stringValue(lore.comment),
            extensions: {
                malang_group: group || undefined,
                malang_is_group: isGroup,
            },
        }
    })
}
const emptyPng = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
    ),
)

export interface ImportedAsset {
    bytes: Uint8Array
    mimeType: string
    type: string
    name: string
    extension: string
    sourceUri: string
}

export interface ImportedCard {
    card: CharacterCardV3
    sourceSpec: 'v2' | 'v3'
    avatar?: LazyAsset
    assets: LazyAsset[]
    warnings: string[]
}

export interface ExportableCard {
    card: CharacterCardV3
    avatar?: ImportedAsset
    assets: ImportedAsset[]
    risuModule?: Uint8Array
}

export class CardFormatError extends ValidationError {
    constructor(message: string) {
        super(message)
        this.name = 'CardFormatError'
    }
}

function parseJson(bytes: Uint8Array, maxBytes: number): unknown {
    if (bytes.byteLength > maxBytes) throw new CardFormatError('Character card JSON is too large')
    try {
        return JSON.parse(textDecoder.decode(bytes))
    } catch {
        throw new CardFormatError('Character card contains invalid JSON')
    }
}

function normalizeCard(value: unknown): { card: CharacterCardV3; sourceSpec: 'v2' | 'v3' } {
    const version = CCardLib.character.check(value)
    if (version !== 'v2' && version !== 'v3') {
        throw new CardFormatError('Only Character Card v2 and v3 are supported')
    }
    return {
        card: CCardLib.character.convert(value as CharacterCardV2 | CharacterCardV3, {
            from: version,
            to: 'v3',
            options: { convertRisuFields: true, removeDecorators: false },
        }),
        sourceSpec: version,
    }
}

function extensionOf(path: string): string {
    const filename = path.split('/').at(-1) || ''
    const index = filename.lastIndexOf('.')
    return index === -1 ? '' : filename.slice(index + 1).toLowerCase()
}

function mimeFromExtension(extension: string): string {
    return (
        {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            gif: 'image/gif',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            mp4: 'video/mp4',
            webm: 'video/webm',
            json: 'application/json',
        }[extension] || 'application/octet-stream'
    )
}

function normalizeArchivePath(value: string): { path: string; directory: boolean } | null {
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
    if (!parts.length) return null
    return { path: parts.join('/'), directory }
}

function readPng(bytes: Uint8Array, config: AppConfig): ImportedCard {
    let chunks: ReturnType<typeof extractChunks>
    try {
        chunks = extractChunks(bytes)
    } catch {
        throw new CardFormatError('Invalid PNG character card')
    }

    const texts = new Map<string, string>()
    for (const chunk of chunks) {
        if (chunk.name !== 'tEXt') continue
        try {
            const decoded = textChunk.decode(chunk.data)
            if (
                (decoded.keyword === 'ccv3' || decoded.keyword === 'chara') &&
                decoded.text.length <= config.limits.jsonBytes * 2
            ) {
                texts.set(decoded.keyword, decoded.text)
            }
        } catch {
            // Ignore unrelated malformed textual chunks.
        }
    }

    const encoded = texts.get('ccv3') || texts.get('chara')
    if (!encoded) throw new CardFormatError('PNG does not contain a ccv3 or chara chunk')

    let jsonBytes: Uint8Array
    try {
        jsonBytes = Uint8Array.from(Buffer.from(encoded, 'base64'))
    } catch {
        throw new CardFormatError('PNG character data is not valid base64')
    }
    const normalized = normalizeCard(parseJson(jsonBytes, config.limits.jsonBytes))
    return {
        ...normalized,
        avatar: {
            read: async () => bytes,
            mimeType: 'image/png',
            type: 'icon',
            name: 'main',
            extension: 'png',
            sourceUri: 'ccdefault:',
        },
        assets: [],
        warnings: [],
    }
}

// Reads the archive through its central directory: card.json and module.risum (which RisuAI
// writes last) are parsed first, and each referenced asset is extracted only when persisted.
async function readCharx(source: ByteSource, config: AppConfig): Promise<ImportedCard> {
    let directory: ZipEntry[]
    try {
        directory = await readZipDirectory(source)
    } catch {
        throw new CardFormatError('Invalid CHARX archive')
    }
    if (directory.length > config.limits.archiveEntries)
        throw new CardFormatError('CHARX contains too many entries')

    const entries = new Map<string, ZipEntry>()
    let expandedBytes = 0
    for (const file of directory) {
        const normalized = normalizeArchivePath(file.name)
        if (!normalized) throw new CardFormatError(`Unsafe CHARX path: ${file.name}`)
        if (normalized.directory) continue
        if (entries.has(normalized.path))
            throw new CardFormatError(`Duplicate CHARX path: ${normalized.path}`)
        if (file.size > config.limits.assetBytes && file.name !== 'card.json') {
            throw new CardFormatError(`CHARX asset is too large: ${file.name}`)
        }
        if (file.size > config.limits.jsonBytes && file.name === 'card.json') {
            throw new CardFormatError('CHARX card.json is too large')
        }
        if (file.compressedSize > 0 && file.size / file.compressedSize > 100) {
            throw new CardFormatError(`Suspicious CHARX compression ratio: ${file.name}`)
        }
        expandedBytes += file.size
        if (expandedBytes > config.limits.importBytes)
            throw new CardFormatError('Expanded CHARX is too large')
        entries.set(normalized.path, file)
    }

    const readEntry = async (path: string) => {
        const entry = entries.get(path)!
        try {
            return await readZipEntry(source, entry)
        } catch {
            throw new CardFormatError(`Invalid CHARX entry: ${entry.name}`)
        }
    }

    if (!entries.has('card.json')) throw new CardFormatError('CHARX is missing card.json')
    const normalized = normalizeCard(
        parseJson(await readEntry('card.json'), config.limits.jsonBytes),
    )

    // RisuAI-exported CHARX files store the actual lorebook (and regex/trigger scripts) in a
    // sibling `module.risum` entry, not in card.json's `character_book`. When present, it takes
    // precedence over `character_book.entries` (matching RisuAI's own import behavior), while
    // scan_depth/token_budget/recursive_scanning still come from `character_book` if present.
    if (entries.has('module.risum')) {
        const risuModule = await readRisuModule(await readEntry('module.risum'), config)
        const lorebook = Array.isArray(risuModule?.lorebook) ? risuModule.lorebook : []
        const regex = Array.isArray(risuModule?.regex) ? risuModule.regex : []
        const trigger = Array.isArray(risuModule?.trigger) ? risuModule.trigger : []
        if (lorebook.length) {
            const book = normalized.card.data.character_book
            normalized.card.data.character_book = {
                scan_depth: book?.scan_depth,
                token_budget: book?.token_budget,
                recursive_scanning: book?.recursive_scanning,
                extensions: book?.extensions || {},
                entries: risuLorebookToCharacterBookEntries(lorebook),
            }
        }
        if (regex.length || trigger.length) {
            normalized.card.data.extensions ??= {}
            const risuai = isRecord(normalized.card.data.extensions.risuai)
                ? normalized.card.data.extensions.risuai
                : {}
            const nextRisuai: Record<string, unknown> = { ...risuai }
            if (regex.length) nextRisuai.customScripts = regex
            if (trigger.length) nextRisuai.triggerscript = trigger
            if (risuModule?.lowLevelAccess === true) nextRisuai.lowLevelAccess = true
            normalized.card.data.extensions.risuai = nextRisuai
        }
    }

    const importedAssets: LazyAsset[] = []
    let avatar: LazyAsset | undefined
    // Maps every "/"-delimited path suffix to the first entry ending with it, so descriptors whose
    // URI omits leading directories resolve without scanning all entries per asset.
    const pathsBySuffix = new Map<string, string>()
    for (const path of entries.keys()) {
        for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1)) {
            const suffix = path.slice(index + 1)
            if (!pathsBySuffix.has(suffix)) pathsBySuffix.set(suffix, path)
        }
    }

    for (const descriptor of normalized.card.data.assets || []) {
        const uri = descriptor.uri.replace(/^embeded:\/\//, '').replace(/^__asset:/, '')
        const normalizedUri = normalizeArchivePath(uri)?.path
        const decodedUri = normalizeArchivePath(decodeURIComponentSafe(uri))?.path
        const candidates = [
            normalizedUri,
            decodedUri,
            normalizedUri && pathsBySuffix.get(normalizedUri),
        ]
        const path = candidates.find((candidate) => candidate && entries.has(candidate))
        if (!path) continue
        const extension = descriptor.ext || extensionOf(path)
        const asset: LazyAsset = {
            read: () => readEntry(path),
            mimeType: mimeFromExtension(extension),
            type: descriptor.type || 'asset',
            name: descriptor.name || path.split('/').at(-1) || 'asset',
            extension,
            sourceUri: descriptor.uri,
        }
        importedAssets.push(asset)
        if (asset.type === 'icon' && asset.name === 'main') avatar = asset
    }

    return { ...normalized, avatar, assets: importedAssets, warnings: [] }
}

function decodeURIComponentSafe(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

export async function importCharacterCard(
    input: Uint8Array | ByteSource,
    filename: string,
    config: AppConfig,
): Promise<ImportedCard> {
    const source = toByteSource(input)
    if (source.size > config.limits.importBytes)
        throw new CardFormatError('Import file is too large')
    const lower = filename.toLowerCase()
    if (lower.endsWith('.png')) return readPng(await readAll(source), config)
    if (lower.endsWith('.charx')) return readCharx(source, config)
    if (!lower.endsWith('.json'))
        throw new CardFormatError('Expected a JSON, PNG, or CHARX character card')
    if (source.size > config.limits.jsonBytes)
        throw new CardFormatError('Character card JSON is too large')
    const normalized = normalizeCard(parseJson(await readAll(source), config.limits.jsonBytes))
    return { ...normalized, assets: [], warnings: [] }
}

function cardForSpec(card: CharacterCardV3, spec: 'v2' | 'v3'): CharacterCardV2 | CharacterCardV3 {
    if (spec === 'v3') return card
    return CCardLib.character.convert(card, {
        from: 'v3',
        to: 'v2',
        options: { convertRisuFields: true, removeDecorators: true },
    })
}

function pngWithCard(base: Uint8Array, v3: CharacterCardV3, spec: 'v2' | 'v3'): Uint8Array {
    const withoutCharacterData = extractChunks(base).filter((chunk) => {
        if (chunk.name !== 'tEXt') return true
        try {
            const decoded = textChunk.decode(chunk.data)
            return decoded.keyword !== 'ccv3' && decoded.keyword !== 'chara'
        } catch {
            return true
        }
    })
    const endIndex = withoutCharacterData.findIndex((chunk) => chunk.name === 'IEND')
    const insertAt = endIndex === -1 ? withoutCharacterData.length : endIndex
    const v2 = cardForSpec(v3, 'v2')
    const cardChunks = [
        textChunk.encode('chara', Buffer.from(JSON.stringify(v2)).toString('base64')),
        ...(spec === 'v3'
            ? [textChunk.encode('ccv3', Buffer.from(JSON.stringify(v3)).toString('base64'))]
            : []),
    ]
    withoutCharacterData.splice(insertAt, 0, ...cardChunks)
    return encodeChunks(withoutCharacterData)
}

export function exportCharacterCard(
    source: ExportableCard,
    spec: 'v2' | 'v3',
    format: 'json' | 'png' | 'charx',
): { bytes: Uint8Array; mimeType: string; extension: string; warnings: string[] } {
    if (format === 'charx' && spec !== 'v3')
        throw new CardFormatError('CHARX export requires Character Card v3')
    const warnings =
        spec === 'v2' &&
        (source.card.data.assets?.length || source.card.data.group_only_greetings?.length)
            ? ['CCv3-only fields are omitted from the v2 export']
            : []

    if (format === 'json') {
        return {
            bytes: textEncoder.encode(JSON.stringify(cardForSpec(source.card, spec), null, 2)),
            mimeType: 'application/json',
            extension: 'json',
            warnings,
        }
    }

    if (format === 'png') {
        return {
            bytes: pngWithCard(source.avatar?.bytes || emptyPng, source.card, spec),
            mimeType: 'image/png',
            extension: 'png',
            warnings,
        }
    }

    const archive: Record<string, Uint8Array> = {}
    const card = structuredClone(source.card)
    card.data.assets = []
    for (const [index, asset] of source.assets.entries()) {
        const safeName = `${index}-${asset.name}`.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `assets/${asset.type}/${safeName}${safeName.endsWith(`.${asset.extension}`) ? '' : `.${asset.extension}`}`
        archive[path] = asset.bytes
        card.data.assets.push({
            type: asset.type,
            name: asset.name,
            ext: asset.extension,
            uri: path,
        })
    }
    if (source.risuModule) archive['module.risum'] = source.risuModule
    archive['card.json'] = textEncoder.encode(JSON.stringify(card, null, 2))
    return { bytes: zipSync(archive), mimeType: 'application/zip', extension: 'charx', warnings }
}
