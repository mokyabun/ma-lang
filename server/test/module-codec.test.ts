import { describe, expect, test } from 'bun:test'

import { exportPromptModule, importPromptModule } from '../src/services/prompt/module-codec'
import { appConfig } from './fixtures'

const limits = appConfig().limits

describe('Risu prompt module codec', () => {
    const input = {
        name: 'Moon rules',
        description: 'Server-side prompt additions',
        namespace: 'test.moon-rules',
        enabledByDefault: true,
        prompts: [
            {
                id: crypto.randomUUID(),
                name: 'Narration rule',
                enabled: true,
                toggleKey: null,
                role: 'system' as const,
                position: 'afterMain' as const,
                content: 'Write restrained narration.',
            },
        ],
        toggles: [],
        regexScripts: [
            {
                id: crypto.randomUUID(),
                comment: 'Moon styling',
                pattern: 'moon',
                replacement: 'silver moon',
                phase: 'editdisplay' as const,
                enabled: true,
                flags: 'gi',
            },
        ],
        backgroundEmbedding: '<style>.risu-chat { color: silver; }</style>',
        lorebook: [
            {
                id: crypto.randomUUID(),
                keys: ['moon'],
                secondaryKeys: [],
                content: 'The moon archive closes at dawn.',
                enabled: true,
                constant: false,
                selective: false,
                caseSensitive: false,
                useRegex: false,
                insertionOrder: 100,
                priority: 100,
                name: 'Moon archive',
            },
        ],
    }

    test('reads .risum modules with more assets than the old fixed cap, up to the configured limit', async () => {
        const encoded = exportPromptModule(
            input,
            'risum',
            Array.from({ length: 5000 }, (_, index) => ({
                bytes: new Uint8Array([index % 256]),
                type: 'other',
                name: `asset-${index}`,
                extension: 'webp',
                sourceUri: 'test:',
                mimeType: 'image/webp',
            })),
        )
        const decoded = await importPromptModule(encoded, 'many.risum', {
            ...limits,
            archiveEntries: 65536,
        })
        expect(decoded.assets).toHaveLength(5000)
        expect(await decoded.assets[4999]!.read()).toEqual(new Uint8Array([4999 % 256]))
        expect(
            importPromptModule(encoded, 'many.risum', { ...limits, archiveEntries: 4999 }),
        ).rejects.toThrow('MAX_ARCHIVE_ENTRIES=4999')
        expect(
            importPromptModule(encoded, 'many.risum', { ...limits, assetBytes: 0 }),
        ).rejects.toThrow('MAX_ASSET_BYTES=0')
    })

    test('round-trips the legacy .risum envelope', async () => {
        const encoded = exportPromptModule(input, 'risum', [
            {
                bytes: new Uint8Array([1, 2, 3, 4]),
                type: 'other',
                name: 'moon-icon',
                extension: 'webp',
                sourceUri: 'test:',
                mimeType: 'image/webp',
            },
        ])
        expect(encoded[0]).toBe(111)
        const decoded = await importPromptModule(encoded, 'moon.risum', limits)
        expect(decoded.input.name).toBe(input.name)
        expect(decoded.input.namespace).toBe(input.namespace)
        expect(decoded.input.prompts[0]).toMatchObject({
            content: 'Write restrained narration.',
            position: 'afterMain',
        })
        expect(decoded.input.lorebook[0]).toMatchObject({
            keys: ['moon'],
            content: 'The moon archive closes at dawn.',
        })
        expect(decoded.input.toggles).toEqual([])
        expect(decoded.input.regexScripts?.[0]).toMatchObject({
            pattern: 'moon',
            phase: 'editdisplay',
        })
        expect(decoded.input.backgroundEmbedding).toBe(input.backgroundEmbedding)
        expect(decoded.assets[0]).toMatchObject({ name: 'moon-icon', extension: 'webp' })
        expect(await decoded.assets[0]?.read()).toEqual(new Uint8Array([1, 2, 3, 4]))
    })

    test('preserves background CSS and round-trips inert PocketRisu metadata', async () => {
        const source = new TextEncoder().encode(
            JSON.stringify({
                type: 'risuModule',
                name: 'Unsafe module',
                id: 'risu-id',
                regex: [{ in: 'a', out: 'b' }],
                trigger: [{ type: 'manual' }],
                cjs: 'fetch("https://example.invalid")',
                mcp: { url: 'https://mcp.example.invalid/sse' },
                hideIcon: true,
                icon: 'asset://module-icon',
                backgroundEmbedding: '<script>alert(1)</script>',
                lorebook: [],
            }),
        )
        const decoded = await importPromptModule(source, 'unsafe.json', limits)
        expect(decoded.warnings.join('\n')).toContain('never executed')
        expect(decoded.input.backgroundEmbedding).toBe('<script>alert(1)</script>')
        expect(decoded.source.cjs).toContain('fetch')

        const roundTrip = await importPromptModule(
            exportPromptModule(decoded.input, 'risum', [], decoded.source),
            'unsafe.risum',
            limits,
        )
        expect(roundTrip.source).toMatchObject({
            module: {
                cjs: 'fetch("https://example.invalid")',
                mcp: { url: 'https://mcp.example.invalid/sse' },
                hideIcon: true,
                icon: 'asset://module-icon',
            },
        })
    })

    test('keeps implicit module toggle references without inventing declarations', async () => {
        const source = new TextEncoder().encode(
            JSON.stringify({
                type: 'risuModule',
                name: 'Implicit toggles',
                id: 'risu-id',
                customModuleToggle: '',
                lorebook: [
                    {
                        key: '',
                        content:
                            '{{#if {{getglobalvar::toggle_response_mode}}}}quiet{{/if}} {{#when::toggle::show_cue}}cue{{/when}}',
                        alwaysActive: true,
                        mode: 'constant',
                    },
                ],
                regex: [{ in: '{{getglobalvar::toggle_ruby}}', out: '$&' }],
            }),
        )
        const decoded = await importPromptModule(source, 'implicit.json', limits)
        expect(decoded.input.toggles).toEqual([])
        expect(decoded.input.regexScripts).toHaveLength(1)
    })

    test('imports legacy object module toggle declarations', async () => {
        const source = new TextEncoder().encode(
            JSON.stringify({
                type: 'risuModule',
                name: 'Object toggles',
                id: 'risu-id',
                customModuleToggle: {
                    prose: { label: 'Detailed prose', defaultEnabled: true },
                    sound: 'Sound effects',
                },
                lorebook: [],
            }),
        )
        const decoded = await importPromptModule(source, 'object.json', limits)
        expect(decoded.input.toggles).toEqual([
            {
                key: 'prose',
                label: 'Detailed prose',
                type: 'boolean',
                options: [],
                defaultValue: '1',
            },
            {
                key: 'sound',
                label: 'Sound effects',
                type: 'boolean',
                options: [],
                defaultValue: '',
            },
        ])
    })

    test('round-trips every PocketRisu custom toggle control used by modules', async () => {
        const syntax = [
            '=⚡ GigaTrans=group',
            'gigatrans.auto=자동 번역',
            'gigatrans.ctxmode=컨텍스트 모드=select=기본,반전,번역만 반전',
            'gigatrans.note=메모=text',
            'gigatrans.prompt=추가 지시=textarea',
            '=기본/반전 동작 안내=caption',
            '=프롬프트=divider',
            '==groupEnd',
        ].join('\n')
        const decoded = await importPromptModule(
            new TextEncoder().encode(
                JSON.stringify({
                    type: 'risuModule',
                    name: 'GigaTrans',
                    id: 'giga-trans',
                    customModuleToggle: syntax,
                    lorebook: [],
                }),
            ),
            'giga.json',
            limits,
        )

        expect(
            decoded.input.toggles.map(({ key, label, type, options }) => ({
                key,
                label,
                type,
                options,
            })),
        ).toEqual([
            { key: '', label: '⚡ GigaTrans', type: 'group', options: [] },
            { key: 'gigatrans.auto', label: '자동 번역', type: 'boolean', options: [] },
            {
                key: 'gigatrans.ctxmode',
                label: '컨텍스트 모드',
                type: 'select',
                options: ['기본', '반전', '번역만 반전'],
            },
            { key: 'gigatrans.note', label: '메모', type: 'text', options: [] },
            { key: 'gigatrans.prompt', label: '추가 지시', type: 'textarea', options: [] },
            { key: '', label: '기본/반전 동작 안내', type: 'caption', options: [] },
            { key: '', label: '프롬프트', type: 'divider', options: [] },
            { key: '', label: '', type: 'groupEnd', options: [] },
        ])

        const roundTrip = await importPromptModule(
            exportPromptModule(decoded.input, 'risum'),
            'giga.risum',
            limits,
        )
        expect(roundTrip.input.toggles).toEqual(decoded.input.toggles)
    })

    test('executes the first Lua trigger and round-trips permission, raw triggers, and order', async () => {
        const triggers = [
            {
                type: 'manual',
                comment: 'primary',
                effect: [
                    { type: 'triggerlua', code: 'function ping(id) setChatVar(id, "x", "1") end' },
                ],
            },
            {
                type: 'manual',
                comment: 'secondary',
                effect: [{ type: 'triggerlua', code: 'function ignored(id) end' }],
            },
        ]
        const decoded = await importPromptModule(
            new TextEncoder().encode(
                JSON.stringify({
                    type: 'risuModule',
                    name: 'Lua module',
                    trigger: triggers,
                    lowLevelAccess: true,
                    runtimeOrder: 17,
                    lorebook: [],
                }),
            ),
            'lua.json',
            limits,
        )
        expect(decoded.input.luaScript).toMatchObject({
            enabled: true,
            lowLevelAccess: true,
            code: expect.stringContaining('function ping'),
        })
        expect(decoded.input.runtimeOrder).toBe(17)
        expect(decoded.input.luaRawTriggers).toEqual(triggers)
        expect(decoded.warnings.join('\n')).toContain('only the first is executed')

        decoded.input.luaScript!.code = 'function ping(id) setChatVar(id, "x", "2") end'
        const roundTrip = await importPromptModule(
            exportPromptModule(decoded.input, 'risum'),
            'lua.risum',
            limits,
        )
        expect(roundTrip.input.luaScript).toMatchObject({
            code: expect.stringContaining('"2"'),
            lowLevelAccess: true,
        })
        expect(roundTrip.input.luaRawTriggers).toHaveLength(2)
        expect(roundTrip.input.runtimeOrder).toBe(17)
    })
})
