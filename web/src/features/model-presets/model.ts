import { POCKET_RISU_PROFILE_OPTION, PocketRisuProfileBindingSchema } from '@malang/shared'
import type { GenerationParameters, ModelPreset, PocketRisuProfileField } from '@malang/shared'

export const generationParameterKeys = new Set([
    'temperature',
    'topP',
    'topK',
    'minP',
    'topA',
    'repetitionPenalty',
    'frequencyPenalty',
    'presencePenalty',
    'maxContextTokens',
    'maxOutputTokens',
    'stopSequences',
])

export function readProfileBinding(preset: ModelPreset | null | undefined) {
    const result = PocketRisuProfileBindingSchema.safeParse(
        preset?.config.providerOptions?.[POCKET_RISU_PROFILE_OPTION],
    )
    return result.success ? result.data : null
}

export function runtimeProviderOptions(options: Record<string, unknown> | undefined) {
    const runtime = { ...options }
    delete runtime[POCKET_RISU_PROFILE_OPTION]
    return runtime
}

export function profileGenerationDefaults(values: Record<string, unknown>): GenerationParameters {
    const result: GenerationParameters = {}
    for (const key of generationParameterKeys) {
        const value = values[key]
        if (key === 'stopSequences') {
            if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
                result.stopSequences = value
            }
            continue
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) continue
        Object.assign(result, { [key]: value })
    }
    return result
}

export function finiteNumber(value: string): number | undefined {
    if (!value.trim()) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

export function enumValue(field: PocketRisuProfileField, value: string): unknown {
    if (!value && !field.enum?.some((option) => String(option.value) === '')) return undefined
    return field.enum?.find((option) => String(option.value) === value)?.value ?? value
}

export function scalarProfileValue(value: unknown): string | number {
    return typeof value === 'string' || typeof value === 'number' ? value : ''
}

export function uniqueModels(models: Array<{ id: string; name: string }>) {
    return [...new Map(models.filter((item) => item.id).map((item) => [item.id, item])).values()]
}

export const nativeProfileFieldKeys = new Set([
    'serviceAccountJson',
    'apiKey',
    'accessKeyId',
    'secretAccessKey',
    'modelId',
    'endpointUrl',
    'projectId',
    'location',
    'region',
    'temperature',
    'maxOutputTokens',
])
