import { Info } from '@phosphor-icons/react'

import { Label } from '@/components/ui/label'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { BiasEditor } from '../shared/bias-editor'
import { splitLines } from '../shared/collections'
import { ParameterRow } from './parameter-row'
import { PresetNumberField } from './preset-number-field'
import type { PresetEditorSectionProps } from './types'

export function PresetParametersSection({
    value,
    onChange,
    updateParameter,
}: Pick<PresetEditorSectionProps, 'value' | 'onChange' | 'updateParameter'>) {
    return (
        <TabsContent
            value="parameters"
            id="preset-panel-parameters"
            className="my-6 min-w-0"
            aria-labelledby="preset-tab-parameters"
        >
            <div className="mb-6 flex gap-3 border border-border bg-card/60 p-4 text-xs leading-6 text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p>
                    켜진 파라미터만 provider 기본값을 덮어씁니다. 모델이 지원하지 않는 값은
                    저장되지만 요청에는 반영되지 않을 수 있습니다. 컨텍스트와 응답 크기는 프롬프트
                    구성에도 사용되므로 항상 적용됩니다.
                </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 border-y border-border max-sm:grid-cols-1 max-sm:divide-y max-sm:divide-border sm:divide-x sm:divide-border">
                <div className="py-4 sm:pr-6">
                    <PresetNumberField
                        label="최대 컨텍스트 크기"
                        value={value.parameters.maxContextTokens}
                        fallback={8192}
                        min={256}
                        onChange={(next) => updateParameter('maxContextTokens', next, true)}
                    />
                    <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                        입력 토큰의 최대 한도입니다. 모델 한도 이내로 설정하세요.
                    </p>
                </div>
                <div className="py-4 sm:pl-6">
                    <PresetNumberField
                        label="최대 응답 크기"
                        value={value.parameters.maxOutputTokens}
                        fallback={512}
                        min={1}
                        onChange={(next) => updateParameter('maxOutputTokens', next, true)}
                    />
                    <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                        한 번의 응답에서 생성할 최대 출력 토큰 수입니다.
                    </p>
                </div>
            </div>
            <div className="divide-y divide-border">
                <ParameterRow
                    label="온도"
                    description="낮을수록 일관되고, 높을수록 표현이 다양해집니다."
                    value={value.parameters.temperature}
                    defaultValue={0.9}
                    min={0}
                    max={2}
                    step={0.01}
                    onChange={(next) => updateParameter('temperature', next)}
                    onEnabledChange={(enabled) =>
                        updateParameter('temperature', enabled ? '0.9' : '', false, true)
                    }
                />
                <ParameterRow
                    label="Top K"
                    description="다음 토큰 후보를 확률 상위 K개로 제한합니다."
                    value={value.parameters.topK}
                    defaultValue={40}
                    min={0}
                    max={100}
                    step={1}
                    integer
                    onChange={(next) => updateParameter('topK', next, true)}
                    onEnabledChange={(enabled) =>
                        updateParameter('topK', enabled ? '40' : '', true, true)
                    }
                />
                <ParameterRow
                    label="Min P"
                    description="가장 높은 확률을 기준으로 너무 낮은 후보를 제거합니다."
                    value={value.parameters.minP}
                    defaultValue={0.05}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(next) => updateParameter('minP', next)}
                    onEnabledChange={(enabled) =>
                        updateParameter('minP', enabled ? '0.05' : '', false, true)
                    }
                />
                <ParameterRow
                    label="Top A"
                    description="최상위 토큰 확률에 따라 후보 임계값을 동적으로 조절합니다."
                    value={value.parameters.topA}
                    defaultValue={0.1}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(next) => updateParameter('topA', next)}
                    onEnabledChange={(enabled) =>
                        updateParameter('topA', enabled ? '0.1' : '', false, true)
                    }
                />
                <ParameterRow
                    label="Repetition penalty"
                    description="이미 나온 토큰의 재등장 확률을 낮춥니다. 1은 중립입니다."
                    value={value.parameters.repetitionPenalty}
                    defaultValue={1.1}
                    min={0}
                    max={2}
                    step={0.01}
                    onChange={(next) => updateParameter('repetitionPenalty', next)}
                    onEnabledChange={(enabled) =>
                        updateParameter('repetitionPenalty', enabled ? '1.1' : '', false, true)
                    }
                />
                <ParameterRow
                    label="Top P"
                    description="누적 확률이 지정값에 도달하는 후보 집합에서 샘플링합니다."
                    value={value.parameters.topP}
                    defaultValue={0.9}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(next) => updateParameter('topP', next)}
                    onEnabledChange={(enabled) =>
                        updateParameter('topP', enabled ? '0.9' : '', false, true)
                    }
                />
                <ParameterRow
                    label="빈도 패널티"
                    description="응답 안에서 여러 번 등장한 토큰을 빈도에 비례해 억제합니다."
                    value={value.parameters.frequencyPenalty}
                    defaultValue={0}
                    min={-2}
                    max={2}
                    step={0.01}
                    onChange={(next) => updateParameter('frequencyPenalty', next)}
                    onEnabledChange={(enabled) =>
                        updateParameter('frequencyPenalty', enabled ? '0' : '', false, true)
                    }
                />
                <ParameterRow
                    label="프리센스 패널티"
                    description="한 번이라도 등장한 토큰의 반복을 억제해 새 주제를 유도합니다."
                    value={value.parameters.presencePenalty}
                    defaultValue={0}
                    min={-2}
                    max={2}
                    step={0.01}
                    onChange={(next) => updateParameter('presencePenalty', next)}
                    onEnabledChange={(enabled) =>
                        updateParameter('presencePenalty', enabled ? '0' : '', false, true)
                    }
                />
            </div>
            <Label className="mt-6 grid gap-2 text-xs font-medium text-muted-foreground">
                Stop sequences · 한 줄에 하나
                <Textarea
                    className="max-h-56 overflow-y-auto font-mono text-xs"
                    rows={4}
                    value={(value.parameters.stopSequences || []).join('\n')}
                    onChange={(event) =>
                        onChange({
                            ...value,
                            parameters: {
                                ...value.parameters,
                                stopSequences: splitLines(event.target.value),
                            },
                        })
                    }
                />
            </Label>
            <div className="mt-6">
                <BiasEditor
                    value={value.bias || []}
                    min={-101}
                    transferable
                    onChange={(bias) => onChange({ ...value, bias })}
                />
            </div>
        </TabsContent>
    )
}
