import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
    GeminiPrompt,
    PromptMessage,
    PromptScenario,
} from '../../../scripts/pocketrisu-oracle/protocol'
import type { AppConfig } from '../../src/config'
import { createContext } from '../../src/services'
import { toPocketRisuGeminiPrompt } from '../../src/services/providers/gemini-rest'

const encoder = new TextEncoder()

// Mirrors the request oracle: neither side may trim history.
const UNLIMITED_CONTEXT = 10_000_000

function testConfig(directory: string): AppConfig {
    return {
        nodeEnv: 'test',
        autoBackupEnabled: false,
        host: '127.0.0.1',
        dataDir: directory,
        databasePath: join(directory, 'data.sqlite'),
        adminPassword: 'pocketrisu parity administrator',
        sessionSecret: 'pocketrisu-parity-session-secret-with-entropy',
        allowedOrigins: new Set(),
        cookieSecure: false,
        port: 0,
        logLevel: 'silent',
        logPretty: false,
        logColorize: false,
        limits: {
            importBytes: 128 << 20,
            jsonBytes: 32 << 20,
            assetBytes: 32 << 20,
            archiveEntries: 4096,
            uploadChunkBytes: 64 << 10,
        },
    }
}

const json = (value: unknown) => encoder.encode(JSON.stringify(value))

/** Imports a scenario into a fresh database; returns the prompt preview and its Gemini body. */
export async function compileWithMalang(
    scenario: PromptScenario,
): Promise<{ messages: PromptMessage[]; geminiPrompt: GeminiPrompt }> {
    const directory = mkdtempSync(join(tmpdir(), 'malang-parity-'))
    const context = await createContext(testConfig(directory))
    try {
        const { store } = context
        store.provider.set({
            provider: 'vertex',
            modelId: 'gemini-3-flash-preview',
            projectId: '',
            location: 'global',
            defaults: { maxContextTokens: UNLIMITED_CONTEXT },
            providerOptions: {},
        })

        const preset = await context.prompts.import(json(scenario.preset), 'preset.json')
        const { character } = await context.characters.import(
            json(scenario.character),
            'character.json',
        )
        const persona = scenario.user.persona
            ? store.persona.create({
                  name: scenario.user.name,
                  description: scenario.user.persona,
                  note: '',
              })
            : null
        store.settings.update({
            userName: scenario.user.name,
            selectedPersonaId: persona?.id ?? null,
            defaultPromptPresetId: preset.id,
            globalVariables: scenario.globalVariables ?? {},
            promptToggleValues: scenario.toggles ?? {},
            jailbreakToggle: scenario.jailbreakToggle ?? false,
            chainOfThought: scenario.chainOfThought ?? false,
        })

        const conversation = context.conversations.create({
            characterId: character.id,
            promptPresetId: preset.id,
            greetingIndex: scenario.chat.fmIndex ?? -1,
        })
        for (const message of scenario.chat.messages) {
            store.message.create(
                conversation.id,
                message.role === 'char' ? 'assistant' : 'user',
                message.data,
                'complete',
            )
        }
        store.conversation.update(conversation.id, {
            authorNote: scenario.chat.note ?? '',
            variables: scenario.chat.variables ?? {},
        })
        for (const source of scenario.modules ?? []) {
            const module = await context.modules.import(json(source), 'module.json')
            context.modules.setConversationState(conversation.id, module.id, true)
        }

        const preview = await context.generations.preview(conversation.id)
        return {
            messages: preview.messages.map(({ role, content }) => ({ role, content })),
            geminiPrompt: toPocketRisuGeminiPrompt(preview.messages),
        }
    } finally {
        context.close()
        rmSync(directory, { recursive: true, force: true })
    }
}
