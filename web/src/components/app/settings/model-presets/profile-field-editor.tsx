import type { PocketRisuProfileField } from '@malang/shared'

import { Field } from '@/components/form/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { JsonProfileField } from './json-profile-field'
import { finiteNumber, enumValue, scalarProfileValue } from './model'

export function ProfileFieldEditor({
    field,
    placeholder,
    value,
    onChange,
}: {
    field: PocketRisuProfileField
    placeholder?: string
    value: unknown
    onChange: (value: unknown) => void
}) {
    const description = field.descriptionI18n?.ko || field.description
    if (field.type === 'boolean') {
        return (
            <div className="col-span-full flex items-start justify-between gap-4 border-b border-border/70 py-2 last:border-b-0">
                <div>
                    <p className="text-xs font-medium">{field.label}</p>
                    {description ? (
                        <p className="mt-1 max-w-xl text-[10px] leading-5 text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
                <Switch
                    aria-label={field.label}
                    checked={Boolean(value)}
                    onCheckedChange={onChange}
                />
            </div>
        )
    }

    return (
        <Field label={field.label} description={description}>
            {field.enum?.length ? (
                <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={scalarProfileValue(value)}
                    onChange={(event) => onChange(enumValue(field, event.target.value))}
                >
                    {!field.required &&
                    !field.enum.some((option) => String(option.value) === '') ? (
                        <option value="">Provider 기본값</option>
                    ) : null}
                    {field.enum.map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : field.type === 'json' ? (
                <JsonProfileField value={value} placeholder={placeholder} onChange={onChange} />
            ) : field.type === 'stringArray' ? (
                <Textarea
                    className="min-h-20 font-mono text-xs"
                    value={Array.isArray(value) ? value.join('\n') : ''}
                    placeholder={placeholder || '한 줄에 하나씩 입력'}
                    onChange={(event) =>
                        onChange(
                            event.target.value
                                .split('\n')
                                .map((item) => item.trim())
                                .filter(Boolean),
                        )
                    }
                />
            ) : (
                <Input
                    type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                    min={field.min}
                    max={field.max}
                    step={field.type === 'integer' ? 1 : field.step}
                    value={typeof value === 'string' || typeof value === 'number' ? value : ''}
                    placeholder={placeholder}
                    onChange={(event) =>
                        onChange(
                            field.type === 'number' || field.type === 'integer'
                                ? finiteNumber(event.target.value)
                                : event.target.value,
                        )
                    }
                />
            )}
        </Field>
    )
}
