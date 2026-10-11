import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import type { ModuleEditorProps } from './types'

export function ModuleLuaSection({
    value,
    onChange,
}: Pick<ModuleEditorProps, 'value' | 'onChange'>) {
    return (
        <TabsContent value="lua">
            <div className="grid gap-6 my-6">
                <Label className="grid gap-2 text-xs text-muted-foreground">
                    Lua 코드
                    <Textarea
                        className="max-h-96 font-mono text-xs"
                        value={value.luaScript?.code ?? ''}
                        spellCheck={false}
                        onChange={(event) =>
                            onChange({
                                ...value,
                                luaScript: {
                                    code: event.target.value,
                                    enabled: value.luaScript?.enabled ?? true,
                                    lowLevelAccess: value.luaScript?.lowLevelAccess ?? false,
                                },
                            })
                        }
                    />
                </Label>
                <Label className="grid gap-2 text-xs text-muted-foreground">
                    실행 순서
                    <Input
                        type="number"
                        value={value.runtimeOrder ?? 0}
                        onChange={(event) =>
                            onChange({
                                ...value,
                                runtimeOrder: Number.parseInt(event.target.value || '0', 10),
                            })
                        }
                    />
                </Label>
                <Label className="flex items-center gap-2 text-xs text-foreground">
                    <Checkbox
                        checked={value.luaScript?.enabled ?? false}
                        onCheckedChange={(enabled) =>
                            onChange({
                                ...value,
                                luaScript: {
                                    code: value.luaScript?.code ?? '',
                                    enabled,
                                    lowLevelAccess: value.luaScript?.lowLevelAccess ?? false,
                                },
                            })
                        }
                    />
                    서버에서 실행
                </Label>
                <Label className="flex items-center gap-2 text-xs text-foreground">
                    <Checkbox
                        checked={value.luaScript?.lowLevelAccess ?? false}
                        onCheckedChange={(lowLevelAccess) =>
                            onChange({
                                ...value,
                                luaScript: {
                                    code: value.luaScript?.code ?? '',
                                    enabled: value.luaScript?.enabled ?? false,
                                    lowLevelAccess,
                                },
                            })
                        }
                    />
                    Low-Level API 허용
                </Label>
            </div>
        </TabsContent>
    )
}
