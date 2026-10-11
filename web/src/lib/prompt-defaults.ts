import type { LoreEntry, RegexScript } from '@malang/shared'

export function blankRegex(): RegexScript {
    return {
        id: crypto.randomUUID(),
        comment: '새 정규식',
        pattern: '',
        replacement: '',
        phase: 'editoutput',
        enabled: true,
        flags: 'g',
    }
}

export function blankLore(): LoreEntry {
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
        insertionOrder: 100,
        priority: 100,
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
