import { PromptToggleSchema, type PromptToggle } from '@malang/shared'

export type ToggleSyntaxError = { line: number | null; message: string }
type ParseResult =
    | { toggles: PromptToggle[]; errors: [] }
    | { toggles: null; errors: ToggleSyntaxError[] }

function serializeToggle(toggle: PromptToggle) {
    const base = `${toggle.key}=${toggle.label}`
    if (toggle.type === 'boolean') return base
    if (toggle.type === 'select') return `${base}=select=${toggle.options.join(',')}`
    return `${base}=${toggle.type}`
}

export function serializeToggleText(toggles: PromptToggle[]) {
    return toggles.map(serializeToggle).join('\n')
}

export function parseToggleText(
    text: string,
    previous: PromptToggle[],
    maxCount: number,
): ParseResult {
    const errors: ToggleSyntaxError[] = []
    const toggles: PromptToggle[] = []
    const remaining = [...previous]
    const lines = text.split(/\r?\n/)
    const unchanged = new Map<number, PromptToggle>()
    // Reserve exact matches first so edited rows cannot consume their defaults on duplicate keys.
    for (const [index, line] of lines.entries()) {
        const match = remaining.findIndex((toggle) => serializeToggle(toggle) === line)
        if (match !== -1) unchanged.set(index, remaining.splice(match, 1)[0]!)
    }
    let count = 0

    for (const [index, line] of lines.entries()) {
        if (!line.trim()) continue
        count += 1

        // Preserve unchanged records exactly, including fields the text format cannot express.
        const exact = unchanged.get(index)
        if (exact) {
            toggles.push(exact)
            continue
        }

        const [key = '', label = '', rawType = '', rawOptions = '', ...extra] = line.split('=')
        const type = !rawType || rawType === 'toggle' ? 'boolean' : rawType
        const fail = (message: string) => errors.push({ line: index + 1, message })
        if (!line.includes('=') || extra.length || (type !== 'select' && rawOptions)) {
            fail('키=이름=타입 형식을 확인하세요. 필드 안에는 = 문자를 사용할 수 없습니다.')
            continue
        }

        const parsed = PromptToggleSchema.safeParse({
            key,
            label,
            type,
            options: type === 'select' && rawOptions ? rawOptions.split(',') : [],
            defaultValue: type === 'boolean' || type === 'select' ? '0' : '',
        })
        if (!parsed.success) {
            const field = parsed.error.issues[0]?.path[0]
            fail(
                field === 'type'
                    ? '지원하지 않는 타입입니다. 문법 안내에서 사용 가능한 타입을 확인하세요.'
                    : '키는 100자, 이름은 200자, 선택 옵션은 각각 500자·최대 200개까지 가능합니다.',
            )
            continue
        }

        const toggle = parsed.data
        const layout = ['group', 'groupEnd', 'divider', 'caption'].includes(toggle.type)
        if (!layout && (!key.trim() || !label.trim())) {
            fail('토글의 키와 이름을 모두 입력하세요.')
            continue
        }

        const previousIndex = remaining.findIndex((item) => item.key === key && item.type === type)
        if (previousIndex !== -1) {
            toggle.defaultValue = remaining.splice(previousIndex, 1)[0]!.defaultValue
        }
        toggles.push(toggle)
    }

    if (count > maxCount) {
        errors.push({ line: null, message: `토글은 최대 ${maxCount}개까지 입력할 수 있습니다.` })
    }
    return errors.length ? { toggles: null, errors } : { toggles, errors: [] }
}
