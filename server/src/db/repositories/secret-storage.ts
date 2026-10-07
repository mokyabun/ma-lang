import { eq } from 'drizzle-orm'

import { appSettings } from '../schema'
import { RepositoryBase } from './base'
import { ensureAppSettingsRow } from './settings'

export class SecretStorageRepository extends RepositoryBase {
    get(): { salt: string | null; providerSecret: string | null } {
        ensureAppSettingsRow(this.db)
        const row = this.db
            .select({
                salt: appSettings.secretSalt,
                providerSecret: appSettings.providerSecretJson,
            })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        return { salt: row?.salt ?? null, providerSecret: row?.providerSecret ?? null }
    }

    setSalt(salt: string): void {
        ensureAppSettingsRow(this.db)
        this.db.update(appSettings).set({ secretSalt: salt }).where(eq(appSettings.id, 1)).run()
    }

    setSecret(providerSecret: string | null): void {
        ensureAppSettingsRow(this.db)
        this.db
            .update(appSettings)
            .set({ providerSecretJson: providerSecret })
            .where(eq(appSettings.id, 1))
            .run()
    }
}
