import {
    NOVELAI_IMAGE_MODELS,
    type NovelAIImageParams,
    NovelAINoiseScheduleSchema,
    NovelAISamplerSchema,
} from '@malang/shared'
import { useId, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

import { parseParam, withParam } from './model'

const INHERIT = '__inherit__'

type NumberKey = 'steps' | 'scale' | 'cfgRescale' | 'width' | 'height' | 'seed'

const NUMBER_FIELDS: Array<{ key: NumberKey; label: string; step: number; integer: boolean }> = [
    { key: 'steps', label: 'Steps', step: 1, integer: true },
    { key: 'scale', label: 'Guidance (scale)', step: 0.1, integer: false },
    { key: 'cfgRescale', label: 'CFG rescale', step: 0.02, integer: false },
    { key: 'width', label: '너비', step: 64, integer: true },
    { key: 'height', label: '높이', step: 64, integer: true },
    { key: 'seed', label: 'Seed', step: 1, integer: true },
]

/**
 * Edits NovelAI parameters. With `fallback`, every field may be left blank to inherit it;
 * without, the value is complete and only the seed may be blank (random).
 */
export function ImageParamsFields({
    value,
    fallback,
    onChange,
}: {
    value: Partial<NovelAIImageParams>
    fallback?: NovelAIImageParams
    onChange: (next: Partial<NovelAIImageParams>) => void
}) {
    const modelListId = useId()
    const inherit = fallback !== undefined

    return (
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Label className="col-span-2 grid gap-2 text-xs font-medium text-muted-foreground max-sm:col-span-1">
                모델
                <Input
                    list={modelListId}
                    value={value.model ?? ''}
                    placeholder={fallback?.model}
                    onChange={(event) =>
                        onChange(withParam(value, 'model', event.target.value.trim() || undefined))
                    }
                />
                <datalist id={modelListId}>
                    {NOVELAI_IMAGE_MODELS.map((model) => (
                        <option key={model} value={model}>
                            {model}
                        </option>
                    ))}
                </datalist>
            </Label>
            <ChoiceField
                label="샘플러"
                value={value.sampler}
                options={NovelAISamplerSchema.options}
                inheritLabel={inherit ? `기본값 (${fallback.sampler})` : undefined}
                onChange={(sampler) => onChange(withParam(value, 'sampler', sampler))}
            />
            <ChoiceField
                label="노이즈 스케줄"
                value={value.noiseSchedule}
                options={NovelAINoiseScheduleSchema.options}
                inheritLabel={inherit ? `기본값 (${fallback.noiseSchedule})` : undefined}
                onChange={(noiseSchedule) =>
                    onChange(withParam(value, 'noiseSchedule', noiseSchedule))
                }
            />
            {NUMBER_FIELDS.map((field) => (
                <ParamNumberField
                    // Remount when the value changes from outside so the draft text follows it.
                    key={`${field.key}:${value[field.key] ?? ''}`}
                    label={field.label}
                    value={value[field.key] ?? undefined}
                    step={field.step}
                    integer={field.integer}
                    placeholder={
                        inherit
                            ? `기본값 ${fallback[field.key] ?? '무작위'}`
                            : field.key === 'seed'
                              ? '비우면 무작위'
                              : undefined
                    }
                    clearable={inherit || field.key === 'seed'}
                    onCommit={(next) => {
                        if (field.key === 'seed' && !inherit) {
                            onChange({ ...value, seed: next ?? null })
                            return
                        }
                        onChange(withParam(value, field.key, next))
                    }}
                />
            ))}
        </div>
    )
}

function ChoiceField<T extends string>({
    label,
    value,
    options,
    inheritLabel,
    onChange,
}: {
    label: string
    value: T | undefined
    options: readonly T[]
    inheritLabel?: string
    onChange: (value: T | undefined) => void
}) {
    return (
        <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
            {label}
            <Select
                value={value ?? INHERIT}
                onValueChange={(next) =>
                    onChange(next === INHERIT ? undefined : (String(next) as T))
                }
            >
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                    {inheritLabel ? <SelectItem value={INHERIT}>{inheritLabel}</SelectItem> : null}
                    {options.map((option) => (
                        <SelectItem key={option} value={option}>
                            {option}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Label>
    )
}

function ParamNumberField({
    label,
    value,
    step,
    integer,
    placeholder,
    clearable,
    onCommit,
}: {
    label: string
    value: number | undefined
    step: number
    integer: boolean
    placeholder?: string
    clearable: boolean
    onCommit: (value: number | undefined) => void
}) {
    const [draft, setDraft] = useState(value === undefined ? '' : String(value))

    function commit() {
        const parsed = parseParam(draft)
        if (parsed === undefined && !clearable) {
            setDraft(value === undefined ? '' : String(value))
            return
        }
        onCommit(parsed === undefined ? undefined : integer ? Math.round(parsed) : parsed)
    }

    return (
        <Label className="grid gap-2 text-xs font-medium text-muted-foreground">
            {label}
            <Input
                type="number"
                value={draft}
                step={step}
                placeholder={placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                }}
            />
        </Label>
    )
}
