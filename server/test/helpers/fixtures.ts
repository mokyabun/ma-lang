import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { type Character, type ConversationCreate, GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { zipSync } from 'fflate'

import type { TestApp } from './app'

export function fixturePath(name: string) {
    return join(import.meta.dir, '../fixtures', name)
}

/** Path of an optional, uncommitted file in `fixtures/local/`, or null when it is missing. */
export function localFixture(name: string) {
    const path = fixturePath(join('local', name))
    return existsSync(path) ? path : null
}

export function v3Card(overrides: Record<string, unknown> = {}) {
    return {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: 'Aria',
            description: 'An archivist.',
            personality: 'Curious',
            scenario: 'A quiet library',
            first_mes: 'Welcome, {{user}}.',
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: ['You came back.'],
            group_only_greetings: [],
            tags: ['test'],
            creator: 'Malang',
            character_version: '1.0',
            extensions: { malang_test: true },
            character_book: {
                name: 'Library',
                description: '',
                scan_depth: 5,
                token_budget: 500,
                recursive_scanning: true,
                extensions: {},
                entries: [
                    {
                        keys: ['moon'],
                        secondary_keys: [],
                        content: 'The moon archive is restricted.',
                        enabled: true,
                        insertion_order: 0,
                        case_sensitive: false,
                        use_regex: false,
                        constant: false,
                        selective: false,
                        priority: 10,
                        name: 'Moon archive',
                        comment: '',
                        extensions: {},
                    },
                ],
            },
            ...overrides,
        },
    }
}

export interface CharxArchiveOptions {
    /** `v3Card` overrides. */
    card?: Record<string, unknown>
    assetCount?: number
    /** Size of each asset; the default makes the archive span several 64 KiB upload chunks. */
    assetBytes?: number
}

/** A CHARX zip with `card.json` and embedded image assets. */
export function charxArchive(options: CharxArchiveOptions = {}) {
    const assetCount = options.assetCount ?? 3
    const assetBytes = options.assetBytes ?? 48 << 10
    const files: Record<string, Uint8Array> = {}
    const assets = []
    for (let index = 0; index < assetCount; index += 1) {
        const path = `assets/other/image/asset${index}.png`
        files[path] = Uint8Array.from(
            { length: assetBytes },
            (_, offset) => (offset * 31 + index) % 256,
        )
        assets.push({
            type: 'x-risu-asset',
            uri: `embeded://${path}`,
            name: `asset${index}`,
            ext: 'png',
        })
    }
    const card = v3Card({ name: 'Archive', assets, ...options.card })
    files['card.json'] = new TextEncoder().encode(JSON.stringify(card))
    return zipSync(files, { level: 0 })
}

/** A model preset on the `echo` provider, which streams `message` back as the reply. */
export function createEchoPreset(
    t: TestApp,
    options: { message: string; delayMs?: number; name?: string },
) {
    return t.context.store.modelPreset.create({
        name: options.name ?? `Echo ${crypto.randomUUID()}`,
        apiKeyId: null,
        config: {
            provider: 'echo',
            modelId: 'echo',
            defaults: {},
            providerOptions: { message: options.message, delayMs: options.delayMs ?? 0 },
        },
    })
}

/** A model preset on the `ollama` provider for a server from `startFakeOllama`. */
export function createOllamaPreset(t: TestApp, baseUrl: string) {
    return t.context.store.modelPreset.create({
        name: `Ollama ${crypto.randomUUID()}`,
        apiKeyId: null,
        config: {
            provider: 'ollama',
            baseUrl,
            modelId: 'test-model',
            defaults: { maxContextTokens: 8192, maxOutputTokens: 128 },
            providerOptions: {},
        },
    })
}

/** Imports a JSON card through `POST /characters/import` and returns the character. */
export async function importCard(t: TestApp, card: object = v3Card()) {
    const { character } = await t.call<{ character: Character }>('/characters/import', {
        method: 'POST',
        headers: { 'x-filename': 'card.json' },
        body: card,
    })
    return character
}

export function createConversation(t: TestApp, input: Partial<ConversationCreate> = {}) {
    return t.context.conversations.create({
        characterId: GENERAL_CHAT_CHARACTER_ID,
        greetingIndex: -1,
        ...input,
    })
}

export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs
    while (!(await check())) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
        await Bun.sleep(5)
    }
}

/** A promise with its resolver, to hold a fake response until the test releases it. */
export function deferred<T = void>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
}
