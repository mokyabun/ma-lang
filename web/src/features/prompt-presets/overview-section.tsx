import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TabsContent } from '@/components/ui/tabs'

import type { PresetEditorSectionProps } from './types'

export function PresetOverviewSection({
    value,
    onChange,
}: Pick<PresetEditorSectionProps, 'value' | 'onChange'>) {
    return (
        <TabsContent
            value="overview"
            id="preset-panel-overview"
            aria-labelledby="preset-tab-overview"
        >
            <div className="my-6 grid gap-6">
                <Label className="grid gap-2">
                    이름
                    <Input
                        aria-label="프리셋 이름"
                        value={value.name}
                        onChange={(event) => onChange({ ...value, name: event.target.value })}
                    />
                </Label>
                <p className="text-[10px] leading-5 text-muted-foreground">
                    프롬프트 {value.blocks.length}개 · 커스텀 토글 {(value.toggles || []).length}개
                    · 정규식 {(value.regexScripts || []).length}개
                </p>
            </div>
        </TabsContent>
    )
}
