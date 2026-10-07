import type {
    PromptBlock,
    PromptPreset,
    PromptPresetInput,
    RegexPhase,
    RegexScript,
} from '@malang/shared'

import type { Store } from '@/db'
import { ValidationError } from '@/errors/app-error'
import { exportPromptPreset, importPromptPreset } from '@/services/prompt/preset-codec'
import { processRegexText } from '@/services/prompt/regex-runtime'
import { normalizeRegexScripts, toRisuRegexScripts } from '@/services/prompt/risu'

export class PromptService {
    constructor(private readonly store: Store) {}

    list() {
        return this.store.promptPreset.list()
    }

    get(id: string) {
        return this.store.promptPreset.get(id)
    }

    create(input: PromptPresetInput) {
        return this.store.promptPreset.create(input)
    }

    update(id: string, input: PromptPresetInput) {
        return this.store.promptPreset.update(id, input)
    }

    delete(id: string) {
        return this.store.promptPreset.delete(id)
    }

    ensureDefault(): PromptPreset {
        return this.store.transaction(() => {
            const defaultId = this.store.settings.get().defaultPromptPresetId
            const existing = defaultId ? this.store.promptPreset.get(defaultId) : null
            if (existing) return existing
            const preset = this.store.promptPreset.create(defaultPromptPresetInput())
            this.store.settings.update({ defaultPromptPresetId: preset.id })
            return preset
        })
    }

    async import(bytes: Uint8Array, filename: string) {
        const decoded = await importPromptPreset(bytes, filename)
        return this.store.promptPreset.create(decoded.input, decoded.source, decoded.warnings)
    }

    async export(id: string, format: 'json' | 'risupreset' | 'risup') {
        const preset = this.store.promptPreset.get(id)
        if (!preset) return null
        return exportPromptPreset(
            {
                name: preset.name,
                blocks: preset.blocks,
                parameters: preset.parameters,
                defaultVariables: preset.defaultVariables,
                toggles: preset.toggles,
                regexScripts: preset.regexScripts,
                moduleIntegrations: preset.moduleIntegrations,
                promptSettings: preset.promptSettings,
            },
            format,
        )
    }

    importRegex(id: string, bytes: Uint8Array, mode: 'append' | 'replace') {
        const preset = this.store.promptPreset.get(id)
        if (!preset) return null
        let source: unknown
        try {
            source = JSON.parse(new TextDecoder().decode(bytes))
        } catch {
            throw new ValidationError('Invalid Risu regex JSON')
        }
        const record =
            source && typeof source === 'object' ? (source as Record<string, unknown>) : {}
        if (record.type !== 'regex' || !Array.isArray(record.data)) {
            throw new ValidationError('Expected a Risu regex export')
        }
        const imported = normalizeRegexScripts(record.data)
        return this.update(id, {
            ...presetInput(preset),
            regexScripts: mode === 'replace' ? imported : [...preset.regexScripts, ...imported],
        })
    }

    exportRegex(id: string) {
        const preset = this.store.promptPreset.get(id)
        if (!preset) return null
        return new TextEncoder().encode(
            JSON.stringify(
                { type: 'regex', name: preset.name, data: toRisuRegexScripts(preset.regexScripts) },
                null,
                2,
            ),
        )
    }

    previewRegex(input: { text: string; phase: RegexPhase; scripts: RegexScript[] }) {
        return processRegexText({
            ...input,
            templateContext: { values: {}, variables: {}, globalVariables: {}, toggles: {} },
        })
    }
}

function defaultPromptPresetInput(): PromptPresetInput {
    const block = (type: string, rest: Record<string, unknown> = {}): PromptBlock =>
        ({ id: crypto.randomUUID(), enabled: true, type, ...rest }) as PromptBlock
    return {
        name: 'Default',
        parameters: { temperature: 0.9, maxContextTokens: 8192, maxOutputTokens: 512 },
        defaultVariables: {},
        toggles: [],
        regexScripts: [],
        moduleIntegrations: [],
        blocks: [
            block('plain', {
                type2: 'main',
                role: 'system',
                text: 'Continue the fictional conversation as {{char}}.',
            }),
            block('description'),
            block('persona'),
            block('lorebook'),
            block('chat', { rangeStart: 0, rangeEnd: 'end' }),
            block('authornote'),
            block('plain', { type2: 'globalNote', role: 'system', text: '' }),
            block('postEverything'),
        ],
    }
}

function presetInput(preset: ReturnType<Store['promptPreset']['get']> & {}) {
    if (!preset) throw new Error('Prompt preset not found')
    return {
        name: preset.name,
        blocks: preset.blocks,
        parameters: preset.parameters,
        defaultVariables: preset.defaultVariables,
        toggles: preset.toggles,
        regexScripts: preset.regexScripts,
        moduleIntegrations: preset.moduleIntegrations,
        promptSettings: preset.promptSettings,
    }
}
