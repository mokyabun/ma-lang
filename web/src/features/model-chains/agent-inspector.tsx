import type { ModelChainAgent, ModelPreset } from '@malang/shared'
import { ArrowLeft, Eye, Trash } from '@phosphor-icons/react'
import type { Ref } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { OptionSwitch } from './option-switch'
import { PromptPreview } from './prompt-preview'

export function AgentInspector({
    selection,
    modelPresets,
    showPreview,
    onPreview,
    onChange,
    onDelete,
    panelRef,
    onShowCanvas,
}: {
    selection: { agent: ModelChainAgent; orphan: boolean; receivesResponse: boolean } | null
    modelPresets: ModelPreset[]
    showPreview: boolean
    onPreview: () => void
    onChange: (agent: ModelChainAgent) => void
    onDelete: () => void
    panelRef?: Ref<HTMLElement>
    onShowCanvas?: () => void
}) {
    if (!selection)
        return <aside className="p-6 text-sm text-muted-foreground">에이전트를 선택하세요.</aside>
    const { agent, orphan, receivesResponse } = selection
    return (
        <aside
            ref={panelRef}
            aria-label="에이전트 상세 설정"
            className="min-w-0 bg-muted/15 p-5 sm:p-6 lg:overflow-y-auto"
        >
            <Button variant="ghost" size="sm" className="mb-3 lg:hidden" onClick={onShowCanvas}>
                <ArrowLeft /> 노드 편집기로
            </Button>
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                    <h3 className="break-all font-serif text-lg font-semibold">{agent.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {orphan
                            ? '고아 노드 · 저장됨 / 실행 제외'
                            : '모델 노드 · 연결 흐름에 따라 실행'}
                    </p>
                </div>
                <Label className="flex items-center gap-2 text-xs">
                    활성화
                    <Switch
                        checked={agent.enabled}
                        onCheckedChange={(enabled) => onChange({ ...agent, enabled })}
                    />
                </Label>
            </div>

            <div className="grid gap-5">
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>이름</span>
                    <Input
                        value={agent.name}
                        maxLength={100}
                        onChange={(event) => onChange({ ...agent, name: event.target.value })}
                    />
                </Label>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <Label className="grid gap-1.5 text-xs text-muted-foreground">
                        <span>Model Preset</span>
                        <select
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                            value={agent.modelPresetId}
                            onChange={(event) =>
                                onChange({ ...agent, modelPresetId: event.target.value })
                            }
                        >
                            {!modelPresets.some((preset) => preset.id === agent.modelPresetId) ? (
                                <option value={agent.modelPresetId} disabled>
                                    모델 프리셋을 선택하세요
                                </option>
                            ) : null}
                            {modelPresets.map((preset) => (
                                <option key={preset.id} value={preset.id}>
                                    {preset.name}
                                </option>
                            ))}
                        </select>
                    </Label>
                </div>
                {receivesResponse || orphan ? (
                    <Label className="grid max-w-xs gap-1.5 text-xs text-muted-foreground">
                        <span>응답 반영 방식</span>
                        <select
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                            value={agent.postMode}
                            onChange={(event) =>
                                onChange({
                                    ...agent,
                                    postMode: event.target.value as ModelChainAgent['postMode'],
                                })
                            }
                        >
                            <option value="replace">전체 교체</option>
                            <option value="prepend">앞에 추가</option>
                            <option value="append">뒤에 추가</option>
                        </select>
                    </Label>
                ) : null}
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>System Prompt</span>
                    <p className="text-[10px] leading-4">
                        역할, 세계관 규칙과 출력 기준을 작성합니다.
                    </p>
                    <Textarea
                        className="min-h-36 resize-y font-mono text-xs leading-5"
                        value={agent.systemPrompt}
                        onChange={(event) =>
                            onChange({ ...agent, systemPrompt: event.target.value })
                        }
                    />
                </Label>
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>Output Instruction</span>
                    <p className="text-[10px] leading-4">
                        이 노드에서 수행할 작업과 출력 형식을 작성합니다.
                    </p>
                    <Textarea
                        className="min-h-32 resize-y font-mono text-xs leading-5"
                        value={agent.instruction}
                        onChange={(event) =>
                            onChange({ ...agent, instruction: event.target.value })
                        }
                    />
                </Label>

                <div className="grid gap-2 border-y border-border py-4">
                    <OptionSwitch
                        label="Assistant prefill 활성화"
                        detail="Output Instruction을 assistant 메시지로 보내 이어 쓰게 합니다."
                        checked={agent.assistantPrefill}
                        onCheckedChange={(assistantPrefill) =>
                            onChange({ ...agent, assistantPrefill })
                        }
                    />
                    <OptionSwitch
                        label="설정 정보 포함"
                        detail="캐릭터, 페르소나, 작가 노트와 활성 로어북"
                        checked={agent.includeSettingInfo}
                        onCheckedChange={(includeSettingInfo) =>
                            onChange({ ...agent, includeSettingInfo })
                        }
                    />
                    <OptionSwitch
                        label="글로벌 노트 포함"
                        checked={agent.includeGlobalNote}
                        onCheckedChange={(includeGlobalNote) =>
                            onChange({ ...agent, includeGlobalNote })
                        }
                    />
                    <OptionSwitch
                        label="Hypa 장기기억 포함"
                        checked={agent.includeLongTermMemory}
                        onCheckedChange={(includeLongTermMemory) =>
                            onChange({ ...agent, includeLongTermMemory })
                        }
                    />
                    <OptionSwitch
                        label="최근 대화 포함"
                        checked={agent.includeRecentChat}
                        onCheckedChange={(includeRecentChat) =>
                            onChange({ ...agent, includeRecentChat })
                        }
                    />
                    <OptionSwitch
                        label="현재 유저 입력 포함"
                        checked={agent.includeCurrentUserInput}
                        onCheckedChange={(includeCurrentUserInput) =>
                            onChange({ ...agent, includeCurrentUserInput })
                        }
                    />
                    <OptionSwitch
                        label="이전 연결 노드의 결과 포함"
                        checked={agent.includePreviousNotes}
                        onCheckedChange={(includePreviousNotes) =>
                            onChange({ ...agent, includePreviousNotes })
                        }
                    />
                    <OptionSwitch
                        label="에이전트 기억 활성화"
                        detail="대화별 최신 기억을 서버에 저장합니다."
                        checked={agent.memoryEnabled}
                        onCheckedChange={(memoryEnabled) => onChange({ ...agent, memoryEnabled })}
                    />
                </div>

                {agent.memoryEnabled ? (
                    <div className="grid gap-4 border border-primary/25 bg-primary/5 p-4">
                        <Label className="grid gap-1.5 text-xs text-muted-foreground">
                            <span>기억 갱신 지시</span>
                            <Textarea
                                className="min-h-24 resize-y text-xs"
                                value={agent.memoryInstruction}
                                onChange={(event) =>
                                    onChange({ ...agent, memoryInstruction: event.target.value })
                                }
                            />
                        </Label>
                        <Label className="grid gap-1.5 text-xs text-muted-foreground">
                            <span>기억 포맷</span>
                            <Textarea
                                className="min-h-24 resize-y font-mono text-xs"
                                value={agent.memoryFormat}
                                onChange={(event) =>
                                    onChange({ ...agent, memoryFormat: event.target.value })
                                }
                            />
                        </Label>
                    </div>
                ) : null}

                {showPreview ? (
                    <PromptPreview agent={agent} receivesResponse={receivesResponse} />
                ) : null}
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={onPreview}>
                        <Eye />
                        {showPreview ? '프롬프트 닫기' : '프롬프트 확인'}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={onDelete}>
                        <Trash />
                        에이전트 삭제
                    </Button>
                </div>
            </div>
        </aside>
    )
}
