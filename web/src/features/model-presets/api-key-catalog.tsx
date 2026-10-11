import { Key, Plus } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'

import { CatalogGroup } from './catalog-group'

export function ApiKeyCatalog({
    items,
    onSelect,
    onAdd,
}: {
    items: Array<{ id: string; title: string; detail: string }>
    onSelect: (id: string) => void
    onAdd: () => void
}) {
    return (
        <CatalogGroup
            title="저장된 API 키"
            items={items}
            onSelect={onSelect}
            actions={
                <Button type="button" size="sm" className="max-sm:w-full" onClick={onAdd}>
                    <Plus aria-hidden="true" /> 새 API 키
                </Button>
            }
            empty={
                <button
                    type="button"
                    className="grid min-h-52 w-full place-items-center px-6 py-10 text-center transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={onAdd}
                >
                    <span>
                        <Key className="mx-auto mb-3 size-7 text-primary" aria-hidden="true" />
                        <strong className="block text-sm font-medium">
                            저장된 API 키가 없습니다.
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                            첫 인증 정보를 안전하게 저장해 보세요.
                        </span>
                    </span>
                </button>
            }
        />
    )
}
