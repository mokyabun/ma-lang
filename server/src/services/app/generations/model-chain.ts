import type { CompiledMessage, ModelChainAgent } from '@malang/shared'

import { selectLoreEntries } from '@/services/prompt/lorebook'
import type { ChatTokenizer } from '@/services/tokenizer'

import type { GenerationContext } from './context'

export interface ChainNote {
    agentId: string
    agentName: string
    layerId: string
    layerName: string
    content: string
}

export interface ChainExecutionContext {
    settingInfo: string
    globalNote: string
    longTermMemory: string
    recentChat: string
    currentUserInput: string
}

export function chainAgentMessages(
    agent: ModelChainAgent,
    context: ChainExecutionContext,
    notes: ChainNote[],
    memory: string,
    response?: string,
): CompiledMessage[] {
    const outputInstruction =
        response === undefined
            ? '지시된 작업의 결과를 출력하세요. 결과는 연결된 다음 노드에 전달됩니다.'
            : agent.postMode === 'prepend'
              ? '현재 응답 앞에 붙일 텍스트만 출력하고 현재 응답은 반복하지 마세요.'
              : agent.postMode === 'append'
                ? '현재 응답 뒤에 붙일 텍스트만 출력하고 현재 응답은 반복하지 마세요.'
                : '사용자에게 보일 최종 응답 전체만 출력하세요. 분석이나 변경 설명은 쓰지 마세요.'
    const systemPrompt = [
        agent.systemPrompt || '당신은 연결된 모델 흐름에서 지시된 작업을 수행하는 에이전트입니다.',
        outputInstruction,
        agent.memoryEnabled
            ? [
                  '응답을 반드시 아래 두 태그로 나누세요.',
                  '[AGENT_NOTE]다음 노드에 전달할 이번 작업 결과[/AGENT_NOTE]',
                  '[MEMORY_UPDATE]다음 턴에 유지할 최신 기억 전체[/MEMORY_UPDATE]',
              ].join('\n')
            : '',
    ]
        .filter(Boolean)
        .join('\n\n')
    const sections = contextSections(agent, context, notes)
    if (response !== undefined) sections.push(`[현재 응답]\n${response}`)
    if (agent.memoryEnabled) {
        sections.push(`[에이전트 기억]\n${memory || '(저장된 기억 없음)'}`)
        if (agent.memoryInstruction) {
            sections.push(`[기억 갱신 지시]\n${agent.memoryInstruction}`)
        }
        if (agent.memoryFormat) sections.push(`[기억 포맷]\n${agent.memoryFormat}`)
    }
    return appendAgentInstruction(
        [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: sections.join('\n\n') || '현재 요청에 대해 지시된 작업을 수행하세요.',
            },
        ],
        agent,
    )
}

function appendAgentInstruction(
    messages: CompiledMessage[],
    agent: ModelChainAgent,
): CompiledMessage[] {
    if (!agent.instruction.trim()) return messages
    return [
        ...messages,
        {
            role: agent.assistantPrefill ? 'assistant' : 'user',
            content: agent.instruction,
        },
    ]
}

function contextSections(
    agent: ModelChainAgent,
    context: ChainExecutionContext,
    notes: ChainNote[],
): string[] {
    return [
        agent.includeSettingInfo && context.settingInfo
            ? `[설정 정보]\n${context.settingInfo}`
            : '',
        agent.includeGlobalNote && context.globalNote ? `[글로벌 노트]\n${context.globalNote}` : '',
        agent.includeLongTermMemory && context.longTermMemory
            ? `[Hypa 장기기억]\n${context.longTermMemory}`
            : '',
        agent.includeRecentChat && context.recentChat ? `[최근 대화]\n${context.recentChat}` : '',
        agent.includeCurrentUserInput && context.currentUserInput
            ? `[현재 유저 입력]\n${context.currentUserInput}`
            : '',
        agent.includePreviousNotes && notes.length
            ? `[이전 연결 노드의 결과]\n${formatChainNotes(notes)}`
            : '',
    ].filter(Boolean)
}

export function buildChainExecutionContext(
    context: GenerationContext,
    messages: GenerationContext['messages'],
    longTermMemory: string,
    tokenizer: ChatTokenizer,
): ChainExecutionContext {
    const lore = selectLoreEntries(
        [
            ...(context.character.lorebook || []),
            ...context.modules.flatMap((module) => module.lorebook),
        ],
        messages,
        context.character.loreSettings,
        (text) => tokenizer.count(text),
    ).entries
    const currentUserIndex = messages.findLastIndex((message) => message.role === 'user')
    const recentMessages = messages
        .filter((_message, index) => index !== currentUserIndex)
        .slice(-10)
    return {
        settingInfo: [
            context.character.description ? `[캐릭터 설명]\n${context.character.description}` : '',
            context.character.personality ? `[캐릭터 성격]\n${context.character.personality}` : '',
            context.character.scenario ? `[시나리오]\n${context.character.scenario}` : '',
            context.persona.description
                ? `[페르소나: ${context.persona.name}]\n${context.persona.description}`
                : '',
            context.conversation.authorNote
                ? `[작가 노트]\n${context.conversation.authorNote}`
                : '',
            lore.length ? `[활성 로어북]\n${lore.map((entry) => entry.content).join('\n\n')}` : '',
        ]
            .filter(Boolean)
            .join('\n\n'),
        globalNote: context.character.postHistoryInstructions,
        longTermMemory,
        recentChat: serializeCompiledMessages(recentMessages),
        currentUserInput: currentUserIndex >= 0 ? messages[currentUserIndex]!.content : '',
    }
}

export function parseAgentMemoryOutput(
    output: string,
    memoryEnabled: boolean,
): { note: string; memoryUpdate: string } {
    const text = output.trim()
    if (!memoryEnabled) return { note: text, memoryUpdate: '' }
    const note = taggedBlock(text, 'AGENT_NOTE')
    const memoryUpdate = taggedBlock(text, 'MEMORY_UPDATE')
    return { note: note || text, memoryUpdate }
}

function taggedBlock(text: string, tag: string): string {
    const match = text.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'i'))
    return match?.[1]?.trim() ?? ''
}

export function injectChainNotes(
    messages: CompiledMessage[],
    notes: ChainNote[],
): CompiledMessage[] {
    if (!notes.length) return messages
    return [
        ...messages,
        {
            role: 'system',
            content: [
                '[이전 연결 노드의 결과]',
                formatChainNotes(notes),
                '위 메모를 참고하되 사용자에게 분석 과정은 노출하지 말고 최종 답변만 작성하세요.',
            ].join('\n\n'),
        },
    ]
}

function formatChainNotes(notes: ChainNote[]): string {
    return notes
        .map((note) => `[${note.layerName} · ${note.agentName}]\n${note.content}`)
        .join('\n\n')
}

function serializeCompiledMessages(messages: CompiledMessage[]): string {
    return messages
        .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
        .join('\n\n')
}

export function applyPostMode(
    mode: ModelChainAgent['postMode'],
    current: string,
    output: string,
): string {
    const next = output.trim()
    if (!next) return current
    if (mode === 'prepend') return [next, current.trim()].filter(Boolean).join('\n\n')
    if (mode === 'append') return [current.trim(), next].filter(Boolean).join('\n\n')
    return next
}
