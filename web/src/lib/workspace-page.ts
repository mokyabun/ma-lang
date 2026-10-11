export type CharacterEditorSection =
    | 'profile'
    | 'display'
    | 'greetings'
    | 'lorebook'
    | 'prompt'
    | 'illustration'
    | 'advanced'

export type WorkspacePage =
    | { kind: 'chat'; characterId?: string; conversationId?: string }
    | { kind: 'character'; characterId: string; section: CharacterEditorSection }
