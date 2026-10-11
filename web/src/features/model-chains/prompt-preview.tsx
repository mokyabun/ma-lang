import type { ModelChainAgent } from '@malang/shared'

export function PromptPreview({
    agent,
    receivesResponse,
}: {
    agent: ModelChainAgent
    receivesResponse: boolean
}) {
    const included = [
        agent.includeSettingInfo && '설정 정보',
        agent.includeGlobalNote && '글로벌 노트',
        agent.includeLongTermMemory && 'Hypa 장기기억',
        agent.includeRecentChat && '최근 대화',
        agent.includeCurrentUserInput && '현재 유저 입력',
        agent.includePreviousNotes && '이전 연결 노드의 결과',
        receivesResponse && '현재 응답',
        agent.memoryEnabled && '에이전트 기억',
    ].filter(Boolean)
    return (
        <div className="border border-border bg-background p-4">
            <p className="mb-2 text-[10px] font-medium text-primary">프롬프트 구성</p>
            <pre className="whitespace-pre-wrap text-[10px] leading-5 text-muted-foreground">{`시스템\n${agent.systemPrompt || '(기본 모델 노드 역할)'}\n\n사용자 컨텍스트\n${included.map((item) => `[${item}]`).join('\n') || '(컨텍스트 없음)'}\n\n${agent.assistantPrefill ? '어시스턴트 프리필' : '사용자 지시'}\n${agent.instruction || '(지시 없음)'}`}</pre>
        </div>
    )
}
