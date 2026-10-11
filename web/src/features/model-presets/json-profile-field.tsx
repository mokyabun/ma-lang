import { useState } from 'react'

import { Textarea } from '@/components/ui/textarea'

export function JsonProfileField({
    value,
    placeholder,
    onChange,
}: {
    value: unknown
    placeholder?: string
    onChange: (value: unknown) => void
}) {
    const [text, setText] = useState(value === undefined ? '' : JSON.stringify(value, null, 2))
    const [invalid, setInvalid] = useState(false)
    return (
        <div className="grid gap-1">
            <Textarea
                className="min-h-24 font-mono text-xs"
                aria-invalid={invalid}
                value={text}
                placeholder={placeholder || '{}'}
                onChange={(event) => {
                    const next = event.target.value
                    setText(next)
                    try {
                        onChange(next.trim() ? JSON.parse(next) : undefined)
                        setInvalid(false)
                    } catch {
                        setInvalid(true)
                    }
                }}
            />
            {invalid ? (
                <small className="text-destructive">올바른 JSON을 입력해 주세요.</small>
            ) : null}
        </div>
    )
}
