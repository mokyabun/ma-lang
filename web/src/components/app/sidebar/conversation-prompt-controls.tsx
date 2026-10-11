import type { ConversationModuleState, PromptPreset, PromptToggle } from '@malang/shared'
import { Lock, LockOpen } from '@phosphor-icons/react'
import { useState } from 'react'

import { SettingsGroup } from '@/components/app/settings/shared/settings-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/hooks/use-debounced-save'

export function GlobalPromptPresetSelect({
    value,
    presets,
    onChange,
}: {
    value: string
    presets: PromptPreset[]
    onChange: (value: string) => void | Promise<void>
}) {
    return (
        <Select value={value} onValueChange={(next) => void onChange(next as string)}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder="프롬프트 프리셋 선택" />
            </SelectTrigger>
            <SelectContent align="start">
                {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export function ModuleActivationControl({
    state,
    onGlobalChange,
    onConversationChange,
}: {
    state: ConversationModuleState
    onGlobalChange: (moduleId: string, enabled: boolean) => void | Promise<void>
    onConversationChange: (moduleId: string, enabled: boolean | null) => void | Promise<void>
}) {
    const locked = !state.inherited
    const Icon = locked ? Lock : LockOpen
    const enabled = locked ? state.enabled : state.module.enabledByDefault

    return (
        <div className="grid gap-2 rounded-md bg-background px-2.5 py-2.5">
            <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-foreground">
                    {state.module.name}
                </span>
                {locked ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                        이 채팅에 고정됨
                    </span>
                ) : null}
            </div>
            <div className="flex items-center justify-end gap-2">
                <Button
                    type="button"
                    size="icon-sm"
                    variant={locked ? 'secondary' : 'outline'}
                    aria-label={`${state.module.name} ${locked ? '잠금 해제' : '현재 값으로 잠금'}`}
                    aria-pressed={locked}
                    title={`${state.module.name} ${locked ? '잠금 해제' : '현재 값으로 잠금'}`}
                    onClick={() =>
                        void onConversationChange(state.module.id, locked ? null : state.enabled)
                    }
                >
                    <Icon aria-hidden="true" />
                </Button>
                <span className="text-[10px] text-muted-foreground">
                    {locked ? '이 채팅' : 'Global'}
                </span>
                <Switch
                    size="sm"
                    checked={enabled}
                    aria-label={`${state.module.name} ${locked ? '이 채팅' : 'Global'} 활성화`}
                    onCheckedChange={(checked) =>
                        void (locked
                            ? onConversationChange(state.module.id, checked)
                            : onGlobalChange(state.module.id, checked))
                    }
                />
            </div>
        </div>
    )
}

export function PromptToggleControls({
    toggles,
    values,
    onChange,
}: {
    toggles: PromptToggle[]
    values: Record<string, string>
    onChange: (values: Record<string, string>) => void | Promise<void>
}) {
    const [draft, setDraft] = useState(values)
    const groups = groupPromptToggles(toggles)
    const autoSave = useDebouncedSave(draft, async (next) => onChange(next), { delay: 350 })

    function update(next: Record<string, string>, immediate = false) {
        setDraft(next)
        if (immediate) void autoSave.saveNow(next)
    }

    return (
        <div
            className="grid gap-2"
            aria-label="전역 프롬프트 토글"
            onBlurCapture={() => void autoSave.flush()}
        >
            {groups.map((group) => (
                <SettingsGroup
                    key={group.id}
                    title={group.label}
                    meta={group.controls.length}
                    className="border-sidebar-border bg-background/50"
                    contentClassName="border-sidebar-border p-0"
                >
                    {group.controls.map((toggle, index) => (
                        <PromptToggleControl
                            key={`${toggle.key || toggle.type}-${index}`}
                            toggle={toggle}
                            value={draft[toggle.key] ?? toggle.defaultValue}
                            values={draft}
                            onChange={update}
                        />
                    ))}
                </SettingsGroup>
            ))}
        </div>
    )
}

type PromptToggleSection = {
    id: string
    label: string
    controls: PromptToggle[]
}

function groupPromptToggles(toggles: PromptToggle[]): PromptToggleSection[] {
    const groups: PromptToggleSection[] = []
    let current: PromptToggleSection | null = null

    function ensureGroup() {
        if (!current) {
            current = {
                id: `default-${groups.length}`,
                label: '기본 토글',
                controls: [],
            }
        }
        return current
    }

    function flushGroup() {
        if (current?.controls.length) groups.push(current)
        current = null
    }

    for (const toggle of toggles) {
        if (toggle.type === 'group') {
            flushGroup()
            current = {
                id: `group-${groups.length}-${toggle.key || toggle.label}`,
                label: toggle.label || '토글 그룹',
                controls: [],
            }
            continue
        }
        if (toggle.type === 'groupEnd') {
            flushGroup()
            continue
        }
        ensureGroup().controls.push(toggle)
    }
    flushGroup()
    return groups
}

function PromptToggleControl({
    toggle,
    value,
    values,
    onChange,
}: {
    toggle: PromptToggle
    value: string
    values: Record<string, string>
    onChange: (values: Record<string, string>, immediate?: boolean) => void
}) {
    if (toggle.type === 'caption') {
        return (
            <strong className="block border-t border-sidebar-border/70 px-3.5 py-2 font-mono text-[9px] tracking-wider text-muted-foreground first:border-t-0">
                {toggle.label}
            </strong>
        )
    }
    if (toggle.type === 'divider') return <hr className="border-sidebar-border" />
    if (toggle.type === 'group' || toggle.type === 'groupEnd') return null

    return (
        <Label className="grid min-w-0 gap-1.5 border-t border-sidebar-border/70 px-3.5 py-2.5 text-xs leading-normal text-foreground first:border-t-0">
            <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate">{toggle.label}</span>
                {toggle.type === 'boolean' ? (
                    <Switch
                        size="sm"
                        checked={value === '1' || value === 'true'}
                        onCheckedChange={(checked) =>
                            onChange({ ...values, [toggle.key]: checked ? '1' : '0' }, true)
                        }
                    />
                ) : null}
            </span>
            {toggle.type === 'select' ? (
                <Select
                    value={value}
                    onValueChange={(next) =>
                        onChange({ ...values, [toggle.key]: next as string }, true)
                    }
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="값 선택" />
                    </SelectTrigger>
                    <SelectContent align="start">
                        {toggle.options.map((option, optionIndex) => (
                            <SelectItem
                                key={`${option}-${optionIndex}`}
                                value={String(optionIndex)}
                            >
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : toggle.type === 'textarea' ? (
                <Textarea
                    className="field-sizing-fixed resize-y"
                    value={value}
                    rows={3}
                    onChange={(event) => onChange({ ...values, [toggle.key]: event.target.value })}
                />
            ) : toggle.type === 'text' ? (
                <Input
                    value={value}
                    onChange={(event) => onChange({ ...values, [toggle.key]: event.target.value })}
                />
            ) : null}
        </Label>
    )
}
