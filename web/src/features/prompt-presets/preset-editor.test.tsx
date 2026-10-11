import { describe, expect, test } from 'bun:test'

import { renderToStaticMarkup } from 'react-dom/server'

import { Tabs } from '@/components/ui/tabs'

import { blankPreset } from './model'
import { PresetEditor } from './preset-editor'
import { PresetEditorSections } from './preset-editor-sections'
import type { PresetSection } from './types'

describe('split prompt preset panels', () => {
    const panels: Array<[PresetSection, string]> = [
        ['overview', '프리셋 이름'],
        ['prompt', '역할 / 내용'],
        ['advanced', '커스텀 토글'],
        ['parameters', '최대 컨텍스트 크기'],
        ['regex', '프리셋 정규식'],
        ['settings', '기본 변수'],
    ]
    test.each(panels)('renders only the %s panel with its tab association', (section, title) => {
        const value = blankPreset()
        value.toggles = [
            {
                key: 'feature',
                label: '기능 표시',
                type: 'boolean',
                options: [],
                defaultValue: '1',
            },
        ]
        const html = renderPanel(section, value)
        expect(html).toContain(title)
        if (section === 'advanced') {
            expect(html).toContain('<textarea')
            expect(html).toContain('feature=기능 표시')
            expect(html).not.toContain('토글 삭제')
            expect(html).not.toContain('data-slot="collapsible"')
        }
        expect(html).toContain(`id="preset-panel-${section}"`)
        expect(html).toContain(`aria-labelledby="preset-tab-${section}"`)
        for (const [other] of panels) {
            if (other !== section) expect(html).not.toContain(`id="preset-panel-${other}"`)
        }
    })

    test('starts in basic information and keeps the name inside its panel', () => {
        const html = renderToStaticMarkup(
            <PresetEditor value={blankPreset()} onChange={() => {}} />,
        )
        expect(html).toContain('기본 정보')
        expect(html).toContain('고급 설정')
        expect(html).not.toContain('preset-tab-toggles')
        expect(html).toContain('id="preset-panel-overview"')
        expect(html.indexOf('id="preset-panel-overview"')).toBeLessThan(
            html.indexOf('aria-label="프리셋 이름"'),
        )
        expect(html).not.toContain('id="preset-panel-prompt"')
    })

    test('caps long stop sequences without truncating their values', () => {
        const value = blankPreset()
        value.parameters.stopSequences = Array.from({ length: 100 }, (_, index) => `stop-${index}`)
        const html = renderPanel('parameters', value)
        expect(html).toContain('max-h-56')
        expect(html).toContain('overflow-y-auto')
        expect(html).toContain('stop-99')
    })
})

function renderPanel(section: PresetSection, value = blankPreset()) {
    return renderToStaticMarkup(
        <Tabs value={section}>
            <PresetEditorSections
                section={section}
                value={value}
                promptSettings={{
                    assistantPrefill: '',
                    postEndInnerFormat: '',
                    sendChatAsSystem: false,
                    sendName: false,
                    trimStartNewChat: false,
                    groupTemplate: '',
                }}
                onChange={() => {}}
                updateBlock={() => {}}
                moveBlock={() => {}}
                updateParameter={() => {}}
                updateVariables={() => {}}
            />
        </Tabs>,
    )
}
