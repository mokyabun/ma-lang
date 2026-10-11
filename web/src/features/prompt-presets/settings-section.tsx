import { Plus, Trash } from '@phosphor-icons/react'

import { SettingsGroup } from '@/components/form/settings-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { nextVariableKey, splitList } from '@/lib/collections'

import { PresetCheck } from './preset-check'
import type { PresetEditorSectionProps } from './types'

export function PresetSettingsSection({
    value,
    promptSettings,
    onChange,
    updateVariables,
}: Pick<PresetEditorSectionProps, 'value' | 'promptSettings' | 'onChange' | 'updateVariables'>) {
    return (
        <TabsContent
            value="settings"
            id="preset-panel-settings"
            className="my-6 space-y-0"
            aria-labelledby="preset-tab-settings"
        >
            <SettingsGroup
                title="기본 변수"
                className="preset-setting-group"
                actions={
                    <Button
                        variant="ghost"
                        onClick={() =>
                            updateVariables([
                                ...Object.entries(value.defaultVariables),
                                [nextVariableKey(value.defaultVariables), ''],
                            ])
                        }
                    >
                        <Plus /> 변수 추가
                    </Button>
                }
            >
                <div className="border-t border-border">
                    {Object.entries(value.defaultVariables).map(([key, variable], index) => (
                        <div
                            className="grid grid-cols-[minmax(7rem,.7fr)_minmax(11rem,1.3fr)_2rem] gap-2 border-b border-border py-2 max-sm:grid-cols-[1fr_2rem]"
                            key={`${key}-${index}`}
                        >
                            <Input
                                value={key}
                                aria-label={`변수 ${index + 1} 이름`}
                                placeholder="variable_name"
                                onChange={(event) => {
                                    const entries = Object.entries(value.defaultVariables)
                                    entries[index] = [event.target.value, variable]
                                    updateVariables(entries)
                                }}
                            />
                            <Input
                                value={variable}
                                aria-label={`${key || `변수 ${index + 1}`} 기본값`}
                                placeholder="기본값"
                                onChange={(event) => {
                                    const entries = Object.entries(value.defaultVariables)
                                    entries[index] = [key, event.target.value]
                                    updateVariables(entries)
                                }}
                            />
                            <Button
                                variant="ghost"
                                aria-label={`${key || `변수 ${index + 1}`} 삭제`}
                                onClick={() => {
                                    const entries = Object.entries(value.defaultVariables)
                                    entries.splice(index, 1)
                                    updateVariables(entries)
                                }}
                            >
                                <Trash />
                            </Button>
                        </div>
                    ))}
                    {Object.keys(value.defaultVariables).length ? null : (
                        <p className="py-5 text-xs text-muted-foreground">
                            선언된 기본 변수가 없습니다.
                        </p>
                    )}
                </div>
            </SettingsGroup>
            <SettingsGroup title="Risu 동작" className="preset-setting-group">
                <div className="grid grid-cols-3 divide-x divide-border border-y border-border max-sm:grid-cols-1 max-sm:divide-x-0 max-sm:divide-y">
                    <PresetCheck
                        label="채팅을 system role로 전송"
                        checked={promptSettings.sendChatAsSystem}
                        onChange={(checked) =>
                            onChange({
                                ...value,
                                promptSettings: {
                                    ...promptSettings,
                                    sendChatAsSystem: checked,
                                },
                            })
                        }
                    />
                    <PresetCheck
                        label="메시지에 이름 포함"
                        checked={promptSettings.sendName}
                        onChange={(checked) =>
                            onChange({
                                ...value,
                                promptSettings: {
                                    ...promptSettings,
                                    sendName: checked,
                                },
                            })
                        }
                    />
                    <PresetCheck
                        label="새 대화 시작 공백 제거"
                        checked={promptSettings.trimStartNewChat}
                        onChange={(checked) =>
                            onChange({
                                ...value,
                                promptSettings: {
                                    ...promptSettings,
                                    trimStartNewChat: checked,
                                },
                            })
                        }
                    />
                </div>
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    <Label className="mt-4 grid gap-2">
                        Assistant prefill
                        <Textarea
                            className="max-h-56 overflow-y-auto font-mono text-xs"
                            rows={3}
                            value={promptSettings.assistantPrefill}
                            onChange={(event) =>
                                onChange({
                                    ...value,
                                    promptSettings: {
                                        ...promptSettings,
                                        assistantPrefill: event.target.value,
                                    },
                                })
                            }
                        />
                    </Label>
                    <Label className="mt-4 grid gap-2">
                        Post-end inner format
                        <Textarea
                            className="max-h-56 overflow-y-auto font-mono text-xs"
                            rows={3}
                            value={promptSettings.postEndInnerFormat}
                            onChange={(event) =>
                                onChange({
                                    ...value,
                                    promptSettings: {
                                        ...promptSettings,
                                        postEndInnerFormat: event.target.value,
                                    },
                                })
                            }
                        />
                    </Label>
                    <Label className="mt-4 grid gap-2">
                        Group template ({'{{char}}'}, {'{{slot}}'})
                        <Textarea
                            className="max-h-56 overflow-y-auto font-mono text-xs"
                            rows={3}
                            placeholder={`<{{char}}'s Message>\n{{slot}}\n</{{char}}'s Message>`}
                            value={promptSettings.groupTemplate}
                            onChange={(event) =>
                                onChange({
                                    ...value,
                                    promptSettings: {
                                        ...promptSettings,
                                        groupTemplate: event.target.value,
                                    },
                                })
                            }
                        />
                    </Label>
                </div>
            </SettingsGroup>
            <SettingsGroup
                title="모듈 연결"
                meta="ID 또는 namespace를 쉼표로 구분합니다."
                className="preset-setting-group"
            >
                <Label className="mt-4 grid gap-2">
                    활성 모듈
                    <Input
                        value={(value.moduleIntegrations || []).join(', ')}
                        onChange={(event) =>
                            onChange({
                                ...value,
                                moduleIntegrations: splitList(event.target.value),
                            })
                        }
                    />
                </Label>
            </SettingsGroup>
        </TabsContent>
    )
}
