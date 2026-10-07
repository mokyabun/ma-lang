import { describe, expect, test } from 'bun:test'

import { processRegexText } from '@/services/prompt/regex-runtime'
import { renderTemplate } from '@/services/prompt/template-engine'

const templateContext = {
    values: {},
    variables: {},
    globalVariables: { toggle_style: '1' },
    toggles: { style: true },
}

describe('Risu regex runtime', () => {
    test('applies CBS replacements and order metadata in an isolated worker', async () => {
        const result = await processRegexText({
            text: 'moon',
            phase: 'editoutput',
            templateContext,
            scripts: [
                {
                    id: 'second',
                    comment: 'second',
                    pattern: 'silver',
                    replacement: 'gold',
                    phase: 'editoutput',
                    enabled: true,
                    flags: 'g<order 1>',
                },
                {
                    id: 'first',
                    comment: 'first',
                    pattern: 'moon',
                    replacement:
                        '{{#if {{? {{getglobalvar::toggle_style}}=1 }}}}silver{{:else}}plain{{/if}}',
                    phase: 'editoutput',
                    enabled: true,
                    flags: 'g<order 2>',
                },
            ],
        })
        expect(result.text).toBe('gold')
        expect(result.appliedScriptIds).toEqual(['first', 'second'])
    })

    test('returns the last safe checkpoint when a regex phase times out', async () => {
        const source = `${'a'.repeat(100_000)}!`
        const result = await processRegexText({
            text: source,
            phase: 'editoutput',
            templateContext,
            timeoutMs: 20,
            scripts: [
                {
                    id: 'slow',
                    comment: 'catastrophic',
                    pattern: '(a+)+$',
                    replacement: 'x',
                    phase: 'editoutput',
                    enabled: true,
                    flags: 'g',
                },
            ],
        })
        expect(result.timedOut).toBeTrue()
        expect(result.text).toBe(source)
    })

    test('substitutes editdisplay captures before resolving PocketRisu asset CBS', async () => {
        const displayContext = {
            ...templateContext,
            assets: [
                {
                    name: 'surprised.webp',
                    type: 'x-risu-asset',
                    extension: 'webp',
                    url: '/api/v1/assets/surprised',
                },
            ],
        }
        const result = await processRegexText({
            text: '<Emotion="surprised">',
            phase: 'editdisplay',
            templateContext: displayContext,
            scripts: [
                {
                    id: 'emotion-image',
                    comment: 'emotion image',
                    pattern: '<Emotion="(.+?)">',
                    replacement: '{{img::$1.webp}}',
                    phase: 'editdisplay',
                    enabled: true,
                    flags: 'g',
                },
            ],
        })

        expect(result.text).toBe('{{img::surprised.webp}}')
        expect(
            renderTemplate(result.text, {
                ...displayContext,
                assetRenderMode: 'display',
            }).text,
        ).toContain('/api/v1/assets/surprised')
    })
})
