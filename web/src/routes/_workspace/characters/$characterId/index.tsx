import { createFileRoute } from '@tanstack/react-router'

import { AppShell } from '@/app/app-shell'

export const Route = createFileRoute('/_workspace/characters/$characterId/')({
    component: CharacterPage,
})

function CharacterPage() {
    const { characterId } = Route.useParams()
    return <AppShell page={{ kind: 'chat', characterId }} />
}
