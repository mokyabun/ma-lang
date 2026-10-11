import type { PocketRisuProfileBinding, PocketRisuProfileField } from '@malang/shared'

import { cn } from '@/lib/utils'

import { ProfileFieldEditor } from './profile-field-editor'

export function ProfileFieldGrid({
    fields,
    binding,
    values,
    onChange,
    compact = false,
}: {
    fields: PocketRisuProfileField[]
    binding: PocketRisuProfileBinding
    values: Record<string, unknown>
    onChange: (key: string, value: unknown) => void
    compact?: boolean
}) {
    const uiFields = new Map(
        binding.envelope.profile.uiSchema.fields.map((field) => [field.key, field]),
    )
    const groups = new Map(
        binding.envelope.profile.uiSchema.groups.map((group) => [group.id, group]),
    )
    const grouped = new Map<string, PocketRisuProfileField[]>()
    for (const field of fields) {
        const groupId = uiFields.get(field.key)?.group ?? 'other'
        grouped.set(groupId, [...(grouped.get(groupId) ?? []), field])
    }

    return (
        <div className={cn('grid gap-5 px-4 py-4', compact && 'px-0 py-0')}>
            {[...grouped.entries()].map(([groupId, groupFields]) => {
                const group = groups.get(groupId)
                const label = group?.labelI18n?.ko || group?.label || '기타'
                return (
                    <div key={groupId} className="grid gap-3">
                        <p className="font-mono text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
                            {label.toUpperCase()}
                        </p>
                        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                            {groupFields.map((field) => (
                                <ProfileFieldEditor
                                    key={field.key}
                                    field={field}
                                    placeholder={uiFields.get(field.key)?.placeholder}
                                    value={values[field.key] ?? field.default}
                                    onChange={(value) => onChange(field.key, value)}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
