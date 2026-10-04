import { describe, expect, test } from 'bun:test'

import type { AppLoading } from './atom'
import { withImportProgress } from './import-progress'

describe('import progress', () => {
    test('walks a module import from upload bytes to asset X/Y, then clears', async () => {
        const states: Array<AppLoading | null> = []
        const result = await withImportProgress(
            (loading) => states.push(loading),
            new File([new Uint8Array(2048)], 'moon.module.charx'),
            async (onProgress) => {
                onProgress({ phase: 'upload', loaded: 1024, total: 2048 })
                onProgress({ phase: 'upload', loaded: 2048, total: 2048 })
                onProgress({ phase: 'reading' })
                onProgress({ phase: 'assets', done: 3, total: 12 })
                return 'module'
            },
        )

        expect(result).toBe('module')
        expect(states).toEqual([
            { message: 'moon.module.charx 업로드 중', detail: '0 B / 2.0 KiB', progress: 0 },
            { message: 'moon.module.charx 업로드 중', detail: '1.0 KiB / 2.0 KiB', progress: 50 },
            { message: 'moon.module.charx 처리 중', detail: '가져오기 준비 중…', progress: null },
            { message: 'moon.module.charx 처리 중', detail: '파일 분석 중…', progress: null },
            { message: 'moon.module.charx 처리 중', detail: '에셋 저장 중 (3/12)', progress: 25 },
            null,
        ])
    })

    test('clears the dialog when the import fails', async () => {
        const states: Array<AppLoading | null> = []
        const failure = await withImportProgress(
            (loading) => states.push(loading),
            new File([], 'broken.risum'),
            async () => {
                throw new Error('Invalid .risum')
            },
        ).catch((error: Error) => error.message)
        expect(failure).toBe('Invalid .risum')
        expect(states.at(-1)).toBeNull()
    })
})
