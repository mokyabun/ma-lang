import { createFileRoute } from '@tanstack/react-router'

import { AppShell } from '@/app/app-shell'

export const Route = createFileRoute('/_workspace/characters/')({ component: CharactersPage })

function CharactersPage() {
    return <AppShell page={{ kind: 'chat' }} />
}
