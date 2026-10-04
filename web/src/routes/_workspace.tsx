import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { LoadingDialog } from '@/components/app/dialogs/loading-dialog'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_workspace')({
    beforeLoad: async () => {
        try {
            await api.session()
        } catch {
            throw redirect({ to: '/login' })
        }
    },
    component: WorkspaceLayout,
})

function WorkspaceLayout() {
    return (
        <>
            <Outlet />
            <LoadingDialog />
        </>
    )
}
