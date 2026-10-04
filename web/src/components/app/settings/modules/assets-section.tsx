import type { ModuleAsset } from '@malang/shared'
import { ImageSquare } from '@phosphor-icons/react'
import { useSyncExternalStore } from 'react'

import { TabsContent } from '@/components/ui/tabs'
import { assetUrl } from '@/lib/api'
import { useScrollParentVirtualizer } from '@/lib/use-scroll-parent-virtualizer'

import { formatAssetBytes } from './format'
import type { ModuleEditorProps } from './types'

const NARROW_QUERY = '(width < 40rem)'

export function ModuleAssetsSection({ assets }: Pick<ModuleEditorProps, 'assets'>) {
    return (
        <TabsContent value="assets">
            {assets.length ? (
                <ModuleAssetGrid assets={assets} />
            ) : (
                <div className="grid min-h-52 place-content-center justify-items-center gap-2 border-y border-border text-center text-muted-foreground">
                    <ImageSquare className="size-7" />
                    <p className="text-xs">이 모듈에 포함된 에셋이 없습니다.</p>
                    <small className="max-w-sm text-center text-[10px] leading-5">
                        에셋이 든 .risum 또는 .charx 파일을 다시 가져오면 이곳에 표시됩니다.
                    </small>
                </div>
            )}
        </TabsContent>
    )
}

function ModuleAssetGrid({ assets }: { assets: ModuleAsset[] }) {
    const columns = useSyncExternalStore(subscribeNarrow, () =>
        window.matchMedia(NARROW_QUERY).matches ? 1 : 2,
    )
    const rowCount = Math.ceil(assets.length / columns)
    const { listRef, virtualizer } = useScrollParentVirtualizer<HTMLDivElement>({
        count: rowCount,
        estimateSize: () => 236,
        getItemKey: (index) => `${columns}:${index}`,
    })
    const scrollMargin = virtualizer.options.scrollMargin

    return (
        <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => (
                <div
                    key={row.key}
                    ref={virtualizer.measureElement}
                    data-index={row.index}
                    className="absolute left-0 top-0 grid w-full grid-cols-2 gap-3 pb-3 max-sm:grid-cols-1"
                    style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
                >
                    {assets
                        .slice(row.index * columns, row.index * columns + columns)
                        .map((asset) => (
                            <ModuleAssetCard
                                key={`${asset.assetId}-${asset.sourceUri}`}
                                asset={asset}
                            />
                        ))}
                </div>
            ))}
        </div>
    )
}

function ModuleAssetCard({ asset }: { asset: ModuleAsset }) {
    return (
        <a
            className="group grid h-56 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border border-border bg-card transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            href={assetUrl(asset.assetId)}
            target="_blank"
            rel="noreferrer"
        >
            <span className="grid min-h-0 place-items-center overflow-hidden bg-background/70">
                {asset.mimeType.startsWith('image/') ? (
                    <img
                        className="size-full object-contain"
                        src={assetUrl(asset.assetId)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                    />
                ) : asset.mimeType.startsWith('video/') ? (
                    <video
                        className="size-full object-contain"
                        src={assetUrl(asset.assetId)}
                        muted
                        preload="metadata"
                    />
                ) : (
                    <ImageSquare className="size-8 text-muted-foreground" />
                )}
            </span>
            <span className="grid gap-1 border-t border-border p-3">
                <strong className="truncate text-xs font-medium text-foreground">
                    {asset.name || '이름 없는 에셋'}
                </strong>
                <small className="font-mono text-[9px] text-muted-foreground">
                    {asset.mimeType} · {formatAssetBytes(asset.size)}
                </small>
            </span>
        </a>
    )
}

function subscribeNarrow(onChange: () => void) {
    const query = window.matchMedia(NARROW_QUERY)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
}
