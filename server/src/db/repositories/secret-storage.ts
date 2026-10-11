import { eq } from 'drizzle-orm'

import type { DatabaseHandle } from '@/db/client'
import { RepositoryBase } from '@/db/repository'

import { appSettings, illustrationSettings } from '../schema'
import { ensureIllustrationSettingsRow } from './illustration-settings'
import { ensureAppSettingsRow } from './settings'

export const SECRET_SLOTS = ['provider', 'novelai'] as const
export type SecretSlot = (typeof SECRET_SLOTS)[number]
export type SecretEnvelopes = Record<SecretSlot, string | null>

export class SecretStorageRepository extends RepositoryBase {
    get(): { salt: string | null; secrets: SecretEnvelopes } {
        ensureAppSettingsRow(this.db)
        ensureIllustrationSettingsRow(this.db)
        const app = this.db
            .select({
                salt: appSettings.secretSalt,
                provider: appSettings.providerSecretJson,
            })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        const illustration = this.db
            .select({ novelai: illustrationSettings.novelaiApiKeySecret })
            .from(illustrationSettings)
            .where(eq(illustrationSettings.id, 1))
            .get()
        return {
            salt: app?.salt ?? null,
            secrets: {
                provider: app?.provider ?? null,
                novelai: illustration?.novelai ?? null,
            },
        }
    }

    setSalt(salt: string): void {
        ensureAppSettingsRow(this.db)
        this.db.update(appSettings).set({ secretSalt: salt }).where(eq(appSettings.id, 1)).run()
    }

    setSecret(slot: SecretSlot, envelope: string | null): void {
        writeSecret(this.db, slot, envelope)
    }
}

export function writeSecret(
    db: DatabaseHandle['db'],
    slot: SecretSlot,
    envelope: string | null,
): void {
    if (slot === 'provider') {
        ensureAppSettingsRow(db)
        db.update(appSettings)
            .set({ providerSecretJson: envelope })
            .where(eq(appSettings.id, 1))
            .run()
        return
    }
    ensureIllustrationSettingsRow(db)
    db.update(illustrationSettings)
        .set({ novelaiApiKeySecret: envelope })
        .where(eq(illustrationSettings.id, 1))
        .run()
}
