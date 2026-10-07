import type {
    ConversationIllustrationSettings,
    ConversationIllustrationSettingsInput,
} from '@malang/shared'
import { eq } from 'drizzle-orm'

import { conversationIllustrationSettings } from '../schema'
import { RepositoryBase } from './base'

type SettingsRow = typeof conversationIllustrationSettings.$inferSelect

export class ConversationIllustrationSettingsRepository extends RepositoryBase {
    /** Null until the conversation saves its own settings. */
    get(conversationId: string): ConversationIllustrationSettings | null {
        const row = this.db
            .select()
            .from(conversationIllustrationSettings)
            .where(eq(conversationIllustrationSettings.conversationId, conversationId))
            .get()
        return row ? mapSettings(row) : null
    }

    save(
        conversationId: string,
        input: ConversationIllustrationSettingsInput,
    ): ConversationIllustrationSettings {
        const columns = {
            enabled: input.enabled,
            mode: input.mode,
            countMin: input.count.min,
            countMax: input.count.max,
            styleId: input.styleId,
            analysisModelPresetId: input.analysisModelPresetId,
            sceneDirection: input.sceneDirection,
        }
        const row = this.db
            .insert(conversationIllustrationSettings)
            .values({ conversationId, ...columns })
            .onConflictDoUpdate({
                target: conversationIllustrationSettings.conversationId,
                set: columns,
            })
            .returning()
            .get()
        return mapSettings(row)
    }
}

function mapSettings(row: SettingsRow): ConversationIllustrationSettings {
    return {
        conversationId: row.conversationId,
        enabled: row.enabled,
        mode: row.mode,
        count: { min: row.countMin, max: row.countMax },
        styleId: row.styleId,
        analysisModelPresetId: row.analysisModelPresetId,
        sceneDirection: row.sceneDirection,
    }
}
