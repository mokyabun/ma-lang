import { describe, expect, test } from 'bun:test'

import { isSettingsSection, SETTINGS_SECTIONS } from '@/features/settings/types'

describe('settings sections', () => {
    test('accept every listed section and nothing else', () => {
        for (const section of SETTINGS_SECTIONS) expect(isSettingsSection(section)).toBe(true)
        expect(isSettingsSection('illustrations')).toBe(false)
        expect(isSettingsSection('')).toBe(false)
    })
})
