export type SendKey = 'enter' | 'mod-enter' | 'shift-enter' | 'button'

export const SEND_KEYS: SendKey[] = ['enter', 'mod-enter', 'shift-enter', 'button']

export type ChatHotkeyAction = 'regenerate' | 'edit' | 'delete' | 'copy' | 'send'

type ModifierState = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>

/** PocketRisu shouldSendOnEnter: the configured combo must match exactly, so Alt+Enter etc. insert a newline. */
export function isSendKey(mode: SendKey, event: ModifierState): boolean {
    if (event.key !== 'Enter') return false
    const mod = event.ctrlKey || event.metaKey
    switch (mode) {
        case 'enter':
            return !event.shiftKey && !mod && !event.altKey
        case 'mod-enter':
            return mod && !event.shiftKey && !event.altKey
        case 'shift-enter':
            return event.shiftKey && !mod && !event.altKey
        case 'button':
            return false
    }
}

/** Confirms the inline message editor, where plain Enter must stay a newline. */
export function isConfirmKey(event: ModifierState): boolean {
    return isSendKey('mod-enter', event)
}

// PocketRisu's default chat hotkeys (Ctrl+Alt+key). Matched by `code` because macOS Option rewrites `key`.
const CHAT_HOTKEYS: Record<string, ChatHotkeyAction> = {
    KeyR: 'regenerate',
    KeyE: 'edit',
    KeyD: 'delete',
    KeyC: 'copy',
    Enter: 'send',
    NumpadEnter: 'send',
}

export function chatHotkeyAction(
    event: ModifierState & Pick<KeyboardEvent, 'code' | 'isComposing' | 'repeat'>,
): ChatHotkeyAction | null {
    if (event.isComposing || event.repeat) return null
    if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return null
    return CHAT_HOTKEYS[event.code] ?? null
}

export function defaultSendKey(): SendKey {
    // On-screen keyboards have no Shift+Enter habit, so Enter writes a newline there as in PocketRisu.
    return window.matchMedia('(pointer: coarse)').matches ? 'mod-enter' : 'enter'
}

export function isMac(): boolean {
    return /Mac|iPhone|iPad/.test(navigator.platform)
}

export function sendKeyLabel(mode: SendKey, mac = isMac()): string {
    const mod = mac ? '⌘' : 'Ctrl'
    switch (mode) {
        case 'enter':
            return 'Enter'
        case 'mod-enter':
            return `${mod} + Enter`
        case 'shift-enter':
            return 'Shift + Enter'
        case 'button':
            return '버튼으로만'
    }
}

export function chatHotkeyModifierLabel(mac = isMac()): string {
    return mac ? '⌃ + ⌥' : 'Ctrl + Alt'
}

export function composerKeyHint(mode: SendKey, mac = isMac()): string {
    if (mode === 'enter') return 'Enter 전송 · Shift + Enter 줄바꿈'
    if (mode === 'button') return 'Enter 줄바꿈 · 전송 버튼으로 보내기'
    return `${sendKeyLabel(mode, mac)} 전송 · Enter 줄바꿈`
}
