import { createFileRoute } from '@tanstack/react-router'

import { AppShell } from '@/app/app-shell'

export const Route = createFileRoute('/_workspace/characters/$characterId/chats/$conversationId')({
    component: ConversationPage,
})

function ConversationPage() {
    const { characterId, conversationId } = Route.useParams()
    return <AppShell page={{ kind: 'chat', characterId, conversationId }} />
}
