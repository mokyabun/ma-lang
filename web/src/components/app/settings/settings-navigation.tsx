import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { AppSearchInput } from '../app-search-input'
import { SETTINGS_NAV } from './navigation'
import type { SettingsPanelProps } from './types'

export function SettingsNavigation({
    section,
    onSectionChange,
}: Pick<SettingsPanelProps, 'section' | 'onSectionChange'>) {
    const [query, setQuery] = useState('')
    const visibleNavigation = SETTINGS_NAV.filter(({ label }) =>
        label.toLocaleLowerCase('ko').includes(query.trim().toLocaleLowerCase('ko')),
    )

    return (
        <nav
            className="relative flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 max-[720px]:flex-row max-[720px]:items-center max-[720px]:gap-1 max-[720px]:overflow-x-auto max-[720px]:border-b max-[720px]:border-r-0 max-[720px]:px-2 max-[720px]:py-2"
            aria-label="설정 카테고리"
        >
            <AppSearchInput
                label="설정 검색"
                className="max-[720px]:hidden"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="설정 검색…"
            />

            <div className="mt-6 grid gap-0.5 max-[720px]:contents">
                {visibleNavigation.map(({ section: target, label, icon: Icon }) => (
                    <Button
                        key={target}
                        type="button"
                        variant="ghost"
                        className="relative justify-start text-left text-muted-foreground hover:bg-selection hover:text-foreground data-active:bg-selection data-active:font-medium data-active:text-foreground data-active:after:absolute data-active:after:inset-y-2 data-active:after:-right-3 data-active:after:w-px data-active:after:bg-foreground/60 max-[720px]:shrink-0 max-[720px]:data-active:after:inset-x-3 max-[720px]:data-active:after:bottom-[-9px] max-[720px]:data-active:after:top-auto max-[720px]:data-active:after:h-px max-[720px]:data-active:after:w-auto [&_svg]:size-[1.1rem] [&_svg]:shrink-0"
                        data-active={section === target ? '' : undefined}
                        aria-current={section === target ? 'page' : undefined}
                        onClick={() => onSectionChange(target)}
                    >
                        <Icon aria-hidden="true" />
                        {label}
                    </Button>
                ))}
            </div>
            {!visibleNavigation.length ? (
                <p className="px-2 py-5 text-xs leading-5 text-muted-foreground max-[720px]:hidden">
                    일치하는 설정이 없습니다.
                </p>
            ) : null}
        </nav>
    )
}
