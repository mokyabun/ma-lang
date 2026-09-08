import type { AppSettings, ModelApiKey, ModelPreset } from '@malang/shared'
import { useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'

import { SectionHeading } from '../../page-heading'
import { type Notice, NoticeBox } from '../shared/notice-box'
import { ApiKeyCatalog } from './api-key-catalog'
import { ApiKeyEditor } from './api-key-editor'
import { PresetCatalog } from './preset-catalog'
import { PresetEditor } from './preset-editor'

export function ModelPresetSection({
    presets,
    apiKeys,
    settings,
    onCatalogChanged,
    onSettingsChange,
}: {
    presets: ModelPreset[]
    apiKeys: ModelApiKey[]
    settings: AppSettings | null
    onCatalogChanged: (presets: ModelPreset[], apiKeys: ModelApiKey[]) => void
    onSettingsChange: (settings: AppSettings) => void
}) {
    const [tab, setTab] = useState<'presets' | 'keys'>('presets')
    const [presetId, setPresetId] = useState<string | null>(presets[0]?.id ?? null)
    const [presetDialogOpen, setPresetDialogOpen] = useState(false)
    const [keyId, setKeyId] = useState<string | null>(apiKeys[0]?.id ?? null)
    const [keyDialogOpen, setKeyDialogOpen] = useState(false)
    const [importing, setImporting] = useState(false)
    const [importNotice, setImportNotice] = useState<Notice>(null)

    async function refresh() {
        const catalog = await api.modelCatalog()
        onCatalogChanged(catalog.presets, catalog.apiKeys)
        return catalog
    }

    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading className="mb-5 pr-12 [&_h2]:text-2xl" title="모델 프리셋" />
                <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
                    <TabsList variant="line" className="mb-5">
                        <TabsTrigger value="presets">프리셋</TabsTrigger>
                        <TabsTrigger value="keys">API 키 관리</TabsTrigger>
                    </TabsList>
                    <TabsContent value="presets">
                        <PresetCatalog
                            items={presets.map((preset) => ({
                                id: preset.id,
                                title: preset.name,
                                detail: `${preset.config.provider}:${preset.config.modelId}`,
                                badge:
                                    settings?.defaultModelPresetId === preset.id
                                        ? '기본 모델'
                                        : undefined,
                            }))}
                            empty="저장된 모델 프리셋이 없습니다."
                            onSelect={(id) => {
                                setPresetId(id)
                                setPresetDialogOpen(true)
                            }}
                            onAdd={() => {
                                setPresetId(null)
                                setPresetDialogOpen(true)
                            }}
                            importing={importing}
                            onImport={async (files) => {
                                setImporting(true)
                                setImportNotice(null)
                                try {
                                    const imported: ModelPreset[] = []
                                    const failures: string[] = []
                                    for (const file of files) {
                                        try {
                                            imported.push(await api.importModelPreset(file))
                                        } catch (cause) {
                                            failures.push(
                                                `${file.name}: ${
                                                    cause instanceof Error
                                                        ? cause.message
                                                        : '가져오기 실패'
                                                }`,
                                            )
                                        }
                                    }
                                    await refresh()
                                    const latest = imported.at(-1)
                                    if (latest) {
                                        setPresetId(latest.id)
                                        setPresetDialogOpen(true)
                                    }
                                    setImportNotice({
                                        tone: failures.length ? 'error' : 'success',
                                        text: failures.length
                                            ? `${imported.length}개를 가져왔고 ${failures.length}개는 실패했습니다. ${failures.join(' / ')}`
                                            : `모델 프로필 ${imported.length}개를 가져왔습니다.`,
                                    })
                                } catch (cause) {
                                    setImportNotice({
                                        tone: 'error',
                                        text:
                                            cause instanceof Error
                                                ? cause.message
                                                : '모델 프로필을 가져오지 못했습니다.',
                                    })
                                } finally {
                                    setImporting(false)
                                }
                            }}
                        />
                        <NoticeBox notice={importNotice} />
                        <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
                            <DialogContent className="max-h-[min(50rem,calc(100dvh-2rem))] w-[min(46rem,calc(100%-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-card p-0 sm:max-w-none">
                                <DialogHeader className="border-b border-border px-6 py-5 pr-14">
                                    <DialogTitle className="font-serif text-xl">
                                        {presetId ? '모델 프리셋 변경' : '새 모델 프리셋'}
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="min-h-0 overflow-y-auto">
                                    <PresetEditor
                                        key={presetId ?? 'new'}
                                        preset={
                                            presets.find((item) => item.id === presetId) ?? null
                                        }
                                        apiKeys={apiKeys}
                                        isDefault={settings?.defaultModelPresetId === presetId}
                                        onSaved={async (id) => {
                                            const catalog = await refresh()
                                            setPresetId(
                                                catalog.presets.some((item) => item.id === id)
                                                    ? id
                                                    : (catalog.presets[0]?.id ?? null),
                                            )
                                            setPresetDialogOpen(false)
                                        }}
                                        onDeleted={async () => {
                                            const catalog = await refresh()
                                            setPresetId(catalog.presets[0]?.id ?? null)
                                            setPresetDialogOpen(false)
                                        }}
                                        onMakeDefault={async (id) =>
                                            onSettingsChange(
                                                await api.updateSettings({
                                                    defaultModelPresetId: id,
                                                }),
                                            )
                                        }
                                    />
                                </div>
                            </DialogContent>
                        </Dialog>
                    </TabsContent>
                    <TabsContent value="keys">
                        <ApiKeyCatalog
                            items={apiKeys.map((item) => ({
                                id: item.id,
                                title: item.name,
                                detail: `${item.provider} · ${item.hint}`,
                            }))}
                            onSelect={(id) => {
                                setKeyId(id)
                                setKeyDialogOpen(true)
                            }}
                            onAdd={() => {
                                setKeyId(null)
                                setKeyDialogOpen(true)
                            }}
                        />
                        <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
                            <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] w-[min(40rem,calc(100%-2rem))] max-w-none overflow-y-auto bg-card p-0 sm:max-w-none">
                                <ApiKeyEditor
                                    key={keyId ?? 'new'}
                                    credential={apiKeys.find((item) => item.id === keyId) ?? null}
                                    onSaved={async (id) => {
                                        const catalog = await refresh()
                                        setKeyId(
                                            catalog.apiKeys.some((item) => item.id === id)
                                                ? id
                                                : (catalog.apiKeys[0]?.id ?? null),
                                        )
                                        setKeyDialogOpen(false)
                                    }}
                                    onDeleted={async () => {
                                        const catalog = await refresh()
                                        setKeyId(catalog.apiKeys[0]?.id ?? null)
                                        setKeyDialogOpen(false)
                                    }}
                                />
                            </DialogContent>
                        </Dialog>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
