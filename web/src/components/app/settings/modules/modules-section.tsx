import type { PromptModule } from '@malang/shared'
import { useSetAtom } from 'jotai'

import { api, promptModuleExportUrl } from '@/lib/api'

import { loadingAtom } from '../../dialogs/atom'
import { withImportProgress } from '../../dialogs/import-progress'
import { EditableWorkbench } from '../shared/editable-workbench'
import { useEditableCatalog } from '../shared/use-editable-catalog'
import { blankModule, moduleInput } from './model'
import { ModuleEditor } from './module-editor'

export function ModulesSection({
    modules,
    onChanged,
}: {
    modules: PromptModule[]
    onChanged: (modules: PromptModule[]) => void
}) {
    const setLoading = useSetAtom(loadingAtom)
    const catalog = useEditableCatalog({
        items: modules,
        toDraft: moduleInput,
        load: async () => (await api.promptModules()).modules,
        create: () => api.createPromptModule(blankModule()),
        update: api.updatePromptModule,
        remove: api.deletePromptModule,
        importFile: (file) =>
            withImportProgress(setLoading, file, (onProgress) =>
                api.importPromptModule(file, onProgress),
            ),
        onChanged,
        createdMessage: '새 모듈을 만들었습니다.',
    })

    return (
        <EditableWorkbench
            title="모듈"
            placeholder="편집할 항목 선택"
            importAccept=".json,.risum,.charx"
            items={catalog.items}
            selectedId={catalog.selectedId}
            saving={catalog.saving}
            message={catalog.message}
            warnings={catalog.selected?.warnings}
            exportUrl={
                catalog.selectedId ? promptModuleExportUrl(catalog.selectedId, 'charx') : null
            }
            deleteTitle="모듈을 삭제할까요?"
            onSelect={catalog.select}
            onCreate={catalog.create}
            onImport={catalog.importFile}
            onDelete={catalog.remove}
            onFlush={catalog.autoSave.flush}
        >
            {catalog.draft ? (
                <ModuleEditor
                    key={catalog.selectedId}
                    value={catalog.draft}
                    assets={catalog.selected?.assets ?? []}
                    onChange={catalog.setDraft}
                />
            ) : null}
        </EditableWorkbench>
    )
}
