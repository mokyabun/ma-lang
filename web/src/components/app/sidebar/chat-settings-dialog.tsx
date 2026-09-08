import type {
    Conversation,
    ConversationModuleState,
    GenerationParameters,
    ModelPreset,
    ModelChainPreset,
    Persona,
    PromptPreset,
} from '@malang/shared'
import { ArrowSquareOut, FlowArrow, Lock, LockOpen } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { activePromptToggles } from '@/lib/prompt-toggles'

import { ModuleActivationControl, PromptToggleControls } from './conversation-prompt-controls'

export function ChatSettingsDialog({
    open,
    conversation,
    modelPresets,
    modelChains,
    defaultModelPresetId,
    defaultAuxiliaryModelPresetId,
    activePromptPresetId,
    selectedPersonaId,
    personas,
    promptToggleValues,
    presets,
    moduleStates,
    onOpenChange,
    onGlobalPromptPresetChange,
    onGlobalPersonaChange,
    onConversationContextChange,
    onGlobalModuleToggle,
    onModuleToggle,
    onTogglesChange,
    onGenerationChange,
    onModelBindingChange,
    onChainBindingChange,
    onSaveModelDefaults,
    onOpenProviderSettings,
    onOpenChainSettings,
}: {
    open: boolean
    conversation: Conversation | null
    modelPresets: ModelPreset[]
    modelChains: ModelChainPreset[]
    defaultModelPresetId: string | null
    defaultAuxiliaryModelPresetId: string | null
    activePromptPresetId: string
    selectedPersonaId: string | null
    personas: Persona[]
    promptToggleValues: Record<string, string>
    presets: PromptPreset[]
    moduleStates: ConversationModuleState[]
    onOpenChange: (open: boolean) => void
    onGlobalPromptPresetChange: (presetId: string) => void | Promise<void>
    onGlobalPersonaChange: (personaId: string | null) => void | Promise<void>
    onConversationContextChange: (input: {
        promptPresetId?: string
        promptPresetLocked?: boolean
        boundPersonaId?: string | null
        personaLocked?: boolean
    }) => void | Promise<void>
    onGlobalModuleToggle: (moduleId: string, enabled: boolean) => void | Promise<void>
    onModuleToggle: (moduleId: string, enabled: boolean | null) => void | Promise<void>
    onTogglesChange: (toggles: Record<string, string>) => void | Promise<void>
    onGenerationChange: (parameters: GenerationParameters) => void | Promise<void>
    onModelBindingChange: (input: {
        modelPresetId?: string | null
        auxiliaryModelPresetId?: string | null
    }) => void | Promise<void>
    onChainBindingChange: (modelChainPresetId: string | null) => void | Promise<void>
    onSaveModelDefaults: (input: {
        defaultModelPresetId: string | null
        defaultAuxiliaryModelPresetId: string | null
    }) => void | Promise<void>
    onOpenProviderSettings: () => void
    onOpenChainSettings: () => void
}) {
    const effectivePromptPresetId = conversation?.promptPresetLocked
        ? conversation.promptPresetId
        : activePromptPresetId
    const effectivePersonaId = conversation?.personaLocked
        ? conversation.boundPersonaId
        : selectedPersonaId
    const selectedPreset = presets.find((preset) => preset.id === effectivePromptPresetId) ?? null
    const promptToggles = activePromptToggles(selectedPreset, moduleStates)
    const parameters = selectedPreset?.parameters ?? {}
    const effectiveModelId = conversation?.modelPresetId ?? defaultModelPresetId
    const effectiveAuxiliaryId =
        conversation?.auxiliaryModelPresetId ?? defaultAuxiliaryModelPresetId ?? effectiveModelId
    const effectiveModel = modelPresets.find((item) => item.id === effectiveModelId) ?? null
    const effectiveAuxiliary =
        modelPresets.find((item) => item.id === effectiveAuxiliaryId) ?? effectiveModel
    const modelLocked = Boolean(conversation?.modelPresetId || conversation?.auxiliaryModelPresetId)
    const separateAuxiliary = Boolean(
        effectiveModelId && effectiveAuxiliaryId && effectiveModelId !== effectiveAuxiliaryId,
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[min(46rem,calc(100dvh-2rem))] w-[min(46rem,calc(100%-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-card p-0 sm:max-w-none">
                <DialogHeader className="border-b border-border px-6 py-5 pr-14">
                    <DialogTitle className="font-serif text-xl">채팅 설정</DialogTitle>
                </DialogHeader>

                <Tabs
                    key={`${conversation?.id ?? 'none'}-${open ? 'open' : 'closed'}`}
                    defaultValue="chat"
                    className="min-h-0 gap-0 overflow-hidden"
                >
                    <TabsList
                        variant="line"
                        className="h-12 w-full shrink-0 justify-stretch gap-0 px-5"
                        aria-label="채팅 설정 메뉴"
                    >
                        <TabsTrigger value="chat">채팅</TabsTrigger>
                        <TabsTrigger value="model">모델</TabsTrigger>
                        <TabsTrigger value="module">모듈</TabsTrigger>
                    </TabsList>

                    <TabsContent value="chat" className="min-h-0 overflow-y-auto p-5">
                        <div className="mx-auto grid max-w-2xl gap-6">
                            <SettingsSection title="페르소나">
                                <LockedContextRow
                                    label="페르소나"
                                    locked={conversation?.personaLocked ?? false}
                                    disabled={!conversation}
                                    onLockChange={(locked) =>
                                        onConversationContextChange(
                                            locked
                                                ? {
                                                      boundPersonaId: effectivePersonaId,
                                                      personaLocked: true,
                                                  }
                                                : { personaLocked: false },
                                        )
                                    }
                                >
                                    <Select
                                        value={effectivePersonaId ?? '__legacy__'}
                                        onValueChange={(next) => {
                                            const personaId =
                                                next === '__legacy__' ? null : String(next)
                                            void (conversation?.personaLocked
                                                ? onConversationContextChange({
                                                      boundPersonaId: personaId,
                                                  })
                                                : onGlobalPersonaChange(personaId))
                                        }}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="페르소나 선택" />
                                        </SelectTrigger>
                                        <SelectContent align="start">
                                            <SelectItem value="__legacy__">
                                                기본 사용자 정보
                                            </SelectItem>
                                            {personas.map((persona) => (
                                                <SelectItem key={persona.id} value={persona.id}>
                                                    {persona.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </LockedContextRow>
                            </SettingsSection>

                            <SettingsSection title="프롬프트 프리셋">
                                <LockedContextRow
                                    label="프롬프트 프리셋"
                                    locked={conversation?.promptPresetLocked ?? false}
                                    disabled={!conversation || !effectivePromptPresetId}
                                    onLockChange={(locked) =>
                                        onConversationContextChange(
                                            locked
                                                ? {
                                                      promptPresetId: effectivePromptPresetId,
                                                      promptPresetLocked: true,
                                                  }
                                                : { promptPresetLocked: false },
                                        )
                                    }
                                >
                                    <Select
                                        value={effectivePromptPresetId}
                                        onValueChange={(next) =>
                                            void (conversation?.promptPresetLocked
                                                ? onConversationContextChange({
                                                      promptPresetId: String(next),
                                                  })
                                                : onGlobalPromptPresetChange(String(next)))
                                        }
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="프롬프트 프리셋 선택" />
                                        </SelectTrigger>
                                        <SelectContent align="start">
                                            {presets.map((preset) => (
                                                <SelectItem key={preset.id} value={preset.id}>
                                                    {preset.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </LockedContextRow>
                            </SettingsSection>

                            <SettingsSection title="프롬프트 토글">
                                {promptToggles.length ? (
                                    <PromptToggleControls
                                        key={`${selectedPreset?.id ?? 'none'}-${conversation?.id ?? 'none'}-${moduleStates.map((state) => `${state.module.id}:${state.enabled}`).join(',')}`}
                                        toggles={promptToggles}
                                        values={promptToggleValues}
                                        onChange={onTogglesChange}
                                    />
                                ) : (
                                    <EmptySetting>
                                        이 프리셋과 활성 모듈에는 프롬프트 토글이 없습니다.
                                    </EmptySetting>
                                )}
                            </SettingsSection>
                        </div>
                    </TabsContent>

                    <TabsContent value="model" className="min-h-0 overflow-y-auto p-5">
                        <div className="mx-auto grid max-w-2xl gap-6">
                            <SettingsSection title="모델">
                                <div className="grid gap-2 border-b border-border pb-3">
                                    <LockedContextRow
                                        label="모델"
                                        locked={modelLocked}
                                        disabled={!conversation || !effectiveModelId}
                                        onLockChange={(locked) =>
                                            onModelBindingChange(
                                                locked
                                                    ? {
                                                          modelPresetId: effectiveModelId,
                                                          auxiliaryModelPresetId:
                                                              effectiveAuxiliaryId ??
                                                              effectiveModelId,
                                                      }
                                                    : {
                                                          modelPresetId: null,
                                                          auxiliaryModelPresetId: null,
                                                      },
                                            )
                                        }
                                    >
                                        <select
                                            className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                            value={effectiveModelId ?? ''}
                                            aria-label={
                                                modelLocked ? '이 채팅의 모델' : 'Global 기본 모델'
                                            }
                                            onChange={(event) => {
                                                const nextModelId = event.target.value || null
                                                if (!nextModelId) return
                                                void (modelLocked
                                                    ? onModelBindingChange({
                                                          modelPresetId: nextModelId,
                                                          ...(!separateAuxiliary
                                                              ? {
                                                                    auxiliaryModelPresetId:
                                                                        nextModelId,
                                                                }
                                                              : {}),
                                                      })
                                                    : onSaveModelDefaults({
                                                          defaultModelPresetId: nextModelId,
                                                          defaultAuxiliaryModelPresetId:
                                                              separateAuxiliary
                                                                  ? (effectiveAuxiliary?.id ?? null)
                                                                  : null,
                                                      }))
                                            }}
                                        >
                                            <option value="" disabled>
                                                모델 프리셋 선택
                                            </option>
                                            {modelPresets.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} · {item.config.modelId}
                                                </option>
                                            ))}
                                        </select>
                                    </LockedContextRow>
                                    <div className="mt-1 grid gap-2 border-t border-border pt-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 gap-2">
                                                <FlowArrow
                                                    className="mt-0.5 shrink-0 text-primary"
                                                    aria-hidden="true"
                                                />
                                                <div>
                                                    <strong className="block text-xs">
                                                        응답 흐름
                                                    </strong>
                                                    <small className="text-[10px] leading-4 text-muted-foreground">
                                                        체인은 서버에서 연결된 노드의 흐름에 따라
                                                        실행합니다.
                                                    </small>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={onOpenChainSettings}
                                                aria-label="모델 체이닝 설정 열기"
                                            >
                                                <ArrowSquareOut aria-hidden="true" />
                                            </Button>
                                        </div>
                                        <Label className="grid gap-1.5 text-xs text-muted-foreground">
                                            <span>생성 방식</span>
                                            <select
                                                className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                                value={conversation?.modelChainPresetId ?? ''}
                                                onChange={(event) =>
                                                    void onChainBindingChange(
                                                        event.target.value || null,
                                                    )
                                                }
                                            >
                                                <option value="">단일 모델 · 기본</option>
                                                {modelChains.map((chain) => (
                                                    <option key={chain.id} value={chain.id}>
                                                        체인 · {chain.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </Label>
                                        {conversation?.modelChainPresetId ? (
                                            <p className="border-l border-primary pl-2 text-[10px] leading-4 text-muted-foreground">
                                                선택한 체인의 활성 단계를 서버에서 순서대로 실행한
                                                뒤 최종 응답만 저장합니다.
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
                                        <div>
                                            <strong className="block text-xs">
                                                보조 모델 분리
                                            </strong>
                                            <small className="text-[10px] text-muted-foreground">
                                                Lua axLLM의 ‘기타’ 호출에만 사용
                                            </small>
                                        </div>
                                        <Switch
                                            checked={separateAuxiliary}
                                            onCheckedChange={(checked) => {
                                                const nextAuxiliaryId = checked
                                                    ? (modelPresets.find(
                                                          (item) => item.id !== effectiveModel?.id,
                                                      )?.id ??
                                                      effectiveModel?.id ??
                                                      null)
                                                    : null
                                                void (modelLocked
                                                    ? onModelBindingChange({
                                                          auxiliaryModelPresetId: checked
                                                              ? nextAuxiliaryId
                                                              : (effectiveModel?.id ?? null),
                                                      })
                                                    : onSaveModelDefaults({
                                                          defaultModelPresetId:
                                                              effectiveModel?.id ?? null,
                                                          defaultAuxiliaryModelPresetId:
                                                              nextAuxiliaryId,
                                                      }))
                                            }}
                                            aria-label="보조 모델 분리"
                                        />
                                    </div>
                                    {separateAuxiliary ? (
                                        <Label className="grid gap-1.5 text-xs text-muted-foreground">
                                            <span>기타</span>
                                            <select
                                                className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                                                value={effectiveAuxiliary?.id ?? ''}
                                                onChange={(event) => {
                                                    const nextAuxiliaryId =
                                                        event.target.value || null
                                                    void (modelLocked
                                                        ? onModelBindingChange({
                                                              auxiliaryModelPresetId:
                                                                  nextAuxiliaryId,
                                                          })
                                                        : onSaveModelDefaults({
                                                              defaultModelPresetId:
                                                                  effectiveModel?.id ?? null,
                                                              defaultAuxiliaryModelPresetId:
                                                                  nextAuxiliaryId,
                                                          }))
                                                }}
                                            >
                                                {modelPresets.map((item) => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} · {item.config.modelId}
                                                    </option>
                                                ))}
                                            </select>
                                        </Label>
                                    ) : null}
                                    <div className="flex justify-end pt-1">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={onOpenProviderSettings}
                                            aria-label="모델 프리셋 설정 열기"
                                        >
                                            <ArrowSquareOut aria-hidden="true" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <QuickNumberField
                                        key={`${selectedPreset?.id ?? 'none'}-temperature-${parameters.temperature ?? 'default'}`}
                                        label="온도"
                                        value={parameters.temperature}
                                        fallback={0.9}
                                        min={0}
                                        max={2}
                                        step={0.05}
                                        onCommit={(temperature) =>
                                            onGenerationChange({ ...parameters, temperature })
                                        }
                                    />
                                    <QuickNumberField
                                        key={`${selectedPreset?.id ?? 'none'}-output-${parameters.maxOutputTokens ?? 'default'}`}
                                        label="최대 응답 토큰"
                                        value={parameters.maxOutputTokens}
                                        fallback={512}
                                        min={1}
                                        step={1}
                                        integer
                                        onCommit={(maxOutputTokens) =>
                                            onGenerationChange({ ...parameters, maxOutputTokens })
                                        }
                                    />
                                </div>
                                <p className="text-[10px] leading-5 text-muted-foreground">
                                    이 값은 현재 선택한 프롬프트 프리셋에 저장되어 같은 프리셋을
                                    쓰는 채팅에 함께 적용됩니다.
                                </p>
                            </SettingsSection>
                        </div>
                    </TabsContent>

                    <TabsContent value="module" className="min-h-0 overflow-y-auto p-5">
                        <div className="mx-auto max-w-2xl">
                            <SettingsSection title="모듈">
                                {moduleStates.length ? (
                                    <div className="grid gap-1.5">
                                        {moduleStates.map((state) => (
                                            <ModuleActivationControl
                                                key={`${conversation?.id ?? 'none'}-${state.module.id}`}
                                                state={state}
                                                onGlobalChange={onGlobalModuleToggle}
                                                onConversationChange={onModuleToggle}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <EmptySetting>사용할 수 있는 모듈이 없습니다.</EmptySetting>
                                )}
                            </SettingsSection>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="grid gap-3">
            <header className="border-b border-border pb-2">
                <h3 className="font-serif text-base">{title}</h3>
            </header>
            {children}
        </section>
    )
}

function LockedContextRow({
    label,
    locked,
    disabled,
    onLockChange,
    children,
}: {
    label: string
    locked: boolean
    disabled?: boolean
    onLockChange: (locked: boolean) => void | Promise<void>
    children: ReactNode
}) {
    const Icon = locked ? Lock : LockOpen
    return (
        <div className="grid gap-1.5">
            {locked ? (
                <div className="text-right text-[10px] text-muted-foreground">이 채팅에 고정됨</div>
            ) : null}
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
                <Button
                    type="button"
                    size="icon"
                    variant={locked ? 'secondary' : 'outline'}
                    className="size-10"
                    disabled={disabled}
                    aria-label={`${label} ${locked ? '잠금 해제' : '현재 값으로 잠금'}`}
                    aria-pressed={locked}
                    title={`${label} ${locked ? '잠금 해제' : '현재 값으로 잠금'}`}
                    onClick={() => void onLockChange(!locked)}
                >
                    <Icon aria-hidden="true" />
                </Button>
                {children}
            </div>
        </div>
    )
}

function QuickNumberField({
    label,
    value,
    fallback,
    min,
    max,
    step,
    integer = false,
    onCommit,
}: {
    label: string
    value: number | undefined
    fallback: number
    min: number
    max?: number
    step: number
    integer?: boolean
    onCommit: (value: number) => void | Promise<void>
}) {
    const [draft, setDraft] = useState(String(value ?? fallback))

    function commit() {
        const parsed = Number(draft)
        if (!Number.isFinite(parsed)) {
            setDraft(String(value ?? fallback))
            return
        }
        const normalized = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed))
        const next = integer ? Math.round(normalized) : normalized
        setDraft(String(next))
        void onCommit(next)
    }

    return (
        <Label className="grid gap-1.5 text-xs text-muted-foreground">
            <span>{label}</span>
            <Input
                type="number"
                value={draft}
                min={min}
                max={max}
                step={step}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                }}
            />
        </Label>
    )
}

function EmptySetting({ children }: { children: ReactNode }) {
    return (
        <p className="border-y border-dashed border-border py-5 text-center text-xs text-muted-foreground">
            {children}
        </p>
    )
}
