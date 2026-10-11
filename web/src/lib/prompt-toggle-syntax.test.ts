import { describe, expect, test } from 'bun:test'

import { PromptToggleSchema } from '@malang/shared'

import { parseToggleText, serializeToggleText } from './prompt-toggle-syntax'

describe('custom toggle text syntax', () => {
    const source = `=⚡ 기본 설정=group
show_note=메모 표시
mode=출력 모드=select=기본,상세
note=메모=text
instructions=추가 지시=textarea
=안내 문구=caption
=프롬프트=divider
==groupEnd`

    test('round-trips all supported types, Unicode, and layout rows', () => {
        const result = parseToggleText(source, [], 200)
        expect(result.errors).toEqual([])
        expect(result.toggles?.map((toggle) => toggle.type)).toEqual([
            'group',
            'boolean',
            'select',
            'text',
            'textarea',
            'caption',
            'divider',
            'groupEnd',
        ])
        expect(serializeToggleText(result.toggles!)).toBe(source)
    })

    test('accepts CRLF, blank lines, and boolean aliases', () => {
        const result = parseToggleText(
            '\r\na=첫 번째=boolean\r\n \r\nb=두 번째=toggle\r\n',
            [],
            200,
        )
        expect(result.errors).toEqual([])
        expect(result.toggles?.map((toggle) => toggle.type)).toEqual(['boolean', 'boolean'])
    })

    test('preserves defaults by key and type when changing labels, options, or order', () => {
        const previous = [
            PromptToggleSchema.parse({
                key: 'enabled',
                label: '이전 이름',
                type: 'boolean',
                defaultValue: '1',
            }),
            PromptToggleSchema.parse({
                key: 'note',
                label: '메모',
                type: 'textarea',
                defaultValue: '기존 내용\n둘째 줄',
            }),
            PromptToggleSchema.parse({
                key: 'mode',
                label: '모드',
                type: 'select',
                options: ['기본', '상세'],
                defaultValue: '1',
            }),
        ]
        const snapshot = structuredClone(previous)
        const result = parseToggleText(
            'mode=모드=select=기본,상세,추가\nnote=새 메모=textarea\nenabled=새 이름',
            previous,
            200,
        )
        expect(result.toggles?.map((toggle) => toggle.defaultValue)).toEqual([
            '1',
            '기존 내용\n둘째 줄',
            '1',
        ])
        expect(previous).toEqual(snapshot)
    })

    test('preserves unchanged records that contain legacy separator characters', () => {
        const previous = [
            PromptToggleSchema.parse({
                key: 'a',
                label: 'A=B',
                type: 'select',
                options: ['x,y', 'z'],
                defaultValue: '1',
            }),
        ]
        const result = parseToggleText(`${serializeToggleText(previous)}\nb=추가`, previous, 200)
        expect(result.toggles?.[0]).toEqual(previous[0])
        expect(result.toggles).toHaveLength(2)
    })

    test('reserves unchanged duplicate keys before matching edited rows', () => {
        const previous = [
            PromptToggleSchema.parse({
                key: 'same',
                label: '첫 번째',
                type: 'boolean',
                defaultValue: '1',
            }),
            PromptToggleSchema.parse({
                key: 'same',
                label: '두 번째',
                type: 'boolean',
                defaultValue: '0',
            }),
        ]
        const result = parseToggleText('same=두 번째 수정\nsame=첫 번째', previous, 200)
        expect(result.toggles?.map((toggle) => toggle.defaultValue)).toEqual(['0', '1'])
    })

    test('new keys and changed types receive appropriate defaults', () => {
        const previous = [
            PromptToggleSchema.parse({
                key: 'a',
                label: '이름',
                type: 'textarea',
                defaultValue: '메모',
            }),
        ]
        const result = parseToggleText('a=이름\nb=선택=select=하나,둘\nc=입력=text', previous, 200)
        expect(result.toggles?.map((toggle) => toggle.defaultValue)).toEqual(['0', '0', ''])
    })

    for (const [name, invalid] of [
        ['missing separator', 'broken'],
        ['unknown type', 'a=이름=invalid'],
        ['missing key', '=이름=text'],
        ['missing label', 'a==textarea'],
        ['extra fields', 'a=이름=text=unexpected'],
        ['extra separators', 'a=이름=select=one=two'],
        ['long key', `${'a'.repeat(101)}=이름`],
        ['long label', `a=${'가'.repeat(201)}`],
        ['long option', `a=선택=select=${'x'.repeat(501)}`],
        ['too many options', `a=선택=select=${Array.from({ length: 201 }, () => 'x').join(',')}`],
    ]) {
        test(`rejects ${name} without partially applying valid lines`, () => {
            const result = parseToggleText(`valid=정상\n\n${invalid}`, [], 200)
            expect(result.toggles).toBeNull()
            expect(result.errors[0]?.line).toBe(3)
        })
    }

    test('enforces separate module and preset limits without truncation', () => {
        const text = Array.from({ length: 201 }, (_, i) => `key${i}=토글 ${i}`).join('\n')
        expect(parseToggleText(text, [], 200).toggles).toBeNull()
        expect(parseToggleText(text, [], 1000).toggles).toHaveLength(201)
        expect(
            parseToggleText(text, parseToggleText(text, [], 1000).toggles!, 200).toggles,
        ).toBeNull()
    })

    test('an empty editor clears the list only when parsed for apply', () => {
        const previous = parseToggleText(source, [], 200).toggles!
        expect(parseToggleText(' \n', previous, 200).toggles).toEqual([])
        expect(previous).toHaveLength(8)
    })
})
