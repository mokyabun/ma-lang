import { DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { promptRegexExportUrl } from '@/lib/api'

export function PresetRegexActions({
    presetId,
    onImport,
}: {
    presetId: string
    onImport: (file: File) => Promise<void>
}) {
    const importRef = useRef<HTMLInputElement>(null)
    return (
        <>
            <Input
                ref={importRef}
                className="sr-only"
                type="file"
                accept=".json"
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void onImport(file)
                }}
            />
            <Button size="lg" variant="outline" onClick={() => importRef.current?.click()}>
                <UploadSimple /> Regex 추가
            </Button>
            <Button
                size="lg"
                variant="outline"
                render={
                    <a
                        href={promptRegexExportUrl(presetId)}
                        download
                        aria-label="정규식 내보내기"
                    />
                }
            >
                <DownloadSimple /> Regex 내보내기
            </Button>
        </>
    )
}
