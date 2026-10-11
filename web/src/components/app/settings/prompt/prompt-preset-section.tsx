import type { AppSettings, PromptPreset } from '@malang/shared'

import { useEditableCatalog } from '@/hooks/use-editable-catalog'
import { api, promptPresetExportUrl } from '@/lib/api'

import { EditableWorkbench } from '../shared/editable-workbench'
import { blankPreset, presetInput } from './model'
import { PresetEditor } from './preset-editor'
import { PresetRegexActions } from './preset-regex-actions'

export function PromptPresetSection({
    settings,
    presets,
    onSettingsChange,
    onChanged,
}: {
    settings: AppSettings | null
    presets: PromptPreset[]
    onSettingsChange: (settings: AppSettings) => void
    onChanged: (presets: PromptPreset[]) => void
}) {
    const catalog = useEditableCatalog({
        items: presets,
        initialId: settings?.defaultPromptPresetId,
        toDraft: presetInput,
        load: async () => (await api.promptPresets()).promptPresets,
        create: () => api.createPromptPreset(blankPreset()),
        update: api.updatePromptPreset,
        remove: api.deletePromptPreset,
        importFile: api.importPromptPreset,
        onChanged,
        onSelect: async (defaultPromptPresetId) =>
            onSettingsChange(await api.updateSettings({ defaultPromptPresetId })),
        createdMessage: '새 프리셋을 만들었습니다.',
        selectedMessage: '활성 프롬프트 프리셋을 변경했습니다.',
    })

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <EditableWorkbench
                title="프롬프트 프리셋"
                placeholder="프롬프트 프리셋 선택"
                importAccept=".json,.risup,.risupreset"
                items={catalog.items}
                selectedId={catalog.selectedId}
                saving={catalog.saving}
                message={catalog.message}
                exportUrl={
                    catalog.selectedId ? promptPresetExportUrl(catalog.selectedId, 'risup') : null
                }
                deleteTitle="프롬프트를 삭제할까요?"
                onSelect={catalog.select}
                onCreate={catalog.create}
                onImport={catalog.importFile}
                onDelete={catalog.remove}
                onFlush={catalog.autoSave.flush}
                extraActions={
                    <PresetRegexActions
                        presetId={catalog.selectedId}
                        onImport={(file) =>
                            catalog.run(async () => {
                                const saved = await api.importPromptRegex(catalog.selectedId, file)
                                catalog.replaceSaved(saved)
                                catalog.setMessage(`${file.name}의 정규식을 추가했습니다.`)
                            }, '정규식을 가져오지 못했습니다.')
                        }
                    />
                }
            >
                {catalog.draft ? (
                    <PresetEditor
                        key={catalog.selectedId}
                        value={catalog.draft}
                        onChange={catalog.setDraft}
                        onImmediateChange={(next) => {
                            catalog.setDraft(next)
                            void catalog.autoSave.saveNow(next)
                        }}
                    />
                ) : null}
            </EditableWorkbench>
        </div>
    )
}
