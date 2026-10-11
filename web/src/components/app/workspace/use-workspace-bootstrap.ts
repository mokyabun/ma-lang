import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'

import {
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    workspaceInitializedAtom,
    workspaceLoadingAtom,
} from '@/lib/store'
import type { WorkspacePage } from '@/lib/workspace-page'

import { loadWorkspaceAtom } from './atom'

export function useWorkspaceBootstrap(page: WorkspacePage) {
    const loadWorkspace = useSetAtom(loadWorkspaceAtom)
    const initialized = useAtomValue(workspaceInitializedAtom)
    const loading = useAtomValue(workspaceLoadingAtom)
    const selectedCharacterId = useAtomValue(selectedCharacterIdAtom)
    const selectedConversationId = useAtomValue(selectedConversationIdAtom)
    const requestedCharacterId = page.characterId
    const requestedConversationId = page.kind === 'chat' ? page.conversationId : undefined
    const requestKey = `${requestedCharacterId ?? ''}:${requestedConversationId ?? ''}`
    const lastRequestedKey = useRef<string | null>(null)

    useEffect(() => {
        if (loading) return

        const characterAlreadySelected =
            !requestedCharacterId || requestedCharacterId === selectedCharacterId
        const conversationAlreadySelected =
            !requestedConversationId || requestedConversationId === selectedConversationId
        if (initialized && characterAlreadySelected && conversationAlreadySelected) {
            lastRequestedKey.current = requestKey
            return
        }
        if (lastRequestedKey.current === requestKey) return

        lastRequestedKey.current = requestKey
        queueMicrotask(() => void loadWorkspace({ requestedCharacterId, requestedConversationId }))
    }, [
        loadWorkspace,
        initialized,
        loading,
        requestedCharacterId,
        requestedConversationId,
        requestKey,
        selectedCharacterId,
        selectedConversationId,
    ])
}
