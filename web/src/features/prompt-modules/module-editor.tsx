import { useState } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ModuleAdvancedSection } from './advanced-section'
import { ModuleAssetsSection } from './assets-section'
import { ModuleLorebookSection } from './lorebook-section'
import { ModuleLuaSection } from './lua-section'
import { ModuleOverviewSection } from './overview-section'
import { ModulePromptsSection } from './prompts-section'
import { ModuleRegexSection } from './regex-section'
import type { ModuleEditorProps } from './types'

export type ModuleSection =
    | 'overview'
    | 'lua'
    | 'assets'
    | 'prompts'
    | 'advanced'
    | 'regex'
    | 'lorebook'

export function ModuleEditor({ value, assets, onChange }: ModuleEditorProps) {
    const [section, setSection] = useState<ModuleSection>('overview')
    const sections: Array<{ id: ModuleSection; label: string; count?: number }> = [
        { id: 'overview', label: '기본 정보' },
        { id: 'lua', label: 'Lua', count: value.luaScript ? 1 : 0 },
        { id: 'assets', label: '에셋', count: assets.length },
        { id: 'prompts', label: '프롬프트', count: value.prompts.length },
        { id: 'regex', label: '정규식', count: (value.regexScripts || []).length },
        { id: 'lorebook', label: '로어북', count: value.lorebook.length },
        { id: 'advanced', label: '고급 설정' },
    ]

    return (
        <div className="w-full py-9">
            <Tabs
                value={section}
                onValueChange={(next) => setSection(next as ModuleSection)}
                className="gap-0"
            >
                <TabsList
                    variant="line"
                    className="sticky top-0 z-10 overflow-x-auto border-b border-border bg-background/95 backdrop-blur"
                >
                    {sections.map((item) => (
                        <TabsTrigger key={item.id} value={item.id}>
                            {item.label}
                            {item.count === undefined ? null : (
                                <span className="font-mono text-[9px] text-muted-foreground">
                                    {item.count}
                                </span>
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <ModuleOverviewSection value={value} onChange={onChange} />

                <ModuleLuaSection value={value} onChange={onChange} />

                <ModuleAssetsSection assets={assets} />

                <ModulePromptsSection value={value} onChange={onChange} />

                <ModuleRegexSection value={value} onChange={onChange} />

                <ModuleLorebookSection value={value} onChange={onChange} />

                <ModuleAdvancedSection value={value} onChange={onChange} />
            </Tabs>
        </div>
    )
}
