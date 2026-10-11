import type { AppConfig } from '@/config'
import { toPocketRisuGeminiPrompt } from '@/integrations/providers/gemini-rest'

import type {
    GeminiPrompt,
    PromptMessage,
    PromptScenario,
} from '../../../scripts/pocketrisu-oracle/protocol'
import { createTestApp, testConfig } from '../helpers/app'

const encoder = new TextEncoder()

// Mirrors the request oracle: no trimming unless the scenario sets a budget.
const UNLIMITED_CONTEXT = 10_000_000

const parityConfig: Partial<AppConfig> = {
    adminPassword: 'pocketrisu parity administrator',
    sessionSecret: 'pocketrisu-parity-session-secret-with-entropy',
    port: 0,
    limits: { ...testConfig().limits, jsonBytes: 32 << 20 },
}

const json = (value: unknown) => encoder.encode(JSON.stringify(value))

/** Imports a scenario into a fresh database; returns the prompt preview and its Gemini body. */
export async function compileWithMalang(
    scenario: PromptScenario,
): Promise<{ messages: PromptMessage[]; geminiPrompt: GeminiPrompt }> {
    const t = await createTestApp({ config: parityConfig, login: false })
    try {
        const { store } = t.context
        store.provider.set({
            provider: 'vertex',
            modelId: 'gemini-3-flash-preview',
            projectId: '',
            location: 'global',
            defaults: {
                maxContextTokens: scenario.context?.maxContext ?? UNLIMITED_CONTEXT,
                maxOutputTokens: scenario.context?.maxResponse,
            },
            providerOptions: {},
        })

        const preset = await t.context.prompts.import(json(scenario.preset), 'preset.json')
        const { character } = await t.context.characters.import(
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

        const conversation = t.context.conversations.create({
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
            const module = await t.context.modules.import(json(source), 'module.json')
            t.context.modules.setConversationState(conversation.id, module.id, true)
        }

        const preview = await t.context.generations.preview(conversation.id, {
            continuing: scenario.continue,
        })
        return {
            messages: preview.messages.map(({ role, content }) => ({ role, content })),
            geminiPrompt: toPocketRisuGeminiPrompt(preview.messages),
        }
    } finally {
        await t.close()
    }
}
