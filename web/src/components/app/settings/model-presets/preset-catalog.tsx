import { Plus, UploadSimple } from '@phosphor-icons/react'
import { useRef } from 'react'

import { Button } from '@/components/ui/button'

import { CatalogGroup } from './catalog-group'

export function PresetCatalog({
    items,
    empty,
    onSelect,
    onAdd,
    importing,
    onImport,
}: {
    items: Array<{
        id: string
        title: string
        detail: string
        badge?: string
    }>
    empty: string
    onSelect: (id: string) => void
    onAdd: () => void
    importing: boolean
    onImport: (files: File[]) => Promise<void>
}) {
    const fileInput = useRef<HTMLInputElement>(null)
    return (
        <CatalogGroup
            title="저장된 모델 프리셋"
            items={items}
            onSelect={onSelect}
            actions={
                <div className="flex items-center gap-2 max-sm:w-full [&>button]:max-sm:flex-1">
                    <input
                        ref={fileInput}
                        className="sr-only"
                        type="file"
                        multiple
                        accept=".json,.profile.json,application/json"
                        onChange={(event) => {
                            const files = [...(event.target.files ?? [])]
                            event.target.value = ''
                            if (files.length) void onImport(files)
                        }}
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={importing}
                        onClick={() => fileInput.current?.click()}
                    >
                        <UploadSimple /> {importing ? '가져오는 중…' : '프로필 가져오기'}
                    </Button>
                    <Button type="button" size="sm" onClick={onAdd}>
                        <Plus /> 새 모델
                    </Button>
                </div>
            }
            empty={
                <div className="grid min-h-52 place-items-center px-6 py-10 text-center">
                    <div>
                        <p className="text-sm font-medium">{empty}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Provider와 모델 ID를 선택해 첫 프리셋을 만드세요.
                        </p>
                    </div>
                </div>
            }
        />
    )
}
