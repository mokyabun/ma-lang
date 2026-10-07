import type { Character, CharacterUpdate, RegexScript } from '@malang/shared'

export function draftFrom(character: Character): CharacterUpdate {
    return {
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        firstMessage: character.firstMessage,
        alternateGreetings: character.alternateGreetings,
        exampleMessage: character.exampleMessage,
        systemPrompt: character.systemPrompt,
        postHistoryInstructions: character.postHistoryInstructions,
        creator: character.creator,
        characterVersion: character.characterVersion,
        tags: character.tags,
        lorebook: character.lorebook || [],
        loreSettings: character.loreSettings,
        regexScripts: character.regexScripts,
        moduleReferences: character.moduleReferences,
        defaultVariables: { ...character.defaultVariables },
        bias: structuredClone(character.bias),
        luaScript: character.luaScript
            ? {
                  code: character.luaScript.code,
                  enabled: character.luaScript.enabled,
                  lowLevelAccess: character.luaScript.lowLevelAccess,
              }
            : null,
    }
}

export function formatBytes(value: number) {
    if (value < 1_024) return `${value} B`
    if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KiB`
    return `${(value / 1_048_576).toFixed(1)} MiB`
}

export function blankCharacterRegex(): RegexScript {
    return {
        id: crypto.randomUUID(),
        comment: '새 정규식',
        pattern: '',
        replacement: '',
        phase: 'editdisplay',
        enabled: true,
        flags: 'g',
    }
}

export function replaceRegex(values: RegexScript[], index: number, value: RegexScript) {
    const next = [...values]
    next[index] = value
    return next
}
