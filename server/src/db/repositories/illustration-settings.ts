import {
    type ContinuityTracking,
    DEFAULT_IMAGE_SIZE_PRESETS,
    DEFAULT_NOVELAI_ENDPOINT,
    DEFAULT_NOVELAI_IMAGE_PARAMS,
    type IllustrationCount,
    type IllustrationMode,
    type ImageSizePreset,
    type NovelAIImageParams,
} from '@malang/shared'
import { eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { illustrationSettings } from '../schema'
import { RepositoryBase, requireValue } from './base'

export interface IllustrationSettingsRecord {
    imageProvider: 'novelai'
    novelaiEndpoint: string
    novelaiApiKeyHint: string
    defaultImageParams: NovelAIImageParams
    analysisModelPresetId: string | null
    defaultStyleId: string | null
    defaultMode: IllustrationMode
    defaultCount: IllustrationCount
    contextMessageCount: number
    analysisInstruction: string
    fixedPositive: string
    fixedNegative: string
    sizePresets: ImageSizePreset[]
    continuityTracking: ContinuityTracking
}

// illustration_settings is a singleton row; seed it before reading or writing.
export function ensureIllustrationSettingsRow(db: DatabaseHandle['db']): void {
    db.insert(illustrationSettings)
        .values({
            id: 1,
            novelaiEndpoint: DEFAULT_NOVELAI_ENDPOINT,
            defaultImageParamsJson: DEFAULT_NOVELAI_IMAGE_PARAMS,
        })
        .onConflictDoNothing()
        .run()
}

export class IllustrationSettingsRepository extends RepositoryBase {
    get(): IllustrationSettingsRecord {
        ensureIllustrationSettingsRow(this.db)
        const row = requireValue(
            this.db.select().from(illustrationSettings).where(eq(illustrationSettings.id, 1)).get(),
            'Illustration settings are missing',
        )
        return {
            imageProvider: row.imageProvider,
            novelaiEndpoint: row.novelaiEndpoint,
            novelaiApiKeyHint: row.novelaiApiKeyHint,
            // Rows saved before a parameter existed fall back to its default.
            defaultImageParams: { ...DEFAULT_NOVELAI_IMAGE_PARAMS, ...row.defaultImageParamsJson },
            analysisModelPresetId: row.analysisModelPresetId,
            defaultStyleId: row.defaultStyleId,
            defaultMode: row.defaultMode,
            defaultCount: { min: row.defaultCountMin, max: row.defaultCountMax },
            contextMessageCount: row.contextMessageCount,
            analysisInstruction: row.analysisInstruction,
            fixedPositive: row.fixedPositive,
            fixedNegative: row.fixedNegative,
            sizePresets: row.sizePresetsJson.length
                ? row.sizePresetsJson
                : DEFAULT_IMAGE_SIZE_PRESETS,
            continuityTracking: row.continuityTracking,
        }
    }

    update(update: Partial<IllustrationSettingsRecord>): IllustrationSettingsRecord {
        const next = { ...this.get(), ...update }
        this.db
            .update(illustrationSettings)
            .set({
                imageProvider: next.imageProvider,
                novelaiEndpoint: next.novelaiEndpoint,
                novelaiApiKeyHint: next.novelaiApiKeyHint,
                defaultImageParamsJson: next.defaultImageParams,
                analysisModelPresetId: next.analysisModelPresetId,
                defaultStyleId: next.defaultStyleId,
                defaultMode: next.defaultMode,
                defaultCountMin: next.defaultCount.min,
                defaultCountMax: next.defaultCount.max,
                contextMessageCount: next.contextMessageCount,
                analysisInstruction: next.analysisInstruction,
                fixedPositive: next.fixedPositive,
                fixedNegative: next.fixedNegative,
                sizePresetsJson: next.sizePresets,
                continuityTracking: next.continuityTracking,
            })
            .where(eq(illustrationSettings.id, 1))
            .run()
        return this.get()
    }
}
