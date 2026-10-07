import { describe, expect, test } from 'bun:test'

import { chatHotkeyAction, composerKeyHint, isConfirmKey, isSendKey } from './chat-shortcuts'

const key = (overrides: Partial<KeyboardEvent> = {}) => ({
    key: 'Enter',
    code: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
    ...overrides,
})

describe('isSendKey', () => {
    test('matches the configured combo exactly', () => {
        expect(isSendKey('enter', key())).toBe(true)
        expect(isSendKey('enter', key({ shiftKey: true }))).toBe(false)
        expect(isSendKey('enter', key({ altKey: true }))).toBe(false)
        expect(isSendKey('mod-enter', key({ ctrlKey: true }))).toBe(true)
        expect(isSendKey('mod-enter', key({ metaKey: true }))).toBe(true)
        expect(isSendKey('mod-enter', key())).toBe(false)
        expect(isSendKey('mod-enter', key({ ctrlKey: true, shiftKey: true }))).toBe(false)
        expect(isSendKey('shift-enter', key({ shiftKey: true }))).toBe(true)
        expect(isSendKey('shift-enter', key())).toBe(false)
        expect(isSendKey('button', key())).toBe(false)
        expect(isSendKey('enter', key({ key: 'a' }))).toBe(false)
    })

    test('confirms edits with Cmd or Ctrl + Enter only', () => {
        expect(isConfirmKey(key({ metaKey: true }))).toBe(true)
        expect(isConfirmKey(key({ ctrlKey: true }))).toBe(true)
        expect(isConfirmKey(key())).toBe(false)
    })
})

describe('chatHotkeyAction', () => {
    test('maps Ctrl+Alt hotkeys by physical key', () => {
        const hotkey = (code: string, overrides: Partial<KeyboardEvent> = {}) =>
            chatHotkeyAction(key({ code, key: '®', ctrlKey: true, altKey: true, ...overrides }))
        expect(hotkey('KeyR')).toBe('regenerate')
        expect(hotkey('KeyE')).toBe('edit')
        expect(hotkey('KeyD')).toBe('delete')
        expect(hotkey('KeyC')).toBe('copy')
        expect(hotkey('Enter')).toBe('send')
        expect(hotkey('KeyR', { shiftKey: true })).toBeNull()
        expect(hotkey('KeyR', { metaKey: true })).toBeNull()
        expect(hotkey('KeyR', { isComposing: true })).toBeNull()
        expect(hotkey('KeyR', { repeat: true })).toBeNull()
        expect(hotkey('KeyX')).toBeNull()
        expect(chatHotkeyAction(key({ code: 'KeyR', ctrlKey: true }))).toBeNull()
    })
})

test('describes the active send key in the composer hint', () => {
    expect(composerKeyHint('enter', true)).toBe('Enter 전송 · Shift + Enter 줄바꿈')
    expect(composerKeyHint('mod-enter', true)).toBe('⌘ + Enter 전송 · Enter 줄바꿈')
    expect(composerKeyHint('mod-enter', false)).toBe('Ctrl + Enter 전송 · Enter 줄바꿈')
})
