import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { zipSync } from 'fflate'

import { bufferSource, fileSource } from '@/services/import/source'
import { readZipDirectory, readZipEntry, ZipFormatError } from '@/services/import/zip'

const encoder = new TextEncoder()

function archive() {
    return zipSync({
        'card.json': [encoder.encode('{"spec":"chara_card_v3"}'), { level: 0 }],
        'assets/이미지.png': [new Uint8Array(4096).fill(7), { level: 9 }],
    })
}

describe('random-access ZIP reader', () => {
    test('lists entries and extracts stored and deflated data from memory or a file', async () => {
        const bytes = archive()
        const directory = mkdtempSync(join(tmpdir(), 'malang-zip-'))
        try {
            const path = join(directory, 'archive.zip')
            await Bun.write(path, bytes)
            for (const source of [bufferSource(bytes), fileSource(path, bytes.byteLength)]) {
                const entries = await readZipDirectory(source)
                expect(entries.map((entry) => [entry.name, entry.method])).toEqual([
                    ['card.json', 0],
                    ['assets/이미지.png', 8],
                ])
                expect(new TextDecoder().decode(await readZipEntry(source, entries[0]!))).toBe(
                    '{"spec":"chara_card_v3"}',
                )
                expect(await readZipEntry(source, entries[1]!)).toEqual(
                    new Uint8Array(4096).fill(7),
                )
            }
        } finally {
            rmSync(directory, { recursive: true, force: true })
        }
    })

    test('stops inflating once an entry exceeds its declared size', async () => {
        const source = bufferSource(archive())
        const [, image] = await readZipDirectory(source)
        expect(readZipEntry(source, { ...image!, size: 16 })).rejects.toThrow(
            'larger than declared',
        )
    })

    test('rejects data without a central directory', async () => {
        expect(readZipDirectory(bufferSource(new Uint8Array(64)))).rejects.toBeInstanceOf(
            ZipFormatError,
        )
    })
})
