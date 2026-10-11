import { useAtomValue } from 'jotai'

import { ChatWorkspace } from '@/features/chat/chat-workspace'
import { workspaceInitializedAtom } from '@/lib/store'
import type { WorkspacePage } from '@/lib/workspace-page'

import { useWorkspaceBootstrap } from './use-workspace-bootstrap'
import { WorkspaceLoading } from './workspace-feedback'
import { WorkspaceLayout } from './workspace-layout'

export function AppShell({ page }: { page: WorkspacePage }) {
    useWorkspaceBootstrap(page)
    const initialized = useAtomValue(workspaceInitializedAtom)

    if (!initialized) return <WorkspaceLoading />

    return (
        <WorkspaceLayout>
            <ChatWorkspace page={page} />
        </WorkspaceLayout>
    )
}
