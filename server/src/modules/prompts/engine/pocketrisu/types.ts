/** PocketRisu's OpenAIChat (process/index.svelte.ts), minus multimodal fields. */
export interface RisuChat {
    role: 'system' | 'user' | 'assistant'
    content: string
    memo?: string
    name?: string
    removable?: boolean
    attr?: string[]
    thoughts?: string[]
    /** Malang: the stored message this turn came from. */
    sourceMessageId?: string
}

/** PocketRisu's internal lorebook entry (storage/database.svelte.ts `loreBook`). */
export interface RisuLore {
    key: string
    secondkey: string
    insertorder: number
    comment: string
    content: string
    mode: 'multiple' | 'constant' | 'normal' | 'child' | 'folder'
    alwaysActive: boolean
    selective: boolean
    useRegex?: boolean
    id?: string
    /** Malang: the lore entry this was converted from. */
    sourceId: string
}
