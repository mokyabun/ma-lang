import type { PocketRisuProfileBinding } from '@malang/shared'

import { SettingsGroup } from '@/components/form/settings-group'

import { nativeProfileFieldKeys } from './model'
import { ProfileFieldGrid } from './profile-field-grid'

export function SchemaDefinedSettings({
    binding,
    values,
    onChange,
}: {
    binding: PocketRisuProfileBinding
    values: Record<string, unknown>
    onChange: (key: string, value: unknown) => void
}) {
    const { profile } = binding.envelope
    const uiFields = new Map(profile.uiSchema.fields.map((field) => [field.key, field]))
    const fields = profile.schema
        .filter(
            (field) =>
                !field.secret &&
                field.mapsTo?.target !== 'auth' &&
                !nativeProfileFieldKeys.has(field.key),
        )
        .sort((left, right) => {
            const leftUi = uiFields.get(left.key)
            const rightUi = uiFields.get(right.key)
            return (leftUi?.order ?? 999) - (rightUi?.order ?? 999)
        })
    const basic = fields.filter((field) => uiFields.get(field.key)?.visibility !== 'advanced')
    const advanced = fields.filter((field) => uiFields.get(field.key)?.visibility === 'advanced')

    return (
        <>
            {basic.length ? (
                <ProfileFieldGrid
                    fields={basic}
                    binding={binding}
                    values={values}
                    onChange={onChange}
                    compact
                />
            ) : null}
            {advanced.length ? (
                <SettingsGroup title="고급 설정" meta={`${advanced.length}개`}>
                    <ProfileFieldGrid
                        fields={advanced}
                        binding={binding}
                        values={values}
                        onChange={onChange}
                        compact
                    />
                </SettingsGroup>
            ) : null}
        </>
    )
}
