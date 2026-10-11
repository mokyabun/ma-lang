import {
    type IllustrationSettings,
    type IllustrationSettingsPatch,
    type IllustrationStyleTestRequestSchema,
    type IllustrationTestResult,
    IllustrationTestRequestSchema,
    NovelAIImageParamsSchema,
} from '@malang/shared'
import type { z } from 'zod'

import type { Store } from '@/db'
import {
    type NovelAIImageInput,
    NovelAIImageClient,
    type NovelAIImageResult,
} from '@/integrations/novelai/client'
import { NotFoundError, ValidationError } from '@/lib/errors/app-error'
import type { JobRunner } from '@/modules/jobs/runner'
import type { SecretVault } from '@/modules/secrets/vault'

import { composePrompt, normalizeTags, resolveImageParams } from './prompt'

/** Every NovelAI call shares this lane so one account never runs two generations at once. */
export const NOVELAI_LANE = 'novelai'

type IllustrationTestRequest = z.output<typeof IllustrationTestRequestSchema>
type IllustrationStyleTestRequest = z.output<typeof IllustrationStyleTestRequestSchema>

export class IllustrationService {
    constructor(
        private readonly store: Store,
        private readonly vault: SecretVault,
        private readonly jobs: JobRunner,
        private readonly fetchImpl?: typeof fetch,
    ) {}

    settings(): IllustrationSettings {
        const record = this.store.illustrationSettings.get()
        const configured = this.vault.hasSecret('novelai')
        const { novelaiApiKeyHint: _hint, ...fields } = record
        return {
            ...fields,
            imageProvider: record.imageProvider,
            novelaiEndpoint: record.novelaiEndpoint,
            novelaiApiKeyConfigured: configured,
            novelaiApiKeyLocked: configured && this.vault.isLocked(),
            novelaiApiKeyHint: configured ? record.novelaiApiKeyHint : '',
            defaultImageParams: record.defaultImageParams,
        }
    }

    async updateSettings(patch: IllustrationSettingsPatch): Promise<IllustrationSettings> {
        const current = this.store.illustrationSettings.get()
        const defaultImageParams = patch.defaultImageParams
            ? NovelAIImageParamsSchema.parse({
                  ...current.defaultImageParams,
                  ...patch.defaultImageParams,
              })
            : current.defaultImageParams
        if (
            patch.analysisModelPresetId &&
            !this.store.modelPreset.get(patch.analysisModelPresetId)
        ) {
            throw new ValidationError('Analysis model preset does not exist')
        }
        if (patch.defaultStyleId && !this.store.illustrationStyle.get(patch.defaultStyleId)) {
            throw new ValidationError('Illustration style does not exist')
        }
        const {
            novelaiApiKey: _key,
            clearNovelaiApiKey: _clear,
            defaultImageParams: _params,
            ...fields
        } = patch
        if (patch.novelaiApiKey) await this.vault.set('novelai', patch.novelaiApiKey)
        if (patch.clearNovelaiApiKey) this.vault.clear('novelai')
        this.store.illustrationSettings.update({
            ...fields,
            novelaiEndpoint: patch.novelaiEndpoint ?? current.novelaiEndpoint,
            novelaiApiKeyHint: patch.novelaiApiKey
                ? keyHint(patch.novelaiApiKey)
                : patch.clearNovelaiApiKey
                  ? ''
                  : current.novelaiApiKeyHint,
            defaultImageParams,
        })
        return this.settings()
    }

    /** Generates one image right away; nothing is stored. */
    async testGenerate(
        request: IllustrationTestRequest,
        signal?: AbortSignal,
    ): Promise<IllustrationTestResult> {
        const params = NovelAIImageParamsSchema.parse({
            ...this.store.illustrationSettings.get().defaultImageParams,
            ...request.params,
        })
        const input = {
            positive: request.positive,
            negative: request.negative,
            characters: request.characters,
            params,
        }
        const result = await this.jobs.runInLane(NOVELAI_LANE, () => this.generate(input, signal))
        return {
            image: `data:${result.mimeType};base64,${Buffer.from(result.image).toString('base64')}`,
            seed: result.seed,
            width: params.width,
            height: params.height,
            model: params.model,
        }
    }

    /** Renders sample scene tags through a style and the global fixed prompts. */
    async testStyle(
        styleId: string,
        request: IllustrationStyleTestRequest,
        signal?: AbortSignal,
    ): Promise<IllustrationTestResult> {
        const style = this.store.illustrationStyle.get(styleId)
        if (!style) throw new NotFoundError('Illustration style not found')
        const settings = this.store.illustrationSettings.get()
        const composed = composePrompt({
            fixedPositive: settings.fixedPositive,
            fixedNegative: settings.fixedNegative,
            style,
            scene: request.scene,
            characters: [],
        })
        return this.testGenerate(
            {
                positive: composed.positive,
                negative: composed.negative,
                characters: request.characters.map((character) => ({
                    prompt: normalizeTags(character.prompt),
                    negative: normalizeTags(character.negative),
                })),
                params: resolveImageParams(settings.defaultImageParams, style.params),
            },
            signal,
        )
    }

    /** Callers must hold the NovelAI lane: run inside a job on it, or via `runInLane`. */
    async generate(input: NovelAIImageInput, signal?: AbortSignal): Promise<NovelAIImageResult> {
        return (await this.client()).generate(input, signal)
    }

    private async client(): Promise<NovelAIImageClient> {
        const apiKey = await this.vault.get('novelai')
        if (!apiKey) throw new ValidationError('NovelAI API key is not configured')
        return new NovelAIImageClient({
            endpoint: this.store.illustrationSettings.get().novelaiEndpoint,
            apiKey,
            fetch: this.fetchImpl,
        })
    }
}

function keyHint(value: string): string {
    return value.length > 4 ? `••••${value.slice(-4)}` : '저장됨'
}
