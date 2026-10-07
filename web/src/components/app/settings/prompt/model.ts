import type { PromptBlock, PromptPreset, PromptPresetInput } from '@malang/shared'

export function presetInput(value: PromptPreset): PromptPresetInput {
    return {
        name: value.name,
        blocks: structuredClone(value.blocks),
        parameters: { ...value.parameters },
        defaultVariables: { ...value.defaultVariables },
        toggles: structuredClone(value.toggles),
        regexScripts: structuredClone(value.regexScripts),
        moduleIntegrations: [...value.moduleIntegrations],
        bias: structuredClone(value.bias),
        promptSettings: { ...value.promptSettings },
    }
}

export function blankPreset(): PromptPresetInput {
    return {
        name: '새 프롬프트',
        parameters: { temperature: 0.9, maxContextTokens: 8192, maxOutputTokens: 512 },
        defaultVariables: {},
        toggles: [],
        regexScripts: [],
        moduleIntegrations: [],
        bias: [],
        promptSettings: {
            assistantPrefill: '',
            postEndInnerFormat: '',
            sendChatAsSystem: false,
            sendName: false,
            trimStartNewChat: false,
            groupTemplate: '',
        },
        blocks: [
            blankBlock('plain'),
            blankBlock('description'),
            blankBlock('persona'),
            blankBlock('lorebook'),
            blankBlock('chat'),
            blankBlock('authornote'),
        ],
    }
}

export function blankBlock(
    type: 'plain' | 'description' | 'persona' | 'lorebook' | 'chat' | 'authornote',
): PromptBlock {
    const id = crypto.randomUUID()
    if (type === 'plain')
        return {
            id,
            enabled: true,
            type,
            type2: 'main',
            role: 'system',
            text: 'Continue the conversation as {{char}}.',
        }
    if (type === 'chat') return { id, enabled: true, type, rangeStart: 0, rangeEnd: 'end' }
    if (type === 'authornote')
        return {
            id,
            enabled: true,
            type,
            innerFormat: '{{slot}}',
            defaultText: '',
            role2: 'system',
        }
    return { id, enabled: true, type, innerFormat: '{{slot}}', role2: 'system' }
}
