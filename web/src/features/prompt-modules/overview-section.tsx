import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import type { ModuleEditorProps } from './types'

export function ModuleOverviewSection({
    value,
    onChange,
}: Pick<ModuleEditorProps, 'value' | 'onChange'>) {
    return (
        <TabsContent value="overview">
            <div className="grid gap-6 my-6">
                <Label className="grid gap-2">
                    이름
                    <Input
                        value={value.name}
                        onChange={(event) => onChange({ ...value, name: event.target.value })}
                    />
                </Label>
                <Label className="flex items-center gap-2 text-xs normal-case tracking-normal text-foreground">
                    <Checkbox
                        checked={value.enabledByDefault}
                        onCheckedChange={(checked) =>
                            onChange({
                                ...value,
                                enabledByDefault: checked,
                            })
                        }
                    />
                    <span>새 대화에서 기본 활성</span>
                </Label>
                <Label className="grid gap-2">
                    설명
                    <Input
                        value={value.description}
                        onChange={(event) =>
                            onChange({ ...value, description: event.target.value })
                        }
                    />
                </Label>
                <Label className="grid gap-2">
                    Namespace
                    <Input
                        value={value.namespace}
                        onChange={(event) => onChange({ ...value, namespace: event.target.value })}
                        placeholder="author.module"
                    />
                </Label>
                <Label className="grid gap-2">
                    백그라운드 임베딩 (CSS)
                    <Textarea
                        className="max-h-56 font-mono text-xs"
                        value={value.backgroundEmbedding || ''}
                        onChange={(event) =>
                            onChange({ ...value, backgroundEmbedding: event.target.value })
                        }
                        placeholder={'<style>\n.risu-chat { /* 채팅 스타일 */ }\n</style>'}
                    />
                </Label>
            </div>
        </TabsContent>
    )
}
