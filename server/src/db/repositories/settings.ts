import type { AppSettings } from '@malang/shared'
import { eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { appSettings } from '../schema'
import { normalizeToggleValues, RepositoryBase, requireValue } from './base'

// app_settings is a singleton row; seed it before reading or writing.
export function ensureAppSettingsRow(db: DatabaseHandle['db']): void {
    if (db.select().from(appSettings).where(eq(appSettings.id, 1)).get()) return
    db.insert(appSettings)
        .values({
            id: 1,
            userName: 'User',
            globalVariablesJson: {},
            promptToggleValuesJson: {},
            defaultPromptPresetId: null,
            defaultModelPresetId: null,
            defaultAuxiliaryModelPresetId: null,
            selectedPersonaId: null,
            providerJson: null,
            updatedAt: new Date(),
        })
        .run()
}

export class SettingsRepository extends RepositoryBase {
    ensure(): void {
        ensureAppSettingsRow(this.db)
    }

    get(): AppSettings {
        this.ensure()
        const row = requireValue(
            this.db.select().from(appSettings).where(eq(appSettings.id, 1)).get(),
            'Application settings are missing',
        )
        return {
            userName: row.userName,
            globalVariables: row.globalVariablesJson,
            promptToggleValues: normalizeToggleValues(row.promptToggleValuesJson),
            defaultPromptPresetId: row.defaultPromptPresetId,
            defaultModelPresetId: row.defaultModelPresetId,
            defaultAuxiliaryModelPresetId: row.defaultAuxiliaryModelPresetId,
            selectedPersonaId: row.selectedPersonaId,
            requestDebugEnabled: row.requestDebugEnabled,
            autoBackupEnabled: row.autoBackupEnabled,
            jailbreakToggle: row.jailbreakToggle,
            chainOfThought: row.chainOfThought,
        }
    }

    update(update: Partial<AppSettings>): AppSettings {
        const current = this.get()
        const next = { ...current, ...update }
        this.db
            .update(appSettings)
            .set({
                userName: next.userName,
                globalVariablesJson: next.globalVariables,
                promptToggleValuesJson: next.promptToggleValues,
                defaultPromptPresetId: next.defaultPromptPresetId,
                defaultModelPresetId: next.defaultModelPresetId,
                defaultAuxiliaryModelPresetId: next.defaultAuxiliaryModelPresetId,
                selectedPersonaId: next.selectedPersonaId,
                requestDebugEnabled: next.requestDebugEnabled,
                autoBackupEnabled: next.autoBackupEnabled,
                jailbreakToggle: next.jailbreakToggle,
                chainOfThought: next.chainOfThought,
            })
            .where(eq(appSettings.id, 1))
            .run()
        return this.get()
    }
}
