import type { LongTermMemoryMetrics } from '@malang/shared'
import { LongTermMemoryMetricsSchema } from '@malang/shared'
import { eq } from 'drizzle-orm'

import { conversationMemorySettings } from '../schema'
import { RepositoryBase } from './base'
import { defaultMemorySettings } from './memory-settings'

export const defaultMemoryMetrics = (): LongTermMemoryMetrics =>
    LongTermMemoryMetricsSchema.parse({})

export class MemoryMetricsRepository extends RepositoryBase {
    get(conversationId: string): LongTermMemoryMetrics {
        const row = this.db
            .select({ metricsJson: conversationMemorySettings.metricsJson })
            .from(conversationMemorySettings)
            .where(eq(conversationMemorySettings.conversationId, conversationId))
            .get()
        return row
            ? LongTermMemoryMetricsSchema.parse({ ...defaultMemoryMetrics(), ...row.metricsJson })
            : defaultMemoryMetrics()
    }

    set(conversationId: string, metrics: LongTermMemoryMetrics): void {
        this.db
            .insert(conversationMemorySettings)
            .values({
                conversationId,
                settingsJson: defaultMemorySettings(),
                metricsJson: LongTermMemoryMetricsSchema.parse(metrics),
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: conversationMemorySettings.conversationId,
                set: { metricsJson: metrics },
            })
            .run()
    }
}
