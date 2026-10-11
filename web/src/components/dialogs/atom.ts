import { atom } from 'jotai'

export interface AppConfirmation {
    title: string
    description: string
    confirmLabel: string
    action: () => void | Promise<void>
}

export const confirmationAtom = atom<AppConfirmation | null>(null)

export interface AppLoading {
    message: string
    detail?: string
    /** 0–100, or null for an indeterminate spinner. */
    progress: number | null
}

export const loadingAtom = atom<AppLoading | null>(null)
