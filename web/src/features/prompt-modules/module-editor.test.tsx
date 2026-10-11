import { describe, expect, test } from 'bun:test'

import { renderToStaticMarkup } from 'react-dom/server'

import { Tabs } from '@/components/ui/tabs'

import { ModuleAdvancedSection } from './advanced-section'
import { ModuleAssetsSection } from './assets-section'
import { ModuleLorebookSection } from './lorebook-section'
import { ModuleLuaSection } from './lua-section'
import { blankModule } from './model'
import { ModuleEditor } from './module-editor'
import { ModuleOverviewSection } from './overview-section'
import { ModulePromptsSection } from './prompts-section'
import { ModuleRegexSection } from './regex-section'

describe('split module editor', () => {
    test('keeps all module tabs in the workbench', () => {
        const html = renderToStaticMarkup(
            <ModuleEditor value={blankModule()} assets={[]} onChange={() => {}} />,
        )
        for (const label of [
            '기본 정보',
            'Lua',
            '에셋',
            '프롬프트',
            '고급 설정',
            '정규식',
            '로어북',
        ]) {
            expect(html).toContain(label)
        }
        expect(html).not.toContain('커스텀 토글')
        expect(html).not.toContain('value="toggles"')
    })

    const sections = [
        { id: 'overview', Component: ModuleOverviewSection, content: 'Namespace' },
        { id: 'lua', Component: ModuleLuaSection, content: 'Low-Level API 허용' },
        {
            id: 'assets',
            Component: ModuleAssetsSection,
            content: '이 모듈에 포함된 에셋이 없습니다.',
        },
        { id: 'prompts', Component: ModulePromptsSection, content: '프롬프트 삽입' },
        { id: 'advanced', Component: ModuleAdvancedSection, content: '커스텀 토글' },
        { id: 'regex', Component: ModuleRegexSection, content: '모듈 정규식' },
        { id: 'lorebook', Component: ModuleLorebookSection, content: '모듈 로어북' },
    ]
    test.each(sections)('renders the $id panel independently', ({ id, Component, content }) => {
        const value = blankModule()
        value.toggles = [
            {
                key: 'feature',
                label: '기능 표시',
                type: 'boolean',
                options: [],
                defaultValue: '1',
            },
        ]
        const html = renderToStaticMarkup(
            <Tabs value={id}>
                <Component value={value} assets={[]} onChange={() => {}} />
            </Tabs>,
        )
        expect(html).toContain(content)
        expect(html).toContain('role="tabpanel"')
        if (id === 'advanced') {
            expect(html).toContain('<textarea')
            expect(html).toContain('feature=기능 표시')
            expect(html).not.toContain('토글 삭제')
            expect(html).not.toContain('data-slot="collapsible"')
        }
    })
})
