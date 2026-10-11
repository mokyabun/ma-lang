import type { ModulePrompt, PromptModule, PromptModuleInput } from '@malang/shared'

export function moduleInput(value: PromptModule): PromptModuleInput {
    return {
        name: value.name,
        description: value.description,
        namespace: value.namespace,
        sourceId: value.sourceId,
        enabledByDefault: value.enabledByDefault,
        prompts: structuredClone(value.prompts),
        toggles: structuredClone(value.toggles),
        regexScripts: structuredClone(value.regexScripts),
        backgroundEmbedding: value.backgroundEmbedding,
        lorebook: structuredClone(value.lorebook),
        runtimeOrder: value.runtimeOrder,
        luaScript: value.luaScript
            ? {
                  code: value.luaScript.code,
                  enabled: value.luaScript.enabled,
                  lowLevelAccess: value.luaScript.lowLevelAccess,
              }
            : null,
        luaRawTriggers: structuredClone(value.luaRawTriggers),
    }
}

export function blankModule(): PromptModuleInput {
    return {
        name: '새 모듈',
        description: '',
        namespace: '',
        sourceId: '',
        enabledByDefault: false,
        prompts: [blankModulePrompt()],
        toggles: [],
        regexScripts: [],
        backgroundEmbedding: '',
        lorebook: [],
        runtimeOrder: 0,
        luaScript: null,
        luaRawTriggers: [],
    }
}

export function blankModulePrompt(): ModulePrompt {
    return {
        id: crypto.randomUUID(),
        name: 'Prompt injection',
        enabled: true,
        toggleKey: null,
        role: 'system',
        position: 'afterMain',
        content: '',
    }
}
