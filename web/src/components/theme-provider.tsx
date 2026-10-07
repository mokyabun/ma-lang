import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useLayoutEffect,
    useState,
} from 'react'

import { defaultSendKey, SEND_KEYS, type SendKey } from '@/lib/chat-shortcuts'

import { CHAT_APPEARANCE_DEFAULTS, CHAT_APPEARANCE_LIMITS } from './theme-preferences'

type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'malang-theme'
const CHAT_FONT_SIZE_STORAGE_KEY = 'malang-chat-font-size'
const CHAT_MAX_WIDTH_STORAGE_KEY = 'malang-chat-max-width'
const QUICK_SETTINGS_BUTTON_STORAGE_KEY = 'malang-quick-settings-button'
const SEND_KEY_STORAGE_KEY = 'malang-send-key'

const ThemeContext = createContext<{
    theme: Theme
    setTheme: (theme: Theme) => void
    chatFontSize: number
    setChatFontSize: (size: number) => void
    chatMaxWidth: number
    setChatMaxWidth: (width: number) => void
    quickSettingsButton: boolean
    setQuickSettingsButton: (visible: boolean) => void
    sendKey: SendKey
    setSendKey: (sendKey: SendKey) => void
    resetChatAppearance: () => void
} | null>(null)

function initialTheme(): Theme {
    if (typeof window === 'undefined') return 'dark'
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedNumber(key: string, minimum: number, maximum: number, fallback: number): number {
    if (typeof window === 'undefined') return fallback
    const stored = window.localStorage.getItem(key)
    if (stored === null) return fallback
    const value = Number(stored)
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback
}

function storedBoolean(key: string, fallback: boolean): boolean {
    if (typeof window === 'undefined') return fallback
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : stored === 'true'
}

// Unset until chosen, so the device-type default keeps applying.
function initialSendKey(): SendKey {
    if (typeof window === 'undefined') return 'enter'
    const stored = window.localStorage.getItem(SEND_KEY_STORAGE_KEY)
    return SEND_KEYS.find((key) => key === stored) ?? defaultSendKey()
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(initialTheme)
    const [chatFontSize, setChatFontSize] = useState(() =>
        storedNumber(
            CHAT_FONT_SIZE_STORAGE_KEY,
            CHAT_APPEARANCE_LIMITS.fontSize.min,
            CHAT_APPEARANCE_LIMITS.fontSize.max,
            CHAT_APPEARANCE_DEFAULTS.fontSize,
        ),
    )
    const [chatMaxWidth, setChatMaxWidth] = useState(() =>
        storedNumber(
            CHAT_MAX_WIDTH_STORAGE_KEY,
            CHAT_APPEARANCE_LIMITS.maxWidth.min,
            CHAT_APPEARANCE_LIMITS.maxWidth.max,
            CHAT_APPEARANCE_DEFAULTS.maxWidth,
        ),
    )
    const [quickSettingsButton, setQuickSettingsButton] = useState(() =>
        storedBoolean(
            QUICK_SETTINGS_BUTTON_STORAGE_KEY,
            CHAT_APPEARANCE_DEFAULTS.quickSettingsButton,
        ),
    )
    const [sendKey, setSendKeyState] = useState(initialSendKey)

    function setSendKey(next: SendKey) {
        setSendKeyState(next)
        window.localStorage.setItem(SEND_KEY_STORAGE_KEY, next)
    }

    useLayoutEffect(() => {
        const root = document.documentElement
        root.classList.toggle('dark', theme === 'dark')
        root.style.colorScheme = theme
        window.localStorage.setItem(THEME_STORAGE_KEY, theme)

        const themeColor = getComputedStyle(root).getPropertyValue('--background').trim()
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor)
    }, [theme])

    useLayoutEffect(() => {
        const root = document.documentElement
        root.style.setProperty('--malang-chat-font-size', `${chatFontSize}px`)
        root.style.setProperty('--malang-chat-max-width', `${chatMaxWidth}px`)
        window.localStorage.setItem(CHAT_FONT_SIZE_STORAGE_KEY, String(chatFontSize))
        window.localStorage.setItem(CHAT_MAX_WIDTH_STORAGE_KEY, String(chatMaxWidth))
    }, [chatFontSize, chatMaxWidth])

    useEffect(() => {
        window.localStorage.setItem(QUICK_SETTINGS_BUTTON_STORAGE_KEY, String(quickSettingsButton))
    }, [quickSettingsButton])

    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const handleSystemThemeChange = (event: MediaQueryListEvent) => {
            if (window.localStorage.getItem(THEME_STORAGE_KEY)) return
            setTheme(event.matches ? 'dark' : 'light')
        }
        media.addEventListener('change', handleSystemThemeChange)
        return () => media.removeEventListener('change', handleSystemThemeChange)
    }, [])

    function resetChatAppearance() {
        setChatFontSize(CHAT_APPEARANCE_DEFAULTS.fontSize)
        setChatMaxWidth(CHAT_APPEARANCE_DEFAULTS.maxWidth)
    }

    return (
        <ThemeContext.Provider
            value={{
                theme,
                setTheme,
                chatFontSize,
                setChatFontSize,
                chatMaxWidth,
                setChatMaxWidth,
                quickSettingsButton,
                setQuickSettingsButton,
                sendKey,
                setSendKey,
                resetChatAppearance,
            }}
        >
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) throw new Error('useTheme must be used inside ThemeProvider')
    return context
}
