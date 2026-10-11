import type { ProviderConfig } from '@malang/shared'
import { eq } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'
import { appSettings } from '@/db/schema'
import { ensureAppSettingsRow } from '@/modules/settings/repo'

export class ProviderRepository extends RepositoryBase {
    get(): ProviderConfig | null {
        ensureAppSettingsRow(this.db)
        const row = this.db
            .select({ providerJson: appSettings.providerJson })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        return row?.providerJson ?? null
    }

    set(provider: ProviderConfig): ProviderConfig {
        ensureAppSettingsRow(this.db)
        this.db
            .update(appSettings)
            .set({ providerJson: provider })
            .where(eq(appSettings.id, 1))
            .run()
        return provider
    }
}
