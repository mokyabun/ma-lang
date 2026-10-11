import type { LongTermMemorySettings, LongTermMemorySettingsPatch } from '@malang/shared'
import { LongTermMemoryMetricsSchema, LongTermMemorySettingsSchema } from '@malang/shared'
import { eq } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'
import { conversationMemorySettings } from '@/db/schema'

export const defaultMemorySettings = (): LongTermMemorySettings =>
    LongTermMemorySettingsSchema.parse({})

export class MemorySettingsRepository extends RepositoryBase {
    get(conversationId: string): LongTermMemorySettings {
        const row = this.db
            .select()
            .from(conversationMemorySettings)
            .where(eq(conversationMemorySettings.conversationId, conversationId))
            .get()
        return row
            ? LongTermMemorySettingsSchema.parse({
                  ...defaultMemorySettings(),
                  ...row.settingsJson,
              })
            : defaultMemorySettings()
    }

    update(conversationId: string, patch: LongTermMemorySettingsPatch): LongTermMemorySettings {
        const settings = LongTermMemorySettingsSchema.parse({
            ...this.get(conversationId),
            ...patch,
        })
        if (settings.recentMemoryRatio + settings.similarMemoryRatio > 1) {
            throw new Error('Recent and similar memory ratios must add up to at most 1')
        }
        const current = this.db
            .select({ metricsJson: conversationMemorySettings.metricsJson })
            .from(conversationMemorySettings)
            .where(eq(conversationMemorySettings.conversationId, conversationId))
            .get()
        this.db
            .insert(conversationMemorySettings)
            .values({
                conversationId,
                settingsJson: settings,
                metricsJson: current?.metricsJson || LongTermMemoryMetricsSchema.parse({}),
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: conversationMemorySettings.conversationId,
                set: { settingsJson: settings },
            })
            .run()
        return settings
    }
}
