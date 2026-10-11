import { SegmentedChoice } from '@/components/form/segmented-choice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ModelIdPicker({
    mode,
    modelId,
    models,
    discovering,
    onModeChange,
    onChange,
    onDiscover,
}: {
    mode: 'select' | 'custom'
    modelId: string
    models: Array<{ id: string; name: string }>
    discovering: boolean
    onModeChange: (mode: 'select' | 'custom') => void
    onChange: (id: string) => void
    onDiscover: () => void
}) {
    return (
        <fieldset className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
                <legend className="text-xs font-medium text-muted-foreground">Model ID</legend>
                <SegmentedChoice
                    value={mode}
                    options={[
                        { value: 'select', label: '모델 선택' },
                        { value: 'custom', label: '직접 입력' },
                    ]}
                    onChange={(next) => {
                        onModeChange(next as 'select' | 'custom')
                        if (next === 'select' && !models.some((item) => item.id === modelId)) {
                            onChange(models[0]?.id ?? '')
                        }
                    }}
                />
            </div>
            {mode === 'select' ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                        className="h-11 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                        value={modelId}
                        onChange={(event) => onChange(event.target.value)}
                    >
                        {models.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.name === model.id ? model.id : `${model.name} · ${model.id}`}
                            </option>
                        ))}
                    </select>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={discovering}
                        onClick={onDiscover}
                    >
                        {discovering ? '불러오는 중…' : 'Provider 목록 불러오기'}
                    </Button>
                </div>
            ) : (
                <Input
                    value={modelId}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="Provider의 정확한 Model ID"
                />
            )}
            <p className="text-[10px] leading-5 text-muted-foreground">
                내장 힌트에서 고르거나, 저장된 인증 정보로 Provider의 현재 모델 목록을 불러올 수
                있습니다.
            </p>
        </fieldset>
    )
}
