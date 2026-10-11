import type { LoreEntry, LoreEntryInput } from '@malang/shared'

export function blankLoreEntry(insertionOrder = 0): LoreEntry {
    return {
        id: crypto.randomUUID(),
        keys: [],
        secondaryKeys: [],
        content: '',
        enabled: true,
        constant: false,
        selective: false,
        caseSensitive: false,
        useRegex: false,
        insertionOrder,
        priority: 0,
        name: '새 로어',
        position: '',
        depth: 0,
        role: 'system',
        recursive: 'global',
        probability: 100,
        additionalKeys: [],
        excludeKeys: [],
        decorators: {},
        isGroup: false,
    }
}

export function normalizeLoreEntry(value: LoreEntryInput): LoreEntry {
    return {
        ...value,
        position: value.position ?? '',
        depth: value.depth ?? 0,
        role: value.role ?? 'system',
        scanDepth: value.scanDepth,
        recursive: value.recursive ?? 'global',
        probability: value.probability ?? 100,
        additionalKeys: value.additionalKeys ?? [],
        excludeKeys: value.excludeKeys ?? [],
        fullWordMatching: value.fullWordMatching,
        decorators: value.decorators ?? {},
        isGroup: value.isGroup ?? false,
    }
}

export const LORE_POSITION_OPTIONS = [
    { value: '', label: '기본 (로어북 블록)' },
    { value: 'before_desc', label: '설명 앞' },
    { value: 'after_desc', label: '설명 뒤' },
    { value: 'personality', label: '성격 슬롯' },
    { value: 'scenario', label: '시나리오 슬롯' },
    { value: 'depth', label: '깊이 지정 (앞에서부터)' },
    { value: 'reverse_depth', label: '깊이 지정 (끝에서부터)' },
] as const

export function positionSelectValue(entry: LoreEntry): string {
    const known = LORE_POSITION_OPTIONS.some((option) => option.value === entry.position)
    if (known) return entry.position
    return entry.position.startsWith('pt_') ? '__custom__' : ''
}

export function splitList(value: string): string[] {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

export function joinList(values: string[]): string {
    return values.join(', ')
}

export function loreEntrySummary(entry: LoreEntry): string {
    return entry.name || entry.keys[0] || '제목 없음'
}
