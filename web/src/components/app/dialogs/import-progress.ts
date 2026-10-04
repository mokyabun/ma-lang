import type { ImportProgress } from '@/lib/api'

import { formatBytes } from '../character/model'
import type { AppLoading } from './atom'

/**
 * Drives the blocking loading dialog through an import, like PocketRisu's import modal: a byte
 * progress bar while uploading, then the server's stages up to "에셋 저장 중 (X/Y)".
 */
export async function withImportProgress<T>(
    setLoading: (loading: AppLoading | null) => void,
    file: File,
    run: (onProgress: (progress: ImportProgress) => void) => Promise<T>,
): Promise<T> {
    const processing = `${file.name} 처리 중`
    setLoading({
        message: `${file.name} 업로드 중`,
        detail: `0 B / ${formatBytes(file.size)}`,
        progress: 0,
    })
    try {
        return await run((progress) => {
            if (progress.phase === 'upload') {
                setLoading(
                    progress.loaded < progress.total
                        ? {
                              message: `${file.name} 업로드 중`,
                              detail: `${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`,
                              progress: (progress.loaded / progress.total) * 100,
                          }
                        : {
                              message: processing,
                              detail: '가져오기 준비 중…',
                              progress: null,
                          },
                )
            } else if (progress.phase === 'reading') {
                setLoading({ message: processing, detail: '파일 분석 중…', progress: null })
            } else {
                setLoading({
                    message: processing,
                    detail: `에셋 저장 중 (${progress.done}/${progress.total})`,
                    progress: (progress.done / progress.total) * 100,
                })
            }
        })
    } finally {
        setLoading(null)
    }
}
