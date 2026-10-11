import { createFileRoute, redirect } from '@tanstack/react-router'

import { SettingsWorkspace } from '@/features/settings/settings-workspace'
import { isSettingsSection, type SettingsSection } from '@/features/settings/types'

export const Route = createFileRoute('/_workspace/settings/$section')({
    beforeLoad: ({ params }) => {
        if (params.section === 'backup' || params.section === 'debug') {
            throw redirect({ to: '/settings/$section', params: { section: 'system' } })
        }
        if (!isSettingsSection(params.section)) {
            throw redirect({ to: '/settings/$section', params: { section: 'provider' } })
        }
    },
    component: SettingsPage,
})

function SettingsPage() {
    const { section } = Route.useParams()
    return <SettingsWorkspace section={section as SettingsSection} />
}
