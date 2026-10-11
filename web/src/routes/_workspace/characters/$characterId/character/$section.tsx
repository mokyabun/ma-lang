import { createFileRoute } from '@tanstack/react-router'

import { AppShell } from '@/app/app-shell'
import type { CharacterEditorSection } from '@/lib/workspace-page'

const sections = new Set<CharacterEditorSection>([
    'profile',
    'display',
    'greetings',
    'lorebook',
    'prompt',
    'illustration',
    'advanced',
])

export const Route = createFileRoute('/_workspace/characters/$characterId/character/$section')({
    component: CharacterEditorPage,
})

function CharacterEditorPage() {
    const { characterId, section: routeSection } = Route.useParams()
    const section = sections.has(routeSection as CharacterEditorSection)
        ? (routeSection as CharacterEditorSection)
        : 'profile'
    return <AppShell page={{ kind: 'character', characterId, section }} />
}
