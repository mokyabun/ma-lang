import { describe, expect, test } from 'bun:test'

import { SETTINGS_NAV } from './navigation'
import { isSettingsSection, SETTINGS_SECTIONS } from './types'

describe('settings navigation', () => {
    test('includes every supported route exactly once', () => {
        const sections = SETTINGS_NAV.map((item) => item.section)
        expect(sections).toEqual([...SETTINGS_SECTIONS])
    })

    test.each([...SETTINGS_SECTIONS])('accepts the %s section', (section) => {
        expect(isSettingsSection(section)).toBe(true)
    })

    test.each(['backup', 'debug', 'unknown', ''])(
        'rejects the unsupported section "%s"',
        (section) => {
            expect(isSettingsSection(section)).toBe(false)
        },
    )
})
